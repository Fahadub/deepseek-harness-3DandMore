# Generates tools-suite/cordis-runtime.yml from cordis.template.yml,
# injecting this checkout's absolute path (URL-encoded) into {{ROOT}}.
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$rootUrl = $root -replace '\\', '/'
$rootUrl = $rootUrl -replace ' ', '%20'
$tpl = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'tools-suite\cordis.template.yml')
$out = $tpl -replace '\{\{ROOT\}\}', $rootUrl
$target = Join-Path $root 'tools-suite\cordis-runtime.yml'
[System.IO.File]::WriteAllText($target, $out, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'cordis-runtime.yml generated'
