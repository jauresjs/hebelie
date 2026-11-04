# Embed Hebelie on your medspa site

## Embed URL (pick one)

```text
https://hebelie.com/embed.html?clinic=YOUR-SLUG
https://hebelie.com/c/YOUR-SLUG
```

Iframe example:

```html
<iframe
  src="https://hebelie.com/c/demo-medspa"
  title="Treatment preview"
  style="width:100%;max-width:520px;border:0;min-height:920px"
  allow="camera"
></iframe>
```

## Clinic sign-up & dashboard

1. Open **[https://hebelie.com/auth.html?as=professional](https://hebelie.com/auth.html?as=professional)**.
2. Choose **For professionals**, enter **clinic name**, sign in with Google / Facebook / email.
3. We create `clinics` + `clinic_members` automatically, then open **dashboard.html**.

In **Embed & booking** you can set:

- **Website URL** — your clinic site (reference)
- **Booking URL** — where patients book after a preview
- **Button label & colors** — customize the embed button
- **Copy website button code** — popup button that opens `https://hebelie.com/c/YOUR-SLUG` and collects leads

Manual SQL onboarding is still possible if needed (see migration seed for `demo-medspa`).

Optional: `RESEND_API_KEY` + `RESEND_FROM` for email alerts on new leads.

## Demo tenant

- Embed: [https://hebelie.com/c/demo-medspa](https://hebelie.com/c/demo-medspa)
- Default `lead_email`: `privacy@hebelie.com`

## Privacy

- https://hebelie.com/privacy-policy.html
- https://hebelie.com/data-deletion.html
