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

## Hero images

The hero is one before/after frame, not two pictures side by side: `before.webp` and `after.webp`
are stacked in the same box and the top layer is revealed with `clip-path`, so **both files must be
the same crop and the same pixel size** (currently 1086×1448, i.e. 3:4 — the frame matches that with
`.hero-cmp { aspect-ratio: 3/4 }`). Mismatched ratios show up as a jump when you drag the divider.

The `.png` files are the originals; the page loads the `.webp` versions, which are ~20× smaller
(2.35 MB → 113 KB). After swapping in new photos, re-encode them:

```
python -c "from PIL import Image; [Image.open(n+'.png').convert('RGB').save(n+'.webp','WEBP',quality=84,method=6) for n in ('before','after')]"
```

If your new photos aren't 3:4, change `aspect-ratio` on `.hero-cmp` to match, otherwise
`object-fit: cover` will crop them.

On load the divider sweeps once (50% → 100% → 0% → 50% over 3.2 s) to show it's draggable, then
parks at 50%. Any pointer or key input cancels the sweep, and `prefers-reduced-motion` skips it and
starts at 50%.

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
