using Velopack;

namespace RmsDesktop;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        VelopackApp.Build().Run();
        ApplicationConfiguration.Initialize();
        var workspaceArgs = args.Where(arg => arg is not ("--veloapp-firstrun" or "--veloapp-restarted")).ToArray();
        var workspace = workspaceArgs switch
        {
            [] => new Workspace("Live workspace", "Production", new Uri("https://rms-navy.vercel.app/staff/dashboard")),
            ["--local"] => new Workspace("Local workspace", "Local", new Uri("http://127.0.0.1:3000/staff/dashboard")),
            ["--preview"] => new Workspace("Local preview · sample data", "Preview", new Uri("http://127.0.0.1:3000/preview?view=intelligence")),
            _ => null,
        };
        if (workspace is null)
        {
            MessageBox.Show("Launch RMS.exe, RMS.exe --local, or RMS.exe --preview.", "RMS Desktop");
            return;
        }
        using var window = new WorkspaceWindow(workspace, workspaceArgs);
        Application.Run(window);
    }
}

internal sealed record Workspace(string Label, string Profile, Uri Home)
{
    internal bool Allows(string address) =>
        Uri.TryCreate(address, UriKind.Absolute, out var target)
        && target.Scheme == Home.Scheme && target.IdnHost == Home.IdnHost
        && target.Port == Home.Port && target.UserInfo.Length == 0;
}
