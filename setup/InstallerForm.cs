using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace GameBoxSetup;

public static class Colors
{
    public static readonly Color Bg = Color.FromArgb(11, 14, 20);
    public static readonly Color Panel = Color.FromArgb(19, 24, 36);
    public static readonly Color Panel2 = Color.FromArgb(26, 33, 48);
    public static readonly Color Border = Color.FromArgb(35, 44, 61);
    public static readonly Color Text = Color.FromArgb(230, 233, 240);
    public static readonly Color Muted = Color.FromArgb(139, 148, 167);
    public static readonly Color Primary = Color.FromArgb(123, 92, 255);
    public static readonly Color Primary2 = Color.FromArgb(157, 125, 255);
    public static readonly Color Accent = Color.FromArgb(34, 211, 165);
    public static readonly Color Danger = Color.FromArgb(244, 83, 90);
    public static readonly Color Warn = Color.FromArgb(245, 185, 66);
}

public static class Ui
{
    public static GraphicsPath Rounded(Rectangle r, int rad)
    {
        var p = new GraphicsPath();
        int d = rad * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    public static Font Font(float size, bool bold = false) =>
        new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular);

    // Calcula la altura que necesita un texto con ajuste de línea a una anchura dada.
    public static int MeasureHeight(string text, Font font, int width, bool centered)
    {
        var flags = TextFormatFlags.WordBreak | (centered ? TextFormatFlags.HorizontalCenter : 0);
        return TextRenderer.MeasureText(text, font, new Size(width, 4000), flags).Height;
    }
}

public class ModernButton : Control
{
    private bool _hover, _down;
    public bool Accent { get; set; }
    public bool Ghost { get; set; }
    public bool Danger { get; set; }
    public int Radius { get; set; } = 10;

    public ModernButton(string text)
    {
        Text = text;
        Height = 44;
        Width = 140;
        Cursor = Cursors.Hand;
        Font = Ui.Font(10.5f, true);
        ForeColor = Color.White;
        DoubleBuffered = true;
    }

    protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { _hover = false; _down = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnMouseDown(MouseEventArgs e) { _down = true; Invalidate(); base.OnMouseDown(e); }
    protected override void OnMouseUp(MouseEventArgs e) { _down = false; Invalidate(); base.OnMouseUp(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var r = ClientRectangle;
        r.Inflate(-1, -1);

        Color fill;
        if (Danger) fill = Colors.Danger;
        else if (Ghost) fill = _hover ? Color.FromArgb(32, 42, 64) : Colors.Panel2;
        else fill = _hover ? Colors.Primary2 : Colors.Primary;
        if (_down) fill = ControlPaint.Dark(fill, 0.08f);

        using var path = Ui.Rounded(r, Radius);
        if (Accent)
        {
            using var b = new LinearGradientBrush(r, Colors.Primary, Colors.Accent, 90f);
            g.FillPath(b, path);
        }
        else
        {
            using var b = new SolidBrush(fill);
            g.FillPath(b, path);
        }
        if (Ghost)
        {
            using var pen = new Pen(Colors.Border);
            g.DrawPath(pen, path);
        }
        var fg = Ghost ? Colors.Text : Color.White;
        TextRenderer.DrawText(g, Text, Font, r, fg, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }
}

public class GradientProgress : Control
{
    private float _value;
    public float Value { get { return _value; } set { _value = Math.Clamp(value, 0f, 1f); Invalidate(); } }
    public GradientProgress() { Height = 10; DoubleBuffered = true; }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var r = ClientRectangle;
        r.Inflate(-1, -1);
        using (var path = Ui.Rounded(r, r.Height / 2))
        using (var b = new SolidBrush(Colors.Panel2))
        {
            g.FillPath(b, path);
        }
        if (Value > 0.01f)
        {
            var fill = new Rectangle(r.X, r.Y, Math.Max(10, (int)(r.Width * Value)), r.Height);
            using var path = Ui.Rounded(fill, r.Height / 2);
            using var b = new LinearGradientBrush(fill, Colors.Primary, Colors.Accent, 90f);
            g.FillPath(b, path);
        }
    }
}

public class DotsControl : Control
{
    public int Count = 4;
    public int Active = 0;
    public DotsControl() { Height = 12; Width = 90; }
    public void SetActive(int i) { Active = i; Invalidate(); }
    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        int step = Width / Count;
        for (int i = 0; i < Count; i++)
        {
            var c = i == Active ? Colors.Accent : Colors.Panel2;
            using var b = new SolidBrush(c);
            g.FillEllipse(b, step * i + step / 2 - 4, 2, 8, 8);
        }
    }
}

public class InstallerForm : Form
{
    private readonly Options _opts;
    private int _step = 0;
    private string _installDir;
    private int _port = 4443;
    private bool _installOk;

    private Panel _topBar;
    private Panel _bottomBar;
    private Panel _content;
    private Label _title;
    private ModernButton _btnBack, _btnNext;
    private ModernButton? _btnStart;
    private DotsControl _dots;
    private GradientProgress _progress;
    private Label _statusLabel;
    private TextBox _tbDir;
    private NumericUpDown _numPort;
    private CheckBox _chkAutoStart, _chkDesktop;

    public InstallerForm(Options opts)
    {
        _opts = opts;
        _installDir = string.IsNullOrWhiteSpace(opts.InstallDir)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GameBox")
            : opts.InstallDir;
        _port = opts.Port;

        BuildChrome();
        Shown += (s, e) => ShowStep(0);
    }

    private void BuildChrome()
    {
        Text = "GameBox Setup";
        ClientSize = new Size(800, 560);
        MinimumSize = new Size(680, 500);
        BackColor = Colors.Bg;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        DoubleBuffered = true;
        Resize += (s, e) => { using var p = Ui.Rounded(new Rectangle(0, 0, ClientSize.Width, ClientSize.Height), 14); Region = new Region(p); };
        using (var p = Ui.Rounded(new Rectangle(0, 0, ClientSize.Width, ClientSize.Height), 14))
            Region = new Region(p);

        // Barra superior
        _topBar = new Panel { Dock = DockStyle.Top, Height = 48, BackColor = Colors.Panel };
        var logo = new Panel { Size = new Size(30, 30), Margin = new Padding(16, 9, 10, 0), Dock = DockStyle.Left };
        logo.Paint += (s, e) =>
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var r = new Rectangle(0, 0, 29, 29);
            using var path = Ui.Rounded(r, 9);
            using var b = new LinearGradientBrush(r, Colors.Primary, Colors.Accent, 135f);
            g.FillPath(b, path);
            TextRenderer.DrawText(g, "G", Ui.Font(13f, true), r, Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        };
        _title = new Label { Text = "GameBox Setup", ForeColor = Colors.Text, Font = Ui.Font(11f, true), AutoSize = true, Margin = new Padding(0, 0, 0, 0), Dock = DockStyle.Left, Padding = new Padding(0, 15, 0, 0), BackColor = Color.Transparent };
        var close = new Label { Text = "✕", ForeColor = Colors.Muted, Font = Ui.Font(13f, true), Size = new Size(44, 48), TextAlign = ContentAlignment.MiddleCenter, Cursor = Cursors.Hand, Dock = DockStyle.Right, BackColor = Color.Transparent };
        close.MouseEnter += (s, e) => close.ForeColor = Colors.Text;
        close.MouseLeave += (s, e) => close.ForeColor = Colors.Muted;
        close.Click += (s, e) => Close();

        _topBar.Controls.Add(close);
        _topBar.Controls.Add(logo);
        _topBar.Controls.Add(_title);
        _topBar.MouseDown += DragMove;

        // Barra inferior
        _bottomBar = new Panel { Dock = DockStyle.Bottom, Height = 78, BackColor = Colors.Bg, Padding = new Padding(20, 0, 20, 0) };

        _btnBack = new ModernButton("← Volver") { Ghost = true, Width = 120, Dock = DockStyle.Left };
        _btnBack.Click += (s, e) => ShowStep(_step - 1);
        _btnNext = new ModernButton("Continuar") { Accent = true, Width = 150, Dock = DockStyle.Right };
        _btnNext.Click += OnNext;
        _dots = new DotsControl();

        _bottomBar.Controls.Add(_dots);
        _bottomBar.Controls.Add(_btnNext);
        _bottomBar.Controls.Add(_btnBack);
        _bottomBar.Resize += (s, e) =>
        {
            _dots.Location = new Point((_bottomBar.ClientSize.Width - _dots.Width) / 2, (_bottomBar.ClientSize.Height - _dots.Height) / 2);
        };

        // Contenido
        _content = new Panel { Dock = DockStyle.Fill, BackColor = Colors.Bg, Padding = new Padding(0) };

        Controls.Add(_content);
        Controls.Add(_bottomBar);
        Controls.Add(_topBar);
    }

    private void DragMove(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        Native.ReleaseCapture();
        Native.SendMessage(Handle, 0x00A1, new IntPtr(2), IntPtr.Zero);
    }

    private void ShowStep(int step)
    {
        _step = step;
        _dots.SetActive(step);
        _content.Controls.Clear();
        _content.SuspendLayout();

        if (step == 0) BuildWelcome();
        else if (step == 1) BuildOptions();
        else if (step == 2) BuildInstalling();
        else BuildDone();

        _btnBack.Visible = step > 0 && step < 3;
        _btnNext.Visible = step < 3;
        _content.ResumeLayout();
    }

    // ---------- Paso 0: Bienvenida ----------
    private void BuildWelcome()
    {
        var cw = _content.ClientSize.Width;

        var hero = new Panel { Dock = DockStyle.Top, Height = 190, BackColor = Color.Transparent };
        hero.Paint += (s, e) =>
        {
            var g = e.Graphics;
            var r = new Rectangle(0, 0, hero.Width, hero.Height);
            using var b = new LinearGradientBrush(r, Color.FromArgb(30, 24, 60), Color.FromArgb(12, 20, 28), 120f);
            g.FillRectangle(b, r);
        };

        // Centrado vertical del logo+título dentro del héroe
        var inner = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, BackColor = Color.Transparent };
        inner.RowStyles.Add(new RowStyle(SizeType.Percent, 50f));
        inner.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        inner.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        inner.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        inner.RowStyles.Add(new RowStyle(SizeType.Percent, 50f));

        var logo = new Panel { Size = new Size(76, 76) };
        logo.Paint += (s, e) =>
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var r = new Rectangle(0, 0, 75, 75);
            using var path = Ui.Rounded(r, 22);
            using var b = new LinearGradientBrush(r, Colors.Primary, Colors.Accent, 135f);
            g.FillPath(b, path);
            TextRenderer.DrawText(g, "G", Ui.Font(36f, true), r, Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        };
        var title = new Label { Text = "Bienvenido a GameBox", Font = Ui.Font(24f, true), ForeColor = Colors.Text, AutoSize = true, BackColor = Color.Transparent };
        var sub = new Label { Text = "Tu consola de juegos en la nube", Font = Ui.Font(12.5f), ForeColor = Colors.Muted, AutoSize = true, BackColor = Color.Transparent };

        inner.Controls.Add(logo, 0, 1);
        inner.Controls.Add(title, 0, 2);
        inner.Controls.Add(sub, 0, 3);
        foreach (Control c in inner.Controls) { c.Anchor = AnchorStyles.None; }
        hero.Controls.Add(inner);

        var feats = new Label
        {
            Dock = DockStyle.Fill,
            Text =
                "  ●  Detecta juegos de Steam, Epic Games y Xbox / Tienda\n" +
                "  ●  Biblioteca con portadas, búsqueda, categorías y favoritos\n" +
                "  ●  Estadísticas, procesos y actualizaciones automáticas\n" +
                "  ●  PWA a pantalla completa desde la pantalla de inicio",
            Font = Ui.Font(12f),
            ForeColor = Colors.Muted,
            Padding = new Padding(40, 14, 40, 4),
        };

        var note = new Label
        {
            Dock = DockStyle.Bottom,
            Text = "Nota: como el instalador no está firmado digitalmente, Windows SmartScreen puede mostrar\nuna advertencia de \"editor desconocido\". No es malware.",
            Font = Ui.Font(11f),
            ForeColor = Colors.Warn,
            TextAlign = ContentAlignment.MiddleCenter,
            Height = 74,
        };

        _content.Controls.Add(hero);
        _content.Controls.Add(feats);
        _content.Controls.Add(note);

        _btnNext.Text = "Continuar →";
    }

    // ---------- Paso 1: Opciones ----------
    private void BuildOptions()
    {
        var cw = _content.ClientSize.Width;

        var wrap = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 1, Padding = new Padding(36, 16, 36, 16), BackColor = Color.Transparent };
        wrap.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
        wrap.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

        var card = new Panel { BackColor = Colors.Panel, Dock = DockStyle.Fill };
        card.Paint += (s, e) =>
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var path = Ui.Rounded(card.ClientRectangle, 16);
            using var pen = new Pen(Colors.Border);
            g.DrawPath(pen, path);
        };
        wrap.Controls.Add(card, 0, 0);
        _content.Controls.Add(wrap);

        // Campos dentro de la tarjeta
        var form = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 10, Padding = new Padding(28), BackColor = Color.Transparent };
        form.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        foreach (var rs in new[] { SizeType.AutoSize, SizeType.AutoSize, SizeType.Percent, SizeType.AutoSize, SizeType.AutoSize, SizeType.Percent, SizeType.AutoSize, SizeType.AutoSize, SizeType.Percent, SizeType.AutoSize })
            form.RowStyles.Add(new RowStyle(rs, rs == SizeType.Percent ? 8f : 0f));

        var lblDir = new Label { Text = "Carpeta de instalación", Font = Ui.Font(10f, true), ForeColor = Colors.Muted, AutoSize = true, Dock = DockStyle.Fill, Padding = new Padding(0, 6, 0, 4) };

        var dirRow = new TableLayoutPanel { ColumnCount = 2, RowCount = 1, Dock = DockStyle.Fill, BackColor = Color.Transparent };
        dirRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        dirRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        _tbDir = new TextBox { Dock = DockStyle.Fill, Font = Ui.Font(12f), BackColor = Colors.Panel2, ForeColor = Colors.Text, BorderStyle = BorderStyle.FixedSingle };
        _tbDir.Text = _installDir;
        var btnBrowse = new ModernButton("Examinar…") { Ghost = true, Width = 110, Height = 42, Dock = DockStyle.Right, Margin = new Padding(10, 0, 0, 0) };
        btnBrowse.Click += (s, e) =>
        {
            using var dlg = new FolderBrowserDialog { Description = "Elige la carpeta de instalación", SelectedPath = _tbDir.Text };
            if (dlg.ShowDialog(this) == DialogResult.OK) _tbDir.Text = dlg.SelectedPath;
        };
        dirRow.Controls.Add(_tbDir, 0, 0);
        dirRow.Controls.Add(btnBrowse, 1, 0);

        var lblPort = new Label { Text = "Puerto del portal", Font = Ui.Font(10f, true), ForeColor = Colors.Muted, AutoSize = true, Dock = DockStyle.Fill, Padding = new Padding(0, 6, 0, 4) };
        _numPort = new NumericUpDown { Font = Ui.Font(12f), BackColor = Colors.Panel2, ForeColor = Colors.Text, BorderStyle = BorderStyle.FixedSingle, Dock = DockStyle.Left, Width = 120, Minimum = 1024, Maximum = 65535 };
        _numPort.Value = _port;

        _chkAutoStart = new CheckBox { Text = "Iniciar GameBox con Windows", Font = Ui.Font(12f), ForeColor = Colors.Text, AutoSize = true, Dock = DockStyle.Fill, Checked = _opts.AutoStart };
        _chkDesktop = new CheckBox { Text = "Crear acceso directo en el escritorio", Font = Ui.Font(12f), ForeColor = Colors.Text, AutoSize = true, Dock = DockStyle.Fill, Checked = true };

        var infoText = "GameBox se usará desde el icono añadido a la pantalla de inicio de tu dispositivo.";
        var info = new Label { Text = infoText, Font = Ui.Font(11f), ForeColor = Colors.Muted, Dock = DockStyle.Fill, AutoSize = false, Height = 50, Padding = new Padding(0, 6, 0, 0) };

        form.Controls.Add(lblDir, 0, 0);
        form.Controls.Add(dirRow, 0, 1);
        form.Controls.Add(lblPort, 0, 3);
        form.Controls.Add(_numPort, 0, 4);
        form.Controls.Add(_chkAutoStart, 0, 6);
        form.Controls.Add(_chkDesktop, 0, 7);
        form.Controls.Add(info, 0, 9);

        card.Controls.Add(form);

        _btnNext.Text = "Instalar →";
    }

    // ---------- Paso 2: Instalando ----------
    private void BuildInstalling()
    {
        _installDir = _tbDir != null && !string.IsNullOrWhiteSpace(_tbDir.Text) ? _tbDir.Text.Trim().Trim('"') : _installDir;
        _port = (int)(_numPort?.Value ?? 4443);
        _opts.AutoStart = _chkAutoStart?.Checked ?? _opts.AutoStart;
        _opts.DesktopShortcut = _chkDesktop?.Checked ?? true;

        var lbl = new Label { Text = "Instalando GameBox…", Font = Ui.Font(18f, true), ForeColor = Colors.Text, AutoSize = true, Dock = DockStyle.Top, Padding = new Padding(24, 18, 0, 6) };
        _progress = new GradientProgress { Dock = DockStyle.Top, Height = 10, Margin = new Padding(26, 10, 26, 0), Value = 0 };
        _statusLabel = new Label { Text = "Preparando…", Font = Ui.Font(12f), ForeColor = Colors.Muted, AutoSize = true, Dock = DockStyle.Top, Padding = new Padding(26, 10, 0, 6) };
        var depsPanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(28, 10, 28, 0) };
        var depsFlow = new FlowLayoutPanel { Dock = DockStyle.Top, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoSize = true, Padding = new Padding(0) };
        depsPanel.Controls.Add(depsFlow);

        _content.Controls.Add(depsPanel);
        _content.Controls.Add(_statusLabel);
        _content.Controls.Add(_progress);
        _content.Controls.Add(lbl);

        _btnBack.Visible = false;
        _btnNext.Enabled = false;

        void AddDep(string name, bool ok, string detail)
        {
            var row = new Label
            {
                AutoSize = false,
                Width = depsPanel.ClientSize.Width - 56,
                Height = 26,
                Font = Ui.Font(12f),
                ForeColor = ok ? Colors.Accent : Colors.Warn,
                Text = (ok ? "●  " : "▲  ") + name + "  —  " + detail,
            };
            depsFlow.Controls.Add(row);
        }

        Task.Run(() =>
        {
            try
            {
                InstallerLogic.ExtractPackage(_installDir, s => Invoke(() => SetStatus(s)));
                Invoke(() => _progress.Value = 0.35f);

                var deps = InstallerLogic.CheckDeps(_installDir, _port);
                Invoke(() =>
                {
                    depsFlow.Controls.Clear();
                    foreach (var d in deps) AddDep(d.Name, d.Ok, d.Detail);
                    _progress.Value = 0.6f;
                    SetStatus("Guardando configuración…");
                });

                InstallerLogic.WriteConfig(_installDir, InstallerLogic.BuildConfig(_opts));
                Invoke(() => { _progress.Value = 0.75f; SetStatus("Creando accesos directos…"); });
                InstallerLogic.CreateShortcuts(_installDir, _opts.DesktopShortcut);
                if (_opts.AutoStart)
                {
                    Invoke(() => SetStatus("Configurando inicio con Windows…"));
                    InstallerLogic.CreateAutoStart(_installDir);
                }
                Invoke(() => { _progress.Value = 0.9f; SetStatus("Arrancando GameBox…"); });
                _installOk = InstallerLogic.StartApp(_installDir, _port, s => Invoke(() => SetStatus(s)));
                Invoke(() => { _progress.Value = 1f; ShowStep(3); });
            }
            catch (Exception ex)
            {
                Invoke(() => { SetStatus("Error: " + ex.Message); _installOk = false; ShowStep(3); });
            }
        });
    }

    private void SetStatus(string s) { if (_statusLabel != null) _statusLabel.Text = s; }

    // ---------- Paso 3: Resultado ----------
    private void BuildDone()
    {
        var ok = _installOk;
        var cw = _content.ClientSize.Width;
        if (_btnStart != null) { _bottomBar.Controls.Remove(_btnStart); _btnStart.Dispose(); _btnStart = null; }

        var tl = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, BackColor = Color.Transparent };
        tl.RowStyles.Add(new RowStyle(SizeType.Percent, 45f));
        tl.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        tl.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        tl.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        tl.RowStyles.Add(new RowStyle(SizeType.Percent, 45f));
        tl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

        var icon = new Panel { Size = new Size(96, 96) };
        icon.Paint += (s, e) =>
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var r = new Rectangle(0, 0, 95, 95);
            using var path = Ui.Rounded(r, 26);
            using var b = new LinearGradientBrush(r, ok ? Colors.Primary : Colors.Danger, ok ? Colors.Accent : Color.FromArgb(120, 40, 44), 135f);
            g.FillPath(b, path);
            var pen = new Pen(Color.White, 7) { StartCap = LineCap.Round, EndCap = LineCap.Round };
            if (ok) g.DrawLines(pen, new[] { new Point(28, 52), new Point(42, 66), new Point(70, 32) });
            else { g.DrawLine(pen, 34, 34, 62, 62); g.DrawLine(pen, 62, 34, 34, 62); }
            pen.Dispose();
        };

        var title = new Label
        {
            Text = ok ? "¡GameBox instalado!" : "No se pudo completar la instalación",
            Font = Ui.Font(22f, true),
            ForeColor = Colors.Text,
            AutoSize = true,
            TextAlign = ContentAlignment.MiddleCenter,
        };

        var detailText = ok
            ? $"Web:  https://localhost:{_port}\nCarpeta:  {_installDir}\n\nAñade GameBox a la pantalla de inicio de tu dispositivo y ábrelo desde su icono para usarlo a pantalla completa."
            : "Revisa el mensaje anterior. Puedes probar a ejecutar \"GameBox\" desde el menú Inicio o reinstalar en otra carpeta/puerto.";
        var detail = new Label
        {
            Text = detailText,
            Font = Ui.Font(12f),
            ForeColor = Colors.Muted,
            AutoSize = false,
            TextAlign = ContentAlignment.TopCenter,
            Width = Math.Max(360, cw - 80),
            Height = ok ? 150 : 80,
        };

        tl.Controls.Add(icon, 0, 1);
        tl.Controls.Add(title, 0, 2);
        tl.Controls.Add(detail, 0, 3);
        foreach (Control c in tl.Controls) { c.Anchor = AnchorStyles.None; }
        _content.Controls.Add(tl);

        _btnBack.Visible = false;
        _btnNext.Visible = false;

        var btnStart = new ModernButton(ok ? "Abrir GameBox" : "Cerrar") { Accent = true, Width = 190, Height = 46, Dock = DockStyle.Right };
        btnStart.Click += (s, e) => Close();
        _btnStart = btnStart;
        _bottomBar.Controls.Add(btnStart);
        _bottomBar.Controls.SetChildIndex(btnStart, 0);

        if (ok)
        {
            var url = $"https://localhost:{_port}";
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo("cmd.exe", $"/c start \"\" \"{url}\"") { UseShellExecute = true, CreateNoWindow = true };
                System.Diagnostics.Process.Start(psi);
            }
            catch { }
        }
    }

    private void OnNext(object? sender, EventArgs e)
    {
        if (_step == 0) ShowStep(1);
        else if (_step == 1) ShowStep(2);
    }
}

internal static class Native
{
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern bool ReleaseCapture();
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
}
