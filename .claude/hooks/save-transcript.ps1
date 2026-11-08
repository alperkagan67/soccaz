$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
if (-not $raw) { exit 0 }
$j = $raw | ConvertFrom-Json
if ($j.transcript_path -and $j.session_id -and (Test-Path -LiteralPath $j.transcript_path)) {
    $root = $env:CLAUDE_PROJECT_DIR
    if (-not $root) { $root = (Get-Location).Path }
    $dir = Join-Path $root 'sessions'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Copy-Item -LiteralPath $j.transcript_path -Destination (Join-Path $dir ($j.session_id + '.jsonl')) -Force
}
