# Hebelie language & embed E2E report

**Last live run:** 2026-11-03 (post-deploy `4073d7d` + `51be280`)  
**Environment:** Production `https://hebelie.com`  
**Tester:** Automated browser + Supabase RPC  
**Accounts:** `test01@hebelie.com` (US clinic `e2e-us-medspa-nov3`)

---

## Executive summary (live re-run)

| Area | Result |
|------|--------|
| **RPC baselines** | **Pass** — `demo-medspa` (CA), `e2e-us-medspa-nov3` (US) |
| **CA embed `demo-medspa`** | **Pass** — EN default, FR toggle, French copy |
| **CA embed `?lang=fr`** | **Partial** — main UI FR; `#status` / `#pstate` still EN (L-1) |
| **US embed `e2e-us-medspa-nov3`** | **Pass** (after `embed.css?v=2`) — no EN\|FR switch |
| **US dashboard (`test01`)** | **Pass** — language row not shown; welcome popup **on** |
| **CA QC / ON / FR signup → dashboard** | **Not run** this session |
| **Welcome popup on test host** | **Not run** — automation could not open local `test-clinic-host.html`; `demo-medspa` has `embed_auto_prompt: false` |

---

## RPC

| Slug | billing_country | embed_locale |
|------|-----------------|--------------|
| `demo-medspa` | CA | en |
| `e2e-us-medspa-nov3` | US | en |

---

## 1. Canadian embed — `demo-medspa`

### 1a. Default English

**URL:** `https://hebelie.com/embed.html?clinic=demo-medspa`

| Check | Result |
|-------|--------|
| Welcome title EN | **Pass** |
| EN \| FR switch | **Pass** (visible) |
| CTA “Try on myself” | **Pass** |

### 1b. FR toggle

| Check | Result |
|-------|--------|
| Title FR | **Pass** |
| CTA “Essayer sur moi” | **Pass** |
| Treatment section FR | **Pass** |
| Document title FR | **Pass** |
| Studio empty hint after toggle | **Pass** (FR) |

### 1c. `?lang=fr`

**URL:** `https://hebelie.com/embed.html?clinic=demo-medspa&lang=fr`

| Check | Result |
|-------|--------|
| Headings / CTA FR | **Pass** |
| `#pstate` “No portrait yet.” | **Fail (L-1)** |
| `#status` “Choose treatments…” | **Fail (L-1)** |

### 1d. Loader on fictional site

| Check | Result |
|-------|--------|
| `test-clinic-host.html?loader=1` | **Skipped** (local host not reachable from browser automation) |
| Popup on `demo-medspa` | **N/A** — `embed_auto_prompt: false` |

---

## 2. US clinic — `e2e-us-medspa-nov3`

### 2a. Embed

**URL:** `https://hebelie.com/embed.html?clinic=e2e-us-medspa-nov3`

| Check | Result |
|-------|--------|
| EN \| FR switch absent | **Pass** (requires fresh `embed.html` → `embed.css?v=2`) |
| English visitor copy | **Pass** |

**Note:** Uncached `embed.css` without `.embed-lang[hidden]` left the switch visible while `hidden=true`. Fixed with CSS + cache-bust on stylesheet link.

### 2b. Dashboard (`test01@hebelie.com`, signed in)

**URL:** `https://hebelie.com/dashboard.html?tab=embed`

| Check | Result |
|-------|--------|
| Clinic name | **Pass** — E2E US Medspa Nov3 |
| “Default language for patients” hidden | **Pass** (`#embedLocaleBlock` `display: none`; use fresh HTML if cached) |
| Welcome popup default | **Pass** — checked |
| Free trial usage | **Pass** — 10 previews |
| Public page link | **Pass** — `/c/e2e-us-medspa-nov3/` |

---

## 3. Signup + IMAP (earlier same day)

| Step | Result |
|------|--------|
| US / NY signup → `test01@hebelie.com` | **Pass** |
| IMAP confirm link | **Pass** |
| Confirm → dashboard | **Pass** |

Password: `TestE2E-Hebelie-2026!`

---

## 4. Not run (follow-up)

1. **CA Québec** signup (`test06+`) → dashboard language default **Français**, snippet `lang=fr`
2. **CA Ontario** → default **English**, embed switch still shown
3. **France** signup → L-3 (save forcing `embed_locale: en`)
4. **Loader popup** on `test-clinic-host.html` with US clinic (`embed_auto_prompt: true`) — manual or local Playwright

---

## Defects / follow-ups

| ID | Severity | Description |
|----|----------|-------------|
| L-1 | Low | `?lang=fr` first paint: `#status` / `#pstate` stay EN until sync |
| L-2 | Low | (Retest) studio-empty after FR toggle — **pass** on live toggle path |
| L-3 | Medium | FR / non-CA dashboard save may force `embed_locale: en` — needs FR clinic |
| L-5 | **Fixed** | `[hidden]` vs `display:grid/flex` — deployed; **embed.css** cache-bust `?v=2` |

---

## Artifacts

- `e2e/test-clinic-host.html`
- `e2e/fetch-confirm-link.mjs` + `e2e/README.md`
- `npm run e2e:confirm-link -- --wait 180 test01@hebelie.com`
