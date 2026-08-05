using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace GameBoxSetup;

static class Program
{
    [DllImport("kernel32.dll")]
    private static extern bool AttachConsole(int dwProcessId);
    private const int ATTACH_PARENT_PROCESS = -1;

    [STAThread]
    static int Main(string[] args)
    {
        var opts = ParseArgs(args);
        if (opts is null)
        {
            PrintHelp();
            return 1;
        }

        if (opts.Silent)
        {
            AttachConsole(ATTACH_PARENT_PROCESS);
            return SilentInstall.Run(opts);
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.Run(new InstallerForm(opts));
        return 0;
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
            else if (lower.StartsWith("/autostart=")) { o.AutoStart = a.Substring(11) == "1"; }
            else if (lower.StartsWith("/launchmode=")) o.LaunchMode = a.Substring(12).ToLowerInvariant();
        }
        if (o.Port == 0) o.Port = 4443;
        return o;
    }

    static void PrintHelp()
    {
        Console.WriteLine(@"
  GameBox Setup v2.0

  USO:
    GameBoxSetup.exe                  Instalación gráfica guiada
    GameBoxSetup.exe /S               Instalación silenciosa (opciones por defecto)
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
}

static class SilentInstall
{
    public static int Run(Options o)
    {
        try
        {
            var installDir = o.InstallDir;
            if (string.IsNullOrWhiteSpace(installDir))
                installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GameBox");

            Console.WriteLine("Instalando GameBox en: " + installDir);
            Directory.CreateDirectory(installDir);
            InstallerLogic.ExtractPackage(installDir);

            o.Port = ResolvePortSilent(o);
            var deps = InstallerLogic.CheckDeps(installDir, o.Port);
            foreach (var d in deps) Console.WriteLine("  • " + d.Name + " - " + (d.Ok ? "OK" : "AVISO") + " (" + d.Detail + ")");

            InstallerLogic.WriteConfig(installDir, InstallerLogic.BuildConfig(o));
            InstallerLogic.CreateShortcuts(installDir, o.DesktopShortcut);
            if (o.AutoStart) InstallerLogic.CreateAutoStart(installDir);
            if (!o.NoStart) InstallerLogic.StartApp(installDir, o.Port);

            Console.WriteLine("Instalación completada. Web: https://localhost:" + o.Port);
            return 0;
        }
        catch (Exception ex)
        {
            Console.WriteLine("Error: " + ex.Message);
            return 1;
        }
    }

    static int ResolvePortSilent(Options o)
    {
        if (!InstallerLogic.PortInUse(o.Port)) return o.Port;
        if (InstallerLogic.IsGameBoxUp(o.Port)) return o.Port;
        var next = InstallerLogic.NextFreePort(o.Port);
        Console.WriteLine("  El puerto " + o.Port + " está en uso. Se usará el " + next + ".");
        return next;
    }
}
