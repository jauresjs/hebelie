# Embed Hebelie on your medspa site

## Quick start

1. We create a row in `clinics` with your **slug**, **name**, and **lead_email**.
2. Paste this iframe on your website (replace `demo-medspa` with your slug):

```html
<iframe
  src="https://hebelie.com/embed.html?clinic=demo-medspa"
  title="Treatment preview"
  style="width:100%;max-width:520px;border:0;min-height:920px"
  allow="camera"
></iframe>
```

3. Set Supabase secrets for lead email (optional but recommended):
   - `RESEND_API_KEY` — from [resend.com](https://resend.com)
   - `RESEND_FROM` — verified sender, e.g. `Hebelie <notifications@hebelie.com>`

## Demo tenant

- URL: [https://hebelie.com/embed.html?clinic=demo-medspa](https://hebelie.com/embed.html?clinic=demo-medspa)
- Seed slug: `demo-medspa` (change `lead_email` in Supabase before production use)

## Add a new clinic (SQL)

```sql
insert into public.clinics (slug, name, lead_email, accent_color)
values ('acme-medspa', 'Acme Medspa', 'frontdesk@acme.com', '#8B7355');
```

## Privacy

Embedded previews use the same auth and data practices as hebelie.com. Link your site’s privacy notice to:

- https://hebelie.com/privacy-policy.html
- https://hebelie.com/data-deletion.html

## OAuth redirect

Sign-in redirects back to the same embed URL (`embed.html?clinic=…`). No extra Meta/Google redirect URIs beyond what Hebelie already uses (`hebelie.com` + Supabase callback).
