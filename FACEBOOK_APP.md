# Meta (Facebook) app settings for Hebelie

Use these URLs in [Meta for Developers](https://developers.facebook.com/) → your app → **Facebook Login** → **Settings**.

## Valid OAuth Redirect URIs (required)

```
https://vqetbgdduoyxbszbrxkl.supabase.co/auth/v1/callback
```

Do **not** put `https://hebelie.com/` here—that is configured in Supabase, not Meta.

## App settings → Basic

| Field | Value |
|--------|--------|
| **App domains** | `hebelie.com` |
| **Privacy Policy URL** | `https://hebelie.com/privacy-policy.html` |
| **Terms of Service URL** | `https://hebelie.com/terms.html` |
| **User data deletion** | Data deletion instructions URL → `https://hebelie.com/data-deletion.html` |
| **Site URL** | `https://hebelie.com/` |

## Supabase

**Authentication → Providers → Facebook**: App ID + App Secret from Meta, enabled.

**Authentication → URL configuration**: Site URL `https://hebelie.com/`; redirect URLs include `https://hebelie.com/**`.

## Go Live

In Development mode only test users can log in. Switch the app to **Live** when ready for the public.

## Contact email

Legal pages use `privacy@hebelie.com`—create that inbox or update the HTML files and Meta contact email to match.
