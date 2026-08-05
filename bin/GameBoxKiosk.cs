using System;
using System.Drawing;
using System.Windows.Forms;
using System.IO;

class GameBoxKiosk
{
    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Form form = new Form();
        form.FormBorderStyle = FormBorderStyle.None;
        form.WindowState = FormWindowState.Maximized;
        form.TopMost = true;
        form.StartPosition = FormStartPosition.Manual;
        form.ShowInTaskbar = false;
        form.BackColor = Color.FromArgb(8, 10, 15);
        string img = @"C:\GameBox\bin\background.png";
        if (File.Exists(img))
        {
            try { form.BackgroundImage = Image.FromFile(img); form.BackgroundImageLayout = ImageLayout.Stretch; }
            catch { }
        }
        Application.Run(form);
    }
}
