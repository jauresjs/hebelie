# Hebelie language & embed E2E report

**Date:** 2026-11-03  
**Environment:** Production `https://hebelie.com`  
**Tester:** Automated browser + Supabase public RPC checks  
**Local host:** `http://127.0.0.1:8765/test-clinic-host.html` (see `e2e/test-clinic-host.html`)

---

## Executive summary

| Area | Result |
|------|--------|
| **US pro signup (Yopmail)** | **Partial** — account created, confirmation email requested; **dashboard/embed not reachable** without email link |
| **CA Québec signup** | **Blocked** — form submit failed validation (province reset in UI mid-run) |
| **CA embed (demo clinic)** | **Pass** — EN/FR switch, `?lang=fr`, French copy |
| **US embed (no US clinic in DB)** | **Not tested live** — no confirmed US clinic slug after signup |
| **Welcome popup on test site** | **N/A** — `demo-medspa` has `embed_auto_prompt: false` |
| **Dashboard language UI (US vs CA)** | **Not tested** — requires authenticated session |

**Overall:** Core **visitor embed language** behavior works for **Canadian** clinics (`demo-medspa`). Full **multi-country signup → dashboard → install → embed** path is **blocked by email confirmation** and Yopmail inbox access from automation.

### Update — US path via IMAP (`test01@hebelie.com`)

| Step | Result |
|------|--------|
| Pro signup US / NY | **Pass** |
| IMAP confirm link (~20s) | **Pass** (`npm run e2e:confirm-link -- --wait 180 --since 30 test01@hebelie.com`) |
| Confirm → dashboard session | **Pass** (redirect to `dashboard.html?from_auth=1`) |
| Clinic provisioned | **Pass** — slug `e2e-us-medspa-nov3`, `billing_country: US`, `embed_locale: en` |
| Welcome popup default | **Pass** — checkbox on in Customize & install |
| US dashboard hides language field | **Fail (CSS)** — logic sets `hidden` but `.field-row{display:grid}` kept it visible → fixed locally |
| US embed hides EN\|FR switch | **Fail (CSS)** — `embedLangSwitch.hidden=true` but `.embed-lang{display:flex}` kept it visible → fixed locally |

**Password:** `TestE2E-Hebelie-2026!` (same as prior Yopmail run).

---

## Test accounts (Yopmail)

| Label | Email | Signup status | Clinic in DB (`get_clinic_by_slug`) |
|-------|--------|---------------|--------------------------------------|
| US / NY | `hebelie-e2e-us-nov3@yopmail.com` | Submitted; “confirmation email” message shown | **No** (`e2e-us-medspa-test` → `[]`) |
| CA / QC | `hebelie-e2e-ca-qc@yopmail.com` | Incomplete (validation / password fields) | **No** |

**Password used (US signup):** `TestE2E-Hebelie-2026!`  
**Note:** Clinic row is created on **first successful login** after email confirm (`ensureClinicForSession`), not at signup submit.

---

## 1. US professional signup

**Steps:** `auth.html?as=professional&mode=signup` → US, NY, clinic “E2E US Medspa Test”, Yopmail email, password → Create account.

**Observed:**
- Success copy: request received, **confirmation email** sent; fields locked.
- **Login before confirm:** Could not access dashboard (password sign-in did not proceed to dashboard in automation).
- **Public API:** `get_clinic_by_slug('e2e-us-medspa-test')` returned **empty** → clinic not provisioned yet (expected until confirm + login).

**Expected after confirm (code):**
- `billing_country: US` → dashboard **hides** “Default language for patients”.
- `embed_locale` forced **en** on save.
- Embed **no** EN|FR switch.

**Status:** Signup path OK; **downstream not verified** in this run.

---

## 2. Canadian embed — `demo-medspa` (RPC baseline)

```json
{
  "slug": "demo-medspa",
  "billing_country": "CA",
  "embed_locale": "en",
  "embed_auto_prompt": false
}
```

### 2a. Default English embed

**URL:** `https://hebelie.com/embed.html?clinic=demo-medspa`

| Check | Result |
|-------|--------|
| Welcome title EN | **Pass** — “See your result before you consult” |
| EN \| FR switch visible | **Pass** |
| CTA “Try on myself” | **Pass** |

### 2b. In-embed FR toggle

**Action:** Click **FR**.

| Check | Result |
|-------|--------|
| Title FR | **Pass** — “Voyez le résultat avant votre consultation” |
| CTA FR | **Pass** — “Essayer sur moi” |
| Treatment section FR | **Pass** — “Sélection des traitements” |
| Page title | **Pass** — “Demo Medspa – Aperçu de traitement” |

### 2c. URL `?lang=fr`

**URL:** `https://hebelie.com/embed.html?clinic=demo-medspa&lang=fr`

| Check | Result |
|-------|--------|
| Main copy FR | **Pass** |
| `#status` / `#pstate` initial EN | **Fail (minor)** — “Choose treatments…”, “No portrait yet.” stay EN until toggle or clinic load sync |
| Studio empty state EN | **Fail (minor)** — “Upload or capture your portrait to begin.” after FR toggle (studio-empty path not re-i18n) |

### 2d. Fictional website + loader

**URL:** `http://127.0.0.1:8765/test-clinic-host.html?clinic=demo-medspa&loader=1`

| Check | Result |
|-------|--------|
| Loader script loads | **Assumed** (no console errors checked) |
| 3s welcome popup | **Not shown** — correct: `embed_auto_prompt: false` for demo |

---

## 3. Dashboard language rules (not exercised live)

From code + product spec (requires CA/US logged-in clinics):

| Country | “Default language for patients” (below Booking URL) | Welcome popup default (new clinics) |
|---------|------------------------------------------------------|-------------------------------------|
| **US** | Hidden | `true` on new provision |
| **CA** | Shown; QC → default **FR**, other provinces → **EN** | `true` on new provision |

**Not verified in browser** — no confirmed dashboard sessions in this run.

---

## 4. France / other countries

**Not run** (signup incomplete). **Code expectation:**
- **FR** at provision → `embed_locale: fr`.
- Dashboard language dropdown **hidden** (non-CA).
- **Risk (known):** saving customize form may send `embed_locale: en` for non-CA clinics — **needs test after FR account exists**.

---

## 5. Blockers & tooling limits

1. **Email confirmation** — Supabase requires confirm link; automation could not reliably read **Yopmail** (iframe / API).
2. **Yopmail curl** — Empty responses from inbox scrape in shell.
3. **Shadow DOM** — Welcome popup in `embed-loader.js` not visible in accessibility snapshot (manual/screenshot needed when `embed_auto_prompt: true`).
4. **US embed** — No US clinic slug available without completing confirm flow.

---

## 6. Defects / follow-ups

| ID | Severity | Description |
|----|----------|-------------|
| L-1 | Low | On `?lang=fr` first paint, `#status` / `#pstate` not synced to French until `syncEmbedStatusHints` after clinic fetch |
| L-2 | Low | After FR toggle, `studio-empty` message can remain English |
| L-3 | Medium | **France / non-CA:** dashboard save may force `embed_locale` to `en` — confirm with live FR clinic |
| L-4 | Test | Re-run with **`test01@hebelie.com` … IMAP** (`npm run e2e:confirm-link`) or disable email confirm in staging |
| L-5 | **Fixed (local)** | **`[hidden]` + `display:grid/flex`** on dashboard `.field-row` and embed `.embed-lang` — deploy `dashboard.html` + `lib/embed.css` |

---

## 7. Recommended re-test (manual or Agent with inbox)

1. Sign up with `test01@hebelie.com` → `npm run e2e:confirm-link -- --wait 180 test01@hebelie.com` → open link → login → **Customize & install**: no language field; popup default **on** for new clinic.
2. Complete **CA QC** signup → language default **Français**; snippet contains `lang=fr`.
3. Complete **CA ON** signup → default **English**; switch still on embed.
4. **FR** signup → embed French; verify save does not revert to English (L-3).
5. Enable popup on a CA test clinic → loader on `test-clinic-host.html` → popup language matches `embed_locale`.

---

## Artifacts

- `e2e/test-clinic-host.html` — fictional clinic page
- `e2e/rpc-*.json` — Supabase RPC bodies used for API checks
- Screenshot: local host page (no popup; demo prompt off)
