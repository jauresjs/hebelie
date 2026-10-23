# Hebelie — preview (static build)

Single-tenant AI treatment visualiser. No build step, no server: `index.html` is the whole page,
`lib/` holds the two ES modules it imports, and fal.ai is called directly from the browser through
its **queue** API (submit → poll `status_url` → fetch `response_url`) so a ~10 s generation never
hangs on one long request.

## Run locally

```
python -m http.server 8000
```

then open http://localhost:8000. Opening `index.html` from `file://` will not work — the browser
blocks ES module imports on that origin.

## Configuration

Everything lives in the `CONFIG` object at the top of the `<script type="module">` block in
`index.html`:

| key | meaning |
| --- | --- |
| `falKey` | fal.ai key. Empty string = demo mode, the page echoes the uploaded photo back. |
| `model` | `fal-ai/nano-banana/edit` |
| `intensity` | `light` (default) or `medium` |
| `leadUrl`, `bookingUrl` | unused placeholder / CTA target |

Request shape is pinned by `lib/prompts.js`: `output_format: "jpeg"`, `sync_mode: false`,
`num_images: 1`, `limit_generations: true`.

## Known limits

- **The fal key ships in the page.** Static hosting leaves nowhere to hide it, so it is public and
  anyone can spend against it. Set a spending cap on the fal account, treat the key as disposable,
  and rotate it if the site gets any real traffic.
- **Upstream moderation rejects some ordinary photos.** fal returns
  `content_policy_violation` / `model_moderated` (HTTP 422, *after* the job reports `COMPLETED`).
  This comes from Google's checker, not fal's — `enable_safety_checker: false` does not bypass it,
  it was tested. `lib/fal.js` maps it to its own `moderated` error kind and a specific message.
  Expect real drop-off here; a second model as fallback would be the proper fix.
- `preview.js` in the repo root is dead code left over from the earlier `/api/preview` server
  version. It imports a module that no longer exists and is not loaded by the page.
