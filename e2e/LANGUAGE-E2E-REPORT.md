# Hebelie language & embed E2E report

**Last full live run:** 2026-11-03  
**Environment:** `https://hebelie.com` + IMAP `@hebelie.com`  
**Password (all test clinics):** `TestE2E-Hebelie-2026!`

---

## Executive summary

| Scenario | Result |
|----------|--------|
| **US** (`test01` → `e2e-us-medspa-nov3`) | **Pass** — no dashboard language row; no embed EN\|FR |
| **CA Québec** (`test02` → `e2e-qc-clinique-nov3`) | **Pass** — dashboard **Français**; RPC `embed_locale: fr`; embed FR + switch |
| **CA Ontario** (`test03` → `e2e-on-medspa-nov3`) | **Pass** — dashboard **English**; RPC `en`; embed EN + switch |
| **France** (`test04` → `e2e-fr-clinique-nov3`) | **Partial** — dashboard language row hidden **Pass**; RPC/embed stay **`en`** (**Fail** — L-3) |
| **demo-medspa** (public CA) | **Pass** — EN/FR toggle, `?lang=fr` |
| **Welcome loader** (`test-clinic-host.html`) | **Skipped** — Computer Use / local host unavailable in automation |

---

## Test clinics (RPC)

| Slug | Email | billing_country | embed_locale | Notes |
|------|--------|-----------------|--------------|--------|
| `e2e-us-medspa-nov3` | test01@hebelie.com | US | en | |
| `e2e-qc-clinique-nov3` | test02@hebelie.com | CA | **fr** | QC signup |
| `e2e-on-medspa-nov3` | test03@hebelie.com | CA | en | ON signup |
| `e2e-fr-clinique-nov3` | test04@hebelie.com | FR | **en** | Expected **fr** (L-3) |
| `demo-medspa` | — | CA | en | `embed_auto_prompt: false` |

---

## Signup → IMAP → confirm

All used `npm run e2e:confirm-link -- --wait 180 --since 30 <email>`.

| Mailbox | Signup | Confirm |
|---------|--------|---------|
| test01@hebelie.com | US / NY (prior run) | Pass |
| test02@hebelie.com | CA / QC | Pass |
| test03@hebelie.com | CA / ON | Pass (use `form.requestSubmit()` if province resets on click) |
| test04@hebelie.com | FR | Pass (CDP set country FR; region group hidden) |

---

## Dashboard — Customize & install

| Clinic | Language field | Default | Welcome popup |
|--------|------------------|---------|---------------|
| US | Hidden | — | On |
| CA QC | Visible | **Français** | On |
| CA ON | Visible | **English** | On |
| FR | Hidden | — | On |

**FR save test (L-3):** After **Save & continue**, RPC still `embed_locale: en` (unchanged; was already `en` at provision).

---

## Visitor embed

| URL | EN\|FR switch | Visitor language |
|-----|---------------|------------------|
| `embed.html?clinic=e2e-us-medspa-nov3` | **Absent** | EN |
| `embed.html?clinic=e2e-on-medspa-nov3` | Present | EN default |
| `embed.html?clinic=e2e-qc-clinique-nov3` | Present | FR (after load) |
| `embed.html?clinic=e2e-fr-clinique-nov3` | **Absent** | EN (should be FR — L-3) |
| `embed.html?clinic=demo-medspa` | Present | EN |
| `embed.html?clinic=demo-medspa&lang=fr` | Present | FR |

### `demo-medspa&lang=fr` (L-1)

| Check | Result |
|-------|--------|
| Headings / CTA FR | **Pass** |
| `#pstate` / `#status` hints FR | **Pass** (this run) |

---

## Loader / popup

| Test | Result |
|------|--------|
| `e2e/test-clinic-host.html?clinic=e2e-us-medspa-nov3&loader=1` | **Skipped** — Cursor Computer Use sidecar unavailable |
| `demo-medspa` + loader | **N/A** — `embed_auto_prompt: false` |

**Manual check:** serve repo root, open host URL, expect ~3s popup for US test clinic (popup on).

---

## Defects

| ID | Severity | Description |
|----|----------|-------------|
| L-3 | **High** | **France signup on `/auth.html` (EN UI):** client provision sends `embed_locale: en` (`pageLocaleFromDocument`) instead of country default **fr**; dashboard save keeps **en**. Server would set `fr` if `embed_locale` omitted (`provision-clinic`). |
| L-6 | Low | **CA signup automation:** first click on Create account can reset province; **`requestSubmit()`** on `#proSignUpForm` after filling fields is reliable. |
| L-5 | Fixed | `[hidden]` vs CSS grid/flex; `embed.css?v=2` cache-bust |

---

## Artifacts

- `e2e/fetch-confirm-link.mjs`, `e2e/README.md`
- Public pages: `/c/e2e-*-nov3/`
