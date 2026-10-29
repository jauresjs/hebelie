# Push branded magic-link HTML to Supabase Auth (Management API).
# Uses the access token stored by `npx supabase login` (Windows Credential Manager).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$projectRef = "vqetbgdduoyxbszbrxkl"
$htmlPath = Join-Path $root "docs\auth-magic-link-email.html"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinCred {
  public enum CRED_TYPE : uint { GENERIC = 1 }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public CRED_TYPE Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool CredRead(string target, CRED_TYPE type, int reservedFlag, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern bool CredFree(IntPtr cred);
}
"@

$target = "Supabase CLI:supabase"
$ptr = [IntPtr]::Zero
if (-not [WinCred]::CredRead($target, [WinCred+CRED_TYPE]::GENERIC, 0, [ref]$ptr)) {
  Write-Host "Could not read Supabase CLI token. Run: npx supabase login" -ForegroundColor Red
  exit 1
}

try {
  $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][WinCred+CREDENTIAL])
  $blob = New-Object byte[] $cred.CredentialBlobSize
  [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $blob, 0, $cred.CredentialBlobSize)
  $utf8 = [System.Text.Encoding]::UTF8.GetString($blob).TrimEnd([char]0)
  $uni = [System.Text.Encoding]::Unicode.GetString($blob).TrimEnd([char]0)
  if ($utf8 -match '^sbp_') { $token = $utf8 }
  elseif ($uni -match '^sbp_') { $token = $uni }
  elseif ($utf8 -match '"access_token"\s*:\s*"([^"]+)"') { $token = $Matches[1] }
  elseif ($uni -match '"access_token"\s*:\s*"([^"]+)"') { $token = $Matches[1] }
  else { throw "Supabase CLI credential format not recognized (re-run: npx supabase login)" }
} finally {
  [WinCred]::CredFree($ptr) | Out-Null
}

$html = Get-Content -Path $htmlPath -Raw -Encoding UTF8
$html = [regex]::Replace($html, '(?s)^<!--.*?-->\s*', '')

$payload = @{
  mailer_subjects_magic_link          = "Sign in to Hebelie"
  mailer_templates_magic_link_content = $html
}
$json = $payload | ConvertTo-Json -Depth 3 -Compress

$uri = "https://api.supabase.com/v1/projects/$projectRef/config/auth"
Invoke-RestMethod -Method Patch -Uri $uri -Headers @{
  Authorization = "Bearer $token"
  "Content-Type" = "application/json"
} -Body $json | Out-Null

Write-Host "Updated magic-link email template on project $projectRef." -ForegroundColor Green
