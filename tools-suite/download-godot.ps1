# Downloads the official Godot 4.7.2 into tools-suite/godot/ (one-time).
# Renames the main executable to Godot.exe — the path hub-server expects.
$ErrorActionPreference = 'Stop'
$godotExe = Join-Path (Get-Location).Path 'tools-suite\godot\Godot.exe'
if (Test-Path $godotExe) { Write-Output 'Godot already installed'; exit 0 }

$url = 'https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_win64.exe.zip'
$zip = Join-Path $env:TEMP 'dsh-godot.zip'
$tmp = Join-Path $env:TEMP 'dsh-godot-extract'

Write-Output "downloading Godot 4.7.2 (~180MB) ..."
curl.exe -L --fail --retry 3 --silent --show-error -o $zip $url
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $zip)) { throw "download failed: $url" }

if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
Expand-Archive -Path $zip -DestinationPath $tmp
New-Item -ItemType Directory -Force -Path (Split-Path $godotExe -Parent) | Out-Null
Move-Item -Force (Join-Path $tmp 'Godot_v4.7.2-stable_win64.exe') $godotExe
$console = Join-Path $tmp 'Godot_v4.7.2-stable_win64_console.exe'
if (Test-Path $console) { Move-Item -Force $console (Split-Path $godotExe -Parent) }
Remove-Item -Recurse -Force $tmp
Remove-Item -Force $zip
Write-Output 'Godot 4.7.2 installed at tools-suite/godot/Godot.exe'
