# RMS Desktop for Windows

Run the Windows x64 setup file from [GitHub Releases](https://github.com/shahrozimran/RMS/releases) and open **RMS Desktop**. Sign in with your existing staff or administrator account. The app needs an internet connection and Microsoft Edge WebView2 Runtime. The current installer is unsigned.

RMS checks for a new desktop release before opening sign-in. When an update is available, choose **Update and restart** once. RMS downloads and installs the release, then opens again. **Check for updates** also works while RMS is open. If the update check is temporarily unreachable, sign-in remains available.

The first portable `RMS.exe` predates the updater. Run the setup file once to switch to the version that receives updates. RMS keeps its WebView2 data under your Windows profile across desktop updates. The hosted workspace uses the features already deployed to the RMS website.

## Build and release

With the .NET 10 SDK, run this from the repository root.

```powershell
./desktop/Build-Release.ps1
```

To publish a new release, update the version in `RmsDesktop.csproj`, commit the change, and push a matching tag such as `desktop-v1.2.0`. GitHub Actions builds and publishes the installer, update package, and update index. The updater reads them from the public repository.

For local development, start the web app with `npm run dev -- --hostname 127.0.0.1 --port 3000`. Launch the desktop binary with `--local` for the local sign-in or `--preview` for the sample workspace.
