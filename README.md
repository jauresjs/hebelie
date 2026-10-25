# Hebelie

Static landing + atelier preview. Auth and generation run on Supabase (`create-preview` edge function).

**Local:** `python -m http.server 8000` → open `http://localhost:8000/`

**Config:** `config.js` (anon key + project URL). Backend secrets (`FAL_KEY`, optional `RESEND_*`) live in Supabase only.

**Auth email (magic links):** configure Resend SMTP in Supabase — see [SMTP_SETUP.md](./SMTP_SETUP.md).
