using System.Diagnostics;
using Velopack;
using Velopack.Sources;

namespace RmsDesktop;

internal sealed partial class WorkspaceWindow
{
    private const string Repository = "https://github.com/shahrozimran/RMS";
    private readonly UpdateManager? updates;
    private readonly string[] restartArgs;
    private readonly Label updateStatus = new() { AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(3, 0, 8, 0) };
    private readonly Button checkUpdate = ToolbarButton("Check for updates");
    private readonly Button applyUpdate = ToolbarButton("Update and restart");
    private UpdateInfo? availableUpdate;
    private bool updateBeforeSignIn;
    private bool busyUpdating;

    private static UpdateManager? CreateUpdateManager(Workspace workspace)
    {
#if DEBUG
        var testFeed = Environment.GetEnvironmentVariable("RMS_DESKTOP_TEST_FEED");
        if (!string.IsNullOrWhiteSpace(testFeed) && Path.IsPathFullyQualified(testFeed) && Directory.Exists(testFeed))
            return new UpdateManager(testFeed);
#endif
        return workspace.Profile == "Production"
            ? new UpdateManager(new GithubSource(Repository, null, false))
            : null;
    }

    private TableLayoutPanel BuildUpdateBar()
    {
        var bar = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, AutoSize = true, ColumnCount = 2, RowCount = 1,
            Padding = new Padding(12, 3, 12, 3), Margin = Padding.Empty,
            BackColor = Color.FromArgb(232, 236, 214),
        };
        bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        bar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        var version = typeof(Program).Assembly.GetName().Version?.ToString(3);
        updateStatus.Text = $"RMS Desktop {version}";
        bar.Controls.Add(updateStatus, 0, 0);
        bar.Controls.Add(checkUpdate, 1, 0);
        if (updates?.IsInstalled != true) checkUpdate.Text = "Get the installer";
        checkUpdate.Click += async (_, _) =>
        {
            if (updates?.IsInstalled != true)
            {
                try { Process.Start(new ProcessStartInfo($"{Repository}/releases") { UseShellExecute = true }); }
                catch (System.ComponentModel.Win32Exception) { updateStatus.Text = "Open GitHub Releases in your browser to get the installer."; }
            }
            else if (availableUpdate is not null) await InstallUpdate();
            else await CheckForUpdates();
        };
        return bar;
    }

    private async Task CheckForUpdates(bool beforeSignIn = false)
    {
        if (updates is null || busyUpdating) return;
        busyUpdating = true;
        checkUpdate.Enabled = false;
        updateStatus.Text = "Checking for updates…";
        if (beforeSignIn) SetStatus("Checking for updates…", "This usually takes a few seconds.");
        try
        {
            var update = await updates.CheckForUpdatesAsync().WaitAsync(TimeSpan.FromSeconds(10));
            if (IsDisposed) return;
            availableUpdate = update;
            if (update is null)
            {
                updateStatus.Text = "RMS Desktop is up to date";
                return;
            }

            var version = update.TargetFullRelease.Version;
            updateStatus.Text = $"RMS Desktop {version} is available";
            checkUpdate.Text = "Update and restart";
            if (beforeSignIn)
            {
                updateBeforeSignIn = true;
                SetStatus("An update is ready", $"Install RMS Desktop {version} to continue to sign-in.");
                applyUpdate.Visible = true;
                applyUpdate.Focus();
            }
        }
        catch (Exception)
        {
            if (!IsDisposed) updateStatus.Text = "Could not check for updates. Try again when online.";
        }
        finally
        {
            busyUpdating = false;
            if (!IsDisposed) checkUpdate.Enabled = !updateBeforeSignIn;
        }
    }

    private async Task InstallUpdate()
    {
        if (updates is null || availableUpdate is not { } update || busyUpdating) return;
        busyUpdating = true;
        checkUpdate.Enabled = false;
        applyUpdate.Enabled = false;
        updateStatus.Text = "Downloading update…";
        if (updateBeforeSignIn) SetStatus("Downloading update…", "RMS will restart when the update is installed.");
        IProgress<int> progress = new Progress<int>(percent =>
        {
            if (IsDisposed || !busyUpdating) return;
            updateStatus.Text = $"Downloading update… {percent}%";
            if (updateBeforeSignIn) statusText.Text = $"{percent}% downloaded. RMS will restart automatically.";
        });
        try
        {
            await updates.DownloadUpdatesAsync(update, progress.Report);
            if (IsDisposed) return;
            updateStatus.Text = "Installing update…";
            updates.ApplyUpdatesAndRestart(update, restartArgs);
        }
        catch (Exception)
        {
            if (IsDisposed) return;
            updateStatus.Text = "Update could not be installed. Try again.";
            if (updateBeforeSignIn)
            {
                SetStatus("Update could not be installed", "Check your connection and try again.");
                applyUpdate.Visible = true;
            }
        }
        finally
        {
            busyUpdating = false;
            if (!IsDisposed)
            {
                checkUpdate.Enabled = !updateBeforeSignIn;
                applyUpdate.Enabled = true;
            }
        }
    }
}
