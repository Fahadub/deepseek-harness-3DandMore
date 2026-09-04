# Downloads the latest official Blender 4.5 LTS (portable) into
# tools-suite/blender/ (one-time). Flattens the inner version folder so the
# executable lands exactly at tools-suite/blender/blender.exe.
$ErrorActionPreference = 'Stop'
$blenderExe = Join-Path (Get-Location).Path 'tools-suite\blender\blender.exe'
if (Test-Path $blenderExe) { Write-Output 'Blender already installed'; exit 0 }

$base = 'https://download.blender.org/release/Blender4.5/'
$name = $null
try {
  $page = (Invoke-WebRequest -UseBasicParsing -Uri $base -TimeoutSec 30).Content
  $names = [regex]::Matches($page, 'blender-4\.5\.\d+-windows-x64\.zip') | ForEach-Object { $_.Value } | Sort-Object -Unique
  if ($names.Count -gt 0) { $name = $names[-1] }
} catch { Write-Output 'listing unavailable, falling back to pinned version' }
if (-not $name) { $name = 'blender-4.5.3-windows-x64.zip' }

$url = $base + $name
$zip = Join-Path $env:TEMP 'dsh-blender.zip'
$tmp = Join-Path $env:TEMP 'dsh-blender-extract'

Write-Output "downloading $name (~350MB) ..."
curl.exe -L --fail --retry 3 --silent --show-error -o $zip $url
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $zip)) { throw "download failed: $url" }

if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
Expand-Archive -Path $zip -DestinationPath $tmp
$inner = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
if (-not $inner) { throw 'unexpected archive layout' }
New-Item -ItemType Directory -Force -Path (Split-Path $blenderExe -Parent) | Out-Null
Get-ChildItem -Path $inner.FullName | Move-Item -Destination (Split-Path $blenderExe -Parent) -Force
Remove-Item -Recurse -Force $tmp
Remove-Item -Force $zip
if (-not (Test-Path $blenderExe)) { throw 'blender.exe not found after extraction' }
Write-Output 'Blender installed at tools-suite/blender/blender.exe'
