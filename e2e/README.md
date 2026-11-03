# Hebelie E2E helpers

## Email confirmation (IMAP)

Production signup sends a Supabase confirmation link to the address you use on `auth.html`. Test inboxes on `@hebelie.com` can be read over IMAP on `mx.hebelie.com`.

### Setup

1. Copy `e2e/mail.config.example.json` → `e2e/mail.config.local.json` (gitignored).
2. Fill in account passwords. On the VPS mail server, set `"host": "127.0.0.1"` under `imap` when running there.
3. If IMAP TLS fails with a hostname/cert mismatch on the public MX, set `"tlsRejectUnauthorized": false` (lab only) and fix the server certificate when you can.
4. Install deps: `npm install`

### Fetch confirm link after signup

```bash
# One-shot: latest link in the last 60 minutes
npm run e2e:confirm-link -- test01@hebelie.com

# Poll up to 3 minutes (run right after submitting signup)
npm run e2e:confirm-link -- --wait 180 test01@hebelie.com

# Tighter window if the inbox is clean
npm run e2e:confirm-link -- --since 15 --wait 120 test02@hebelie.com
```

Open the printed URL in a browser (or pass it to Playwright). After confirm, log in with the same password you used at signup.

### Suggested account map

| Mailbox | Scenario |
|---------|----------|
| `test01@hebelie.com` | US / NY pro signup |
| `test02@hebelie.com` | CA / Québec |
| `test03@hebelie.com` | CA / Ontario |
| `test04@hebelie.com` | France |
| `test05+` | Spare / reruns |

Delete the Supabase Auth user between full reruns to avoid slug collisions.

### Local embed host

`e2e/test-clinic-host.html` — serve repo root, e.g. `npx serve -p 8765` and open `http://127.0.0.1:8765/e2e/test-clinic-host.html`.

See `LANGUAGE-E2E-REPORT.md` for the last production language/embed pass/fail matrix.
