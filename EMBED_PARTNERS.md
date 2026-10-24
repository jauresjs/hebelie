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

## Clinic leads dashboard

Staff sign in at **[https://hebelie.com/dashboard.html](https://hebelie.com/dashboard.html)** to see leads from their embed (no email required if they prefer the portal).

## Onboard a new clinic

1. Insert the clinic:

```sql
insert into public.clinics (slug, name, lead_email, accent_color)
values ('acme-medspa', 'Acme Medspa', 'frontdesk@acme.com', '#8B7355');
```

2. After the practice owner signs in once (Google/Facebook/email), link their auth user:

```sql
insert into public.clinic_members (clinic_id, user_id)
select c.id, 'USER_UUID_FROM_SUPABASE_AUTH'
from public.clinics c
where c.slug = 'acme-medspa';
```

(Find `USER_UUID` in Supabase → Authentication → Users.)

3. Optional: set `RESEND_API_KEY` + `RESEND_FROM` on edge functions for instant email alerts on new leads.

## Demo tenant

- Embed: [https://hebelie.com/c/demo-medspa](https://hebelie.com/c/demo-medspa)
- Default `lead_email`: `privacy@hebelie.com`

## Privacy

- https://hebelie.com/privacy-policy.html
- https://hebelie.com/data-deletion.html
