using System.Diagnostics;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace RmsDesktop;

internal sealed partial class WorkspaceWindow : Form
{
    private static readonly Color Ink = Color.FromArgb(23, 25, 19);
    private static readonly Color Ivory = Color.FromArgb(245, 242, 233);
    private static readonly Color Olive = Color.FromArgb(67, 80, 32);
    private const string RuntimeDownload = "https://developer.microsoft.com/microsoft-edge/webview2/";

    private readonly Workspace workspace;
    private readonly WebView2 view = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Ivory, AllowExternalDrop = false };
    private readonly Button retry = ToolbarButton("Try again");
    private readonly Button install = ToolbarButton("Get WebView2");
    private readonly Label statusTitle = new() { AutoSize = true, Font = new Font("Segoe UI", 18, FontStyle.Bold) };
    private readonly Label statusText = new() { AutoSize = true, MaximumSize = new Size(460, 0) };
    private readonly TableLayoutPanel statusPanel = new() { Dock = DockStyle.Fill, BackColor = Ivory, ColumnCount = 1, RowCount = 3 };
    private CoreWebView2Environment? environment;
    private ulong navigationId;

    internal WorkspaceWindow(Workspace workspace, string[] workspaceArgs)
    {
        this.workspace = workspace;
        restartArgs = workspaceArgs;
        updates = CreateUpdateManager(workspace);
        Text = $"RMS Desktop — {workspace.Label}";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1320, 860);
        MinimumSize = new Size(760, 540);
        BackColor = Ivory;
        ForeColor = Ink;

        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2 };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        if (workspace.Profile == "Production" || updates is not null)
        {
            layout.Controls.Add(BuildUpdateBar(), 0, 0);
        }
        var content = new Panel { Dock = DockStyle.Fill, Margin = Padding.Empty };
        content.Controls.Add(view);
        BuildStatusPanel();
        content.Controls.Add(statusPanel);
        layout.Controls.Add(content, 0, 1);
        Controls.Add(layout);

        retry.Click += async (_, _) =>
        {
            if (view.CoreWebView2 is null) await InitializeBrowser();
            else
            {
                SetStatus("Opening RMS…", "Connecting to your restaurant workspace.");
                view.CoreWebView2.Navigate(workspace.Home.AbsoluteUri);
            }
        };
        install.Click += (_, _) =>
        {
            try { Process.Start(new ProcessStartInfo(RuntimeDownload) { UseShellExecute = true }); }
            catch (System.ComponentModel.Win32Exception)
            {
                MessageBox.Show(RuntimeDownload, "Download Microsoft Edge WebView2");
            }
        };
        applyUpdate.Click += async (_, _) => await InstallUpdate();
        SetStatus("Opening RMS…", "Connecting to your restaurant workspace.");
        Shown += async (_, _) =>
        {
            if (updates?.IsInstalled == true) await CheckForUpdates(beforeSignIn: true);
            if (!IsDisposed && !updateBeforeSignIn) await InitializeBrowser();
        };
    }

    private void BuildStatusPanel()
    {
        statusPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        statusPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        statusPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        statusPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        var message = new FlowLayoutPanel
        {
            Anchor = AnchorStyles.None, AutoSize = true, FlowDirection = FlowDirection.TopDown, WrapContents = false,
        };
        statusTitle.Margin = new Padding(3, 0, 3, 8);
        statusText.Margin = new Padding(3, 0, 3, 16);
        var actions = new FlowLayoutPanel { AutoSize = true, WrapContents = false };
        actions.Controls.AddRange([retry, install, applyUpdate]);
        message.Controls.AddRange([statusTitle, statusText, actions]);
        statusPanel.Controls.Add(message, 0, 1);
    }

    private static Button ToolbarButton(string text) => new()
    {
        Text = text, AutoSize = true, FlatStyle = FlatStyle.Flat, BackColor = Olive,
        ForeColor = Color.White, Padding = new Padding(6, 0, 6, 0),
    };

    private async Task InitializeBrowser()
    {
        SetStatus("Opening RMS…", "Connecting to your restaurant workspace.");
        try
        {
            var localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var profileFolder = Path.Combine(localData, "RMS Desktop", workspace.Profile);
            environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profileFolder);
            if (IsDisposed) return;
            await view.EnsureCoreWebView2Async(environment);
            if (IsDisposed) return;

            var browser = view.CoreWebView2;
            ConfigureBrowser(browser);
            browser.NavigationStarting += (_, e) =>
            {
                if (!e.Cancel) navigationId = e.NavigationId;
            };
            browser.NavigationCompleted += (_, e) =>
            {
                if (e.NavigationId != navigationId) return;
                if (e.IsSuccess) statusPanel.Hide();
                else if (e.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled)
                {
                    var advice = workspace.Profile == "Production"
                        ? "Check your connection and try again."
                        : "Start the local RMS server on port 3000, then try again.";
                    SetStatus("RMS is unavailable", advice, canRetry: true);
                }
            };
            browser.NewWindowRequested += OpenWindow;
            browser.Navigate(workspace.Home.AbsoluteUri);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            SetStatus("Microsoft Edge WebView2 is required", "Install the WebView2 Runtime, then try again.", canRetry: true, missingRuntime: true);
        }
        catch (Exception)
        {
            SetStatus("RMS could not start", "Try again or restart RMS Desktop.", canRetry: true);
        }
    }

    private void ConfigureBrowser(CoreWebView2 browser, bool allowPrintDocument = false)
    {
        browser.Settings.AreHostObjectsAllowed = false;
        browser.Settings.IsWebMessageEnabled = false;
        browser.Settings.AreDevToolsEnabled = false;
        browser.Settings.IsBuiltInErrorPageEnabled = false;
        browser.Settings.IsGeneralAutofillEnabled = false;
        browser.Settings.IsPasswordAutosaveEnabled = false;
        browser.NavigationStarting += (_, e) => e.Cancel =
            !workspace.Allows(e.Uri) && !(allowPrintDocument && e.Uri == "about:blank");
        browser.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
    }

    // The table page opens a blank document to lay out a QR code for printing.
    private async void OpenWindow(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (!e.IsUserInitiated) return;
        if (workspace.Allows(e.Uri))
        {
            view.CoreWebView2.Navigate(e.Uri);
            return;
        }
        if (e.Uri != "about:blank" && !string.IsNullOrEmpty(e.Uri)) return;

        var deferral = e.GetDeferral();
        var popup = new Form { Text = "RMS · Print", StartPosition = FormStartPosition.CenterParent, Size = new Size(720, 720) };
        var printView = new WebView2 { Dock = DockStyle.Fill, AllowExternalDrop = false };
        popup.Controls.Add(printView);
        try
        {
            popup.Show(this);
            await printView.EnsureCoreWebView2Async(environment);
            ConfigureBrowser(printView.CoreWebView2, allowPrintDocument: true);
            printView.CoreWebView2.NewWindowRequested += (_, nested) => nested.Handled = true;
            printView.CoreWebView2.WindowCloseRequested += (_, _) => popup.Close();
            e.NewWindow = printView.CoreWebView2;
        }
        catch (Exception)
        {
            popup.Dispose();
        }
        finally
        {
            deferral.Complete();
        }
    }

    private void SetStatus(string title, string message, bool canRetry = false, bool missingRuntime = false)
    {
        if (IsDisposed) return;
        statusTitle.Text = title;
        statusText.Text = message;
        retry.Visible = canRetry;
        install.Visible = missingRuntime;
        applyUpdate.Visible = false;
        statusPanel.Show();
        statusPanel.BringToFront();
    }
}
