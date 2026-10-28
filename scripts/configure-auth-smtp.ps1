# Push Auth SMTP settings from supabase/config.toml (uses RESEND_API_KEY from .env or env).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $name = $matches[1].Trim()
      $val = $matches[2].Trim().Trim('"')
      Set-Item -Path "env:$name" -Value $val
    }
  }
}
if (-not $env:RESEND_API_KEY) {
  Write-Host "Set RESEND_API_KEY in .env or your environment, then re-run." -ForegroundColor Yellow
  exit 1
}
Set-Location $root
npx --yes supabase@2 config push --yes
