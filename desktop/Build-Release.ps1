param(
    [ValidatePattern('^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$')]
    [string]$Version
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$project = Join-Path $PSScriptRoot 'RmsDesktop.csproj'
$projectVersion = ([xml](Get-Content -LiteralPath $project -Raw)).Project.PropertyGroup.Version
if (!$Version) { $Version = $projectVersion }
if ($Version -ne $projectVersion) { throw "The release tag must match the desktop project version $projectVersion." }

Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    $publish = Join-Path $PSScriptRoot "dist/publish-$Version"
    $release = Join-Path $PSScriptRoot "dist/releases-$Version"
    dotnet tool restore
    dotnet publish $project -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -p:DebugType=None -o $publish
    dotnet vpk pack --packId RMSDesktop --packTitle 'RMS Desktop' --packVersion $Version --packDir $publish --mainExe RMS.exe --icon (Join-Path $PSScriptRoot 'RMS.ico') --runtime win-x64 --channel win-x64 --outputDir $release
} finally {
    Pop-Location
}
