
$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$appDir = Join-Path $repoRoot "app"
$distDir = Join-Path $repoRoot "dist"

$dotnet = $null
$onPath = (Get-Command dotnet -ErrorAction SilentlyContinue).Source
if ($onPath -and (& $onPath --list-sdks 2>$null)) {
  $dotnet = $onPath
}
if (-not $dotnet) {
  $localSdk = "$env:LOCALAPPDATA\dotnet-sdk\dotnet.exe"
  if ((Test-Path $localSdk) -and (& $localSdk --list-sdks 2>$null)) {
    $dotnet = $localSdk
    $env:DOTNET_ROOT = "$env:LOCALAPPDATA\dotnet-sdk"
  }
}
if (-not $dotnet) {
  Write-Host "No .NET SDK found. Installing a per-user copy (no admin needed)..."
  $installDir = "$env:LOCALAPPDATA\dotnet-sdk"
  New-Item -ItemType Directory -Force -Path $installDir | Out-Null
  Invoke-WebRequest -Uri "https://dot.net/v1/dotnet-install.ps1" -OutFile "$env:TEMP\dotnet-install.ps1" -UseBasicParsing
  & "$env:TEMP\dotnet-install.ps1" -Channel LTS -InstallDir $installDir -NoPath
  $dotnet = "$installDir\dotnet.exe"
  $env:DOTNET_ROOT = $installDir
}

Write-Host "Using dotnet: $dotnet"
Push-Location $appDir
try {
  & $dotnet publish -c Release
  if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$publishDir = Join-Path $appDir "bin\Release\net8.0-windows\win-x64\publish"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
Copy-Item (Join-Path $publishDir "MaliyetHesaplamaAraci.exe") $distDir -Force

Write-Host ""
Write-Host "Done. Standalone exe: $distDir\MaliyetHesaplamaAraci.exe"
