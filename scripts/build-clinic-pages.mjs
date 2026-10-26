/**
 * Static SEO landing pages at /c/<slug>/ for GitHub Pages (HTTP 200, indexable).
 * Treatments are global (same 8 as lib/app.js TR) — not per-clinic in the DB.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://hebelie.com";

/** @type {{ key: string, name: string, blurb: string }[]} */
const TREATMENTS = [
  { key: "lips", name: "Lip filler", blurb: "Shape and volume for the lips with a natural finish." },
  { key: "cheeks", name: "Cheek filler", blurb: "Restore mid-face contour and soft lift." },
  { key: "botox", name: "Botox", blurb: "Smooth expression lines with precise, subtle dosing." },
  { key: "jawline", name: "Jawline contour", blurb: "Define the jaw and balance lower-face proportions." },
  { key: "skin", name: "Skin rejuvenation", blurb: "Improve tone and texture for a refreshed look." },
  { key: "browlift", name: "Brow lift", blurb: "Open the eye area with a gentle brow lift effect." },
  { key: "facelift", name: "Facelift", blurb: "Directional lift preview for jowls and lower face." },
  { key: "rhino", name: "Rhinoplasty", blurb: "Explore nasal profile changes on your own photo." },
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cityLabel(_clinic) {
  return "your area";
}

function pageTitle(name) {
  return `${name} — Preview your treatment before you book`;
}

function metaDescription(name, city) {
  return `${name} in ${city}: preview lip filler, Botox, cheek filler, jawline contour, skin rejuvenation, and more on your own photo before you book a consultation.`;
}

function introParagraph(name, city) {
  return `${name} helps patients in ${city} explore aesthetic treatments with a private, AI-assisted preview on their own portrait—so you know what to ask, not what to expect.`;
}

function jsonLd(clinic, city) {
  const url = `${SITE}/c/${clinic.slug}/`;
  return {
    "@context": "https://schema.org",
    "@type": "MedicalBusiness",
    name: clinic.name,
    url,
    areaServed: city,
    medicalSpecialty: "PlasticSurgery",
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Treatment previews",
      itemListElement: TREATMENTS.map((t, i) => ({
        "@type": "Offer",
        position: i + 1,
        itemOffered: {
          "@type": "Service",
          name: t.name,
          description: t.blurb,
        },
      })),
    },
  };
}

function renderPage(clinic) {
  const slug = clinic.slug;
  const name = clinic.name;
  const city = cityLabel(clinic);
  const canonical = `${SITE}/c/${slug}/`;
  const title = pageTitle(name);
  const description = metaDescription(name, city);
  const intro = introParagraph(name, city);
  const embedSrc = `/embed.html?clinic=${encodeURIComponent(slug)}&start=studio`;
  const ld = JSON.stringify(jsonLd(clinic, city), null, 2);

  const treatmentLis = TREATMENTS.map(
    (t) =>
      `      <li><b>${escapeHtml(t.name)}</b><span>${escapeHtml(t.blurb)}</span></li>`
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Hebelie">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${SITE}/logo.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--ivory:#FAF8F4;--ink:#141412;--muted:#6E6A63;--sand:#C4B49A;--line:#E0DBD2;--serif:"Cormorant Garamond",Georgia,serif;--sans:Inter,system-ui,sans-serif}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--ivory);color:var(--ink);font:400 16px/1.65 var(--sans)}
.wrap{width:min(720px,100% - 32px);margin-inline:auto;padding:32px 0 48px}
h1{font:400 clamp(2rem,5vw,2.75rem)/1.1 var(--serif);margin:0 0 16px;letter-spacing:-.02em}
.lead{color:var(--muted);margin:0 0 28px;max-width:42em}
.treatments{list-style:none;margin:0 0 32px;padding:0;border-top:1px solid var(--line)}
.treatments li{padding:14px 0;border-bottom:1px solid var(--line);display:grid;gap:4px}
.treatments b{font:500 1rem var(--sans);color:var(--ink)}
.treatments span{font-size:.92rem;color:var(--muted)}
.demo{margin:0 0 28px;text-align:center}
.demo h2{font:400 1.25rem/1.2 var(--serif);margin:0 0 8px}
.demo p{font-size:.88rem;color:var(--muted);margin:0 0 16px}
.cmp{position:relative;aspect-ratio:3/4;overflow:hidden;background:#F3F0E8;--p:50%;width:100%;max-width:360px;margin:0 auto;border:1px solid var(--line)}
.cmp .L{position:absolute;inset:0}.cmp .L img{width:100%;height:100%;object-fit:cover;display:block}
.cmp .after{clip-path:inset(0 0 0 var(--p))}
.cmp .bar{position:absolute;top:0;bottom:0;left:var(--p);width:1px;background:rgba(255,255,255,.9);pointer-events:none}
.cmp .knob{position:absolute;top:50%;left:var(--p);width:2px;height:72px;margin:-36px 0 0 -1px;background:#fff;pointer-events:none}
.cmp input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:ew-resize;margin:0}
.cmp-drag,.tag{position:absolute;bottom:16px;font-size:.58rem;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.9);pointer-events:none;z-index:2}
.cmp-drag{left:50%;transform:translateX(-50%)}
.tag.b{left:16px}.tag.a{right:16px}
.demo-note{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:12px 0 20px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 28px;border:1px solid var(--ink);background:var(--ink);color:var(--ivory);font:500 .72rem var(--sans);letter-spacing:.14em;text-transform:uppercase;cursor:pointer;text-decoration:none}
.frame{margin:0 0 24px;border:1px solid var(--line);background:#fff;overflow:hidden}
.frame iframe{display:block;width:100%;min-height:920px;border:0}
.frame[hidden]{display:none!important}
.powered{font-size:.78rem;color:var(--muted);text-align:center}
.powered a{color:var(--ink)}
</style>
<script type="application/ld+json">
${ld}
</script>
</head>
<body>
<main class="wrap">
<h1>${escapeHtml(name)}</h1>
<p class="lead">${escapeHtml(intro)}</p>
<ul class="treatments">
${treatmentLis}
</ul>
<section class="demo" aria-labelledby="demoTitle">
<h2 id="demoTitle">Example preview</h2>
<p>Drag to compare before and after—then try it on your own photo.</p>
<div class="cmp" id="demoCmp" aria-label="Example before and after">
<div class="L"><img src="/before.png?v=5" alt="Before example"></div>
<div class="L after"><img src="/after.png?v=5" alt="After example"></div>
<div class="bar"></div><div class="knob"></div>
<span class="tag b">Before</span><span class="tag a">After</span>
<div class="cmp-drag">Drag to compare</div>
<input type="range" min="0" max="100" value="50" aria-label="Compare before and after example">
</div>
<p class="demo-note">Example · Illustration only · Not your photo</p>
<button type="button" class="btn" id="openPreview">Try on myself</button>
</section>
<div class="frame" id="previewFrame" hidden>
<iframe id="previewIframe" title="Preview your treatment — ${escapeHtml(name)}" allow="camera; microphone; fullscreen"></iframe>
</div>
<p class="powered">Powered by <a href="${SITE}/">Hebelie</a></p>
</main>
<script>
(function () {
  var cmp = document.getElementById("demoCmp");
  if (cmp) {
    var r = cmp.querySelector("input");
    r.oninput = function () { cmp.style.setProperty("--p", r.value + "%"); };
    cmp.style.setProperty("--p", "50%");
  }
  var btn = document.getElementById("openPreview");
  var frame = document.getElementById("previewFrame");
  var iframe = document.getElementById("previewIframe");
  if (!btn || !frame || !iframe) return;
  btn.addEventListener("click", function () {
    if (!iframe.src) iframe.src = ${JSON.stringify(embedSrc)};
    frame.hidden = false;
    btn.hidden = true;
    frame.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
</script>
</body>
</html>
`;
}

async function supabaseRest(path, key, options = {}) {
  const res = await fetch(`${CONFIG.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchClinicBySlug(slug, key) {
  const rows = await supabaseRest("/rest/v1/rpc/get_clinic_by_slug", key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_slug: slug }),
  });
  const row = rows?.[0];
  if (!row) return null;
  return {
    slug: String(row.slug).trim().toLowerCase(),
    name: String(row.name).trim(),
  };
}

async function fetchClinics() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    const rows = await supabaseRest(
      "/rest/v1/clinics?active=eq.true&select=slug,name&order=slug.asc",
      serviceKey
    );
    return (rows ?? []).map((r) => ({
      slug: String(r.slug).trim().toLowerCase(),
      name: String(r.name).trim(),
    }));
  }

  const slugs = (process.env.CLINIC_BUILD_SLUGS || "demo-medspa")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const clinics = [];
  for (const slug of slugs) {
    const row = await fetchClinicBySlug(slug, CONFIG.supabaseAnonKey);
    if (row) clinics.push(row);
  }
  return clinics;
}

async function writeRootFile(name, content) {
  const path = join(ROOT, name);
  await writeFile(path, content, "utf8");
}

function buildSitemap(clinics) {
  const urls = [
    `${SITE}/`,
    ...clinics.map((c) => `${SITE}/c/${c.slug}/`),
  ];
  const body = urls
    .map(
      (loc) => `  <url>
    <loc>${escapeHtml(loc)}</loc>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function buildRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
}

async function main() {
  const clinics = await fetchClinics();
  if (!clinics.length) {
    console.error("No active clinics found. Set SUPABASE_SERVICE_ROLE_KEY or CLINIC_BUILD_SLUGS.");
    process.exit(1);
  }

  const unique = [];
  const seen = new Set();
  for (const clinic of clinics.sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (!clinic.slug || seen.has(clinic.slug)) continue;
    seen.add(clinic.slug);
    unique.push(clinic);
    const dir = join(ROOT, "c", clinic.slug);
    await mkdir(dir, { recursive: true });
    const html = renderPage(clinic);
    await writeFile(join(dir, "index.html"), html, "utf8");
    console.log("wrote c/%s/index.html", clinic.slug);
  }

  await writeRootFile("sitemap.xml", buildSitemap(unique));
  await writeRootFile("robots.txt", buildRobots());
  console.log("wrote sitemap.xml, robots.txt (%d clinics)", unique.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
