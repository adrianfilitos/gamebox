using System;
using System.Diagnostics;
using System.Threading;
using System.IO;

class GameBoxKiosk
{
    static void Main()
    {
        string chrome = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
        string args = "--app=https://localhost:4443 --ignore-certificate-errors --start-maximized --no-first-run --no-default-browser-check --kiosk";
        string log = @"C:\GameBox\bin\kiosk.log";
        while (true)
        {
            try
            {
                if (Process.GetProcessesByName("chrome").Length == 0)
                {
                    Process.Start(chrome, args);
                }
                Thread.Sleep(2000);
            }
            catch (Exception e)
            {
                try { File.AppendAllText(log, DateTime.Now.ToString("s") + " " + e.Message + "\r\n"); } catch { }
                Thread.Sleep(3000);
            }
        }
    }
}
