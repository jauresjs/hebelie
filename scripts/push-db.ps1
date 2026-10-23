# Apply migrations to project vqetbgdduoyxbszbrxkl (Hebelie).
# Requires: supabase login OR SUPABASE_ACCESS_TOKEN, and DB password when prompted.
Set-Location $PSScriptRoot\..

npx --yes supabase@2 link --project-ref vqetbgdduoyxbszbrxkl
npx --yes supabase@2 db push

Write-Host "Deploy edge function:"
Write-Host "  npx supabase secrets set FAL_KEY=your_fal_key"
Write-Host "  npx supabase functions deploy create-preview"
