# Apply migrations to project vqetbgdduoyxbszbrxkl (Hebelie).
# Requires: supabase login OR SUPABASE_ACCESS_TOKEN, and DB password when prompted.
Set-Location $PSScriptRoot\..

npx --yes supabase@2 link --project-ref vqetbgdduoyxbszbrxkl
npx --yes supabase@2 db push

Write-Host "Deploy edge functions:"
Write-Host "  npx supabase secrets set FAL_KEY=your_fal_key"
Write-Host "  npx supabase secrets set STRIPE_SECRET_KEY=sk_..."
Write-Host "  npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_..."
Write-Host "  npx supabase secrets set SITE_URL=https://hebelie.com"
Write-Host "  npx supabase functions deploy create-preview"
Write-Host "  npx supabase functions deploy billing-checkout billing-portal stripe-webhook"
Write-Host "See BILLING_SETUP.md for Stripe products and webhook events."
