using System.Diagnostics;
using System.IO.Compression;
using System.Text;
using System.Text.Json;

namespace GameBoxSetup;

class Options
{
    public bool Silent { get; set; }
    public bool NoStart { get; set; }
    public bool AutoStart { get; set; }
    public bool AutoStartSet { get; set; }
    public string InstallDir { get; set; } = "";
    public int Port { get; set; } = 4443;
    public string LaunchMode { get; set; } = "user";
}

class Program
{
    const string PackageResource = "GameBoxSetup.package.zip";
    const string AppVersion = "2.0.0";

    static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        var opts = ParseArgs(args);

        if (opts is null)
        {
            PrintHelp();
            return 1;
        }

        try
        {
            if (!opts.Silent) Banner();

            var installDir = ResolveInstallDir(opts);
            if (string.IsNullOrEmpty(installDir)) return 1;

            if (Directory.Exists(Path.Combine(installDir, "app")) && !opts.Silent)
            {
                Console.WriteLine($"\n  Ya hay una instalación en: {installDir}");
                Console.Write("  ¿Reinstalar (sobrescribir)? [s/N]: ");
                if (!IsYes(Console.ReadLine())) return 0;
            }

            Console.WriteLine($"\n  Instalando en: {installDir}");
            Directory.CreateDirectory(installDir);
            ExtractPackage(installDir);

            Console.WriteLine("  Paquete extraído correctamente.");
            CheckDependencies(opts.Port);

            var config = BuildConfig(opts);
            WriteConfig(installDir, config);

            if (opts.AutoStart) CreateAutoStart(installDir);

            if (!opts.NoStart)
            {
                StartApp(installDir, opts.Port);
            }

            Console.WriteLine("\n  ✔ Instalación completada.");
            Console.WriteLine($"    Web:     https://localhost:{opts.Port}");
            Console.WriteLine($"    Carpeta: {installDir}");
            Console.WriteLine("  Añade GameBox a la pantalla de inicio de tu dispositivo para usarlo a pantalla completa.\n");
            return 0;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"\n  [Error] {ex.Message}");
            return 1;
        }
    }

    static Options? ParseArgs(string[] args)
    {
        var o = new Options();
        foreach (var a in args)
        {
            var lower = a.ToLowerInvariant();
            if (lower == "/s" || lower == "-s" || lower == "--silent") o.Silent = true;
            else if (lower == "/nostart" || lower == "--nostart") o.NoStart = true;
            else if (lower == "/?" || lower == "-?" || lower == "/h" || lower == "--help") return null;
            else if (lower.StartsWith("/dir=")) o.InstallDir = a.Substring(5).Trim('"');
            else if (lower.StartsWith("/port=")) { int.TryParse(a.Substring(6), out var p); o.Port = p; if (o.Port < 1 || o.Port > 65535) o.Port = 4443; }
            else if (lower.StartsWith("/autostart=")) { o.AutoStart = a.Substring(11) == "1"; o.AutoStartSet = true; }
            else if (lower.StartsWith("/launchmode=")) o.LaunchMode = a.Substring(12).ToLowerInvariant();
        }
        if (o.Port == 0) o.Port = 4443;
        return o;
    }

    static void PrintHelp()
    {
        Console.WriteLine(@"
  GameBox Setup v2.0.0

  USO:
    GameBoxSetup.exe                 Instalación guiada
    GameBoxSetup.exe /S              Instalación silenciosa (opciones por defecto)
    GameBoxSetup.exe /Dir=""C:\GameBox"" /Port=4443 /AutoStart=1 /NoStart

  OPCIONES:
    /S             Instalación silenciosa
    /Dir=<ruta>    Carpeta de instalación (defecto: %LocalAppData%\GameBox)
    /Port=<n>      Puerto HTTPS del portal (defecto: 4443)
    /AutoStart=1   Inicia con Windows
    /LaunchMode=   user | system  (defecto: user)
    /NoStart       No abrir el navegador al terminar
    /?             Esta ayuda
");
    }

    static void Banner()
    {
        Console.WriteLine();
        Console.WriteLine("  ┌──────────────────────────────────────────┐");
        Console.WriteLine("  │              G A M E B O X                │");
        Console.WriteLine("  │   Tu consola de juegos en la nube         │");
        Console.WriteLine("  └──────────────────────────────────────────┘");
        Console.WriteLine();
    }

    static string ResolveInstallDir(Options o)
    {
        var dir = o.InstallDir;
        if (string.IsNullOrWhiteSpace(dir))
        {
            if (o.Silent)
            {
                dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GameBox");
            }
            else
            {
                var def = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GameBox");
                Console.Write($"  Carpeta de instalación [{def}]: ");
                var input = Console.ReadLine()?.Trim().Trim('"');
                if (!string.IsNullOrEmpty(input)) dir = input;
                else dir = def;
            }
        }
        return dir;
    }

    static void ExtractPackage(string installDir)
    {
        using var stream = typeof(Program).Assembly.GetManifestResourceStream(PackageResource)
            ?? throw new Exception("No se encontró el paquete embebido.");
        var tmp = Path.Combine(Path.GetTempPath(), "gamebox-setup-" + Guid.NewGuid().ToString("N") + ".zip");
        try
        {
            using (var fs = File.Create(tmp)) stream.CopyTo(fs);
            ZipFile.ExtractToDirectory(tmp, installDir, overwriteFiles: true);
        }
        finally
        {
            try { File.Delete(tmp); } catch { }
        }
        if (!File.Exists(Path.Combine(installDir, "app", "server.js")))
            throw new Exception("El paquete no contiene la aplicación (falta app/server.js).");
    }

    static void CheckDependencies(int port)
    {
        Console.WriteLine("\n  Comprobación de dependencias:");
        Check("Node.js (integrado)", () => File.Exists(Path.Combine(Path.GetTempPath(), "x")) ? "" : "Incluido en el instalador ✔");
        Check("Puerto " + port, () =>
        {
            var used = RunPs($"(Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count");
            return used.Trim() == "0" ? "Libre ✔" : "En uso (¿ya está instalado?)";
        });
        Check("Sunshine (streaming)", () =>
        {
            var used = RunPs("(Get-NetTCPConnection -LocalPort 47990 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count");
            return used.Trim() == "0" ? "No instalado (opcional)" : "Activo ✔";
        });
        Check("ViGEmBus (mandos)", () =>
        {
            var s = RunPs("(Get-Service -Name 'ViGEmBus' -ErrorAction SilentlyContinue).Status");
            return string.IsNullOrEmpty(s) ? "No instalado (opcional)" : (s.Contains("Running") ? "Activo ✔" : "Instalado");
        });
        Console.WriteLine();
    }

    static void Check(string name, Func<string> check)
    {
        string status;
        try { status = check(); } catch { status = "?"; }
        Console.WriteLine($"    • {name,-26} {status}");
    }

    static string RunPs(string script)
    {
        var psi = new ProcessStartInfo("powershell.exe")
        {
            Arguments = "-NoProfile -NonInteractive -Command \"" + script + "\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            StandardOutputEncoding = Encoding.UTF8,
        };
        using var p = Process.Start(psi)!;
        var outp = p.StandardOutput.ReadToEnd();
        p.WaitForExit(15000);
        return outp;
    }

    static object BuildConfig(Options o)
    {
        return new
        {
            app = new
            {
                name = "GameBox",
                version = AppVersion,
                port = o.Port,
                taskName = "GameBox-App",
                startScript = "GameBox.cmd"
            },
            settings = new
            {
                launchMode = o.LaunchMode,
                autoStart = o.AutoStart,
                checkUpdates = true,
                updateManifest = "https://raw.githubusercontent.com/adrianfilitos/gamebox/main/update.json",
                scanOnStart = true,
                language = "es",
                wizardCompleted = false
            }
        };
    }

    static void WriteConfig(string installDir, object config)
    {
        var json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(Path.Combine(installDir, "app", "config.json"), json, new UTF8Encoding(false));
    }

    static void CreateAutoStart(string installDir)
    {
        var cmd = Path.Combine(installDir, "GameBox.cmd");
        var tr = $"\"cmd.exe\" /c \"{cmd}\"";
        var psi = new ProcessStartInfo("schtasks.exe")
        {
            Arguments = $"/Create /F /TN \"GameBox-App\" /TR \"{tr}\" /SC ONLOGON /RL LIMITED /IT",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        using var p = Process.Start(psi)!;
        var outp = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
        p.WaitForExit(20000);
        Console.WriteLine(outp.Trim());
    }

    static void StartApp(string installDir, int port)
    {
        var cmd = Path.Combine(installDir, "GameBox.cmd");
        try
        {
            var psi = new ProcessStartInfo("cmd.exe")
            {
                Arguments = $"/c start \"\" /b \"{cmd}\"",
                UseShellExecute = true,
                CreateNoWindow = true,
                WorkingDirectory = installDir,
            };
            Process.Start(psi);
        }
        catch { }

        Thread.Sleep(4000);
        try
        {
            var url = $"https://localhost:{port}";
            Process.Start(new ProcessStartInfo("cmd.exe", $"/c start \"\" \"{url}\"") { UseShellExecute = true, CreateNoWindow = true });
        }
        catch { }
    }

    static bool IsYes(string? input)
    {
        var v = (input ?? "").Trim().ToLowerInvariant();
        return v == "s" || v == "y" || v == "si" || v == "yes";
    }
}
