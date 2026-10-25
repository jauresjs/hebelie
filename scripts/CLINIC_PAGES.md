# Clinic SEO pages (`/c/<slug>/`)

Static landing pages for Google Search (HTTP 200). The preview app stays in `embed.html` (noindex).

## Generate locally

```bash
# One or more slugs (anon + get_clinic_by_slug):
CLINIC_BUILD_SLUGS=demo-medspa,admin-clinic npm run build:clinics

# All active clinics (recommended for CI):
SUPABASE_SERVICE_ROLE_KEY=... npm run build:clinics
```

Outputs: `c/<slug>/index.html`, `sitemap.xml`, `robots.txt`.

## GitHub Actions

Workflow **Build clinic SEO pages** runs on every push to `main` and daily. Add repo secret **`SUPABASE_SERVICE_ROLE_KEY`** so new clinics are picked up automatically.

## Verify (curl)

```bash
curl -I https://hebelie.com/c/demo-medspa/
# Expect: HTTP/2 200
```

Use the trailing slash URL in links and sitemap.
