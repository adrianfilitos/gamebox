using System.Diagnostics;
using System.IO.Compression;
using System.Text;
using System.Text.Json;

namespace GameBoxSetup;

public class Options
{
    public bool Silent { get; set; }
    public bool NoStart { get; set; }
    public bool AutoStart { get; set; }
    public bool DesktopShortcut { get; set; } = true;
    public string InstallDir { get; set; } = "";
    public int Port { get; set; } = 4443;
    public string LaunchMode { get; set; } = "user";
}

// Lógica compartida entre el instalador gráfico y el modo silencioso.
public static class InstallerLogic
{
    public const string PackageResource = "GameBoxSetup.package.zip";
    public const string AppVersion = "2.0.0";

    // Si es true, las operaciones con efectos (extracción, arranque, accesos) se simulan.
    public static bool DryRun { get; set; }

    public static string RunPs(string script)
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
        p.WaitForExit(20000);
        return outp;
    }

    public static void ExtractPackage(string installDir, Action<string>? status = null)
    {
        if (DryRun) { status?.Invoke("Paquete extraído (simulación)."); return; }
        status?.Invoke("Extrayendo el paquete…");
        using var stream = typeof(InstallerLogic).Assembly.GetManifestResourceStream(PackageResource)
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

    public static List<DepResult> CheckDeps(string installDir, int port)
    {
        var list = new List<DepResult>();
        list.Add(new DepResult("Node.js (integrado)", File.Exists(Path.Combine(installDir, "node", "node.exe")), "Incluido en el instalador"));
        list.Add(new DepResult("Puerto " + port, !PortInUse(port), PortInUse(port) ? "En uso, se usará otro" : "Libre"));
        list.Add(new DepResult("Sunshine (streaming)", IsListening(47990), IsListening(47990) ? "Activo" : "No instalado (opcional)"));
        var vi = RunPs("(Get-Service -Name 'ViGEmBus' -ErrorAction SilentlyContinue).Status");
        list.Add(new DepResult("ViGEmBus (mandos)", vi.Contains("Running"), string.IsNullOrEmpty(vi) ? "No instalado (opcional)" : (vi.Contains("Running") ? "Activo" : "Instalado")));
        return list;
    }

    public static bool IsListening(int port)
    {
        try
        {
            var used = RunPs($"(Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count");
            return used.Trim() != "0";
        }
        catch { return false; }
    }

    public static bool PortInUse(int port) => IsListening(port);

    public static int NextFreePort(int from)
    {
        for (int p = from; p < from + 50; p++) if (!PortInUse(p)) return p;
        return from + 50;
    }

    public static bool IsGameBoxUp(int port)
    {
        try
        {
            using var handler = new HttpClientHandler();
            handler.ServerCertificateCustomValidationCallback = (m, c, ch, e) => true;
            using var hc = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(3) };
            return hc.GetStringAsync("https://localhost:" + port + "/api/app").Result.Contains("GameBox");
        }
        catch { return false; }
    }

    public static object BuildConfig(Options o)
    {
        return new
        {
            app = new { name = "GameBox", version = AppVersion, port = o.Port, taskName = "GameBox-App", startScript = "GameBox.cmd" },
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

    public static void WriteConfig(string installDir, object config)
    {
        var json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(Path.Combine(installDir, "app", "config.json"), json, new UTF8Encoding(false));
    }

    public static void CreateShortcuts(string installDir, bool desktop = true)
    {
        if (DryRun) return;
        var target = Path.Combine(installDir, "GameBox.cmd");
        var wd = installDir.Replace("'", "''");
        var t = target.Replace("'", "''");
        var script =
            "$ErrorActionPreference='SilentlyContinue'\n" +
            "$ws = New-Object -ComObject WScript.Shell\n" +
            $"$t='{t}'\n" +
            $"$s=$ws.CreateShortcut((Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\GameBox.lnk'))\n" +
            "$s.TargetPath=$t\n$s.WorkingDirectory='" + wd + "'\n$s.Description='GameBox - consola de juegos en la nube'\n$s.Save()\n" +
            (desktop
                ? "$s=$ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'GameBox.lnk'))\n$s.TargetPath=$t\n$s.WorkingDirectory='" + wd + "'\n$s.Description='GameBox - consola de juegos en la nube'\n$s.Save()\n"
                : "");
        RunPs(script);
    }

    public static void CreateAutoStart(string installDir)
    {
        if (DryRun) return;
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
        p.StandardOutput.ReadToEnd();
        p.StandardError.ReadToEnd();
        p.WaitForExit(20000);
    }

    // Arranca la app y espera a que responda. Devuelve true si quedó operativa.
    public static bool StartApp(string installDir, int port, Action<string>? status = null)
    {
        if (DryRun) { status?.Invoke("GameBox operativo (simulación)."); return true; }
        if (IsGameBoxUp(port)) return true;
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

        status?.Invoke("Arrancando GameBox…");
        for (int i = 0; i < 30; i++)
        {
            Thread.Sleep(1000);
            if (IsGameBoxUp(port)) { status?.Invoke("GameBox operativo."); return true; }
        }
        return false;
    }
}

public class DepResult
{
    public string Name { get; }
    public bool Ok { get; }
    public string Detail { get; }
    public DepResult(string name, bool ok, string detail) { Name = name; Ok = ok; Detail = detail; }
}
