# Supabase Auth email via Resend SMTP

Supabase’s built-in mail is rate-limited (fine for dev only). For magic-link sign-in on `auth.html`, configure **custom SMTP** in the Supabase Dashboard.

**Never commit API keys.** Store the Resend key only in Supabase SMTP settings and in Edge Function secrets (see below).

## 1. Resend

1. [resend.com](https://resend.com) → **Domains** → add and verify your sending domain (e.g. `hebelie.com`).
2. **API Keys** → create a key with **Sending access** (rotate any key that was ever pasted in chat or committed).
3. Note your **From** address, e.g. `Hebelie <auth@hebelie.com>` (must use a verified domain).

## 2. Supabase → Authentication → SMTP

Enable **Custom SMTP** and use Resend’s SMTP endpoint.

**Or via Management API** (personal access token `sbp_…`, not the `service_role` JWT):

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"smtp_host":"smtp.resend.com","smtp_port":"465","smtp_user":"resend","smtp_pass":"re_xxxx","smtp_admin_email":"auth@yourdomain.com","smtp_sender_name":"Hebelie","rate_limit_email_sent":100}'
```

Dashboard fields:

| Setting        | Value              |
|----------------|--------------------|
| Host           | `smtp.resend.com`  |
| Port           | `465` (SSL) or `587` (STARTTLS) |
| Username       | `resend`           |
| Password       | Your Resend API key (`re_…`) |
| Sender email   | `auth@yourdomain.com` (verified in Resend) |
| Sender name    | `Hebelie`          |

Save, then trigger a test from **Authentication → Email Templates** or submit email on:

`https://hebelie.com/auth.html?as=professional`

## 3. Redirect URLs (still required)

**Authentication → URL configuration**

- Site URL: `https://hebelie.com`
- Redirect URLs: `https://hebelie.com/**` (include `auth.html` magic-link returns)

## 4. Lead notifications (separate from Auth SMTP)

Embed lead emails use the **`notify-lead`** edge function, not Auth SMTP.

Set Supabase **Edge Function secrets**:

```bash
npx supabase secrets set RESEND_API_KEY=re_xxxx
npx supabase secrets set RESEND_FROM="Hebelie <auth@hebelie.com>"
```

You may use the same Resend account; using **two API keys** (Auth SMTP vs functions) is optional but good for rotation.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| No email at all | Resend **Logs**; Supabase **Auth logs**; sender domain verified |
| “Rate limit” after 2 sends | SMTP not enabled or wrong password → still on default mail |
| Link opens signup, no dashboard | Deploy latest `auth-page.js`; redirect URLs; request a **new** link after deploy |
| `onboarding@resend.dev` | Only for Resend sandbox testing; use your domain in production |
