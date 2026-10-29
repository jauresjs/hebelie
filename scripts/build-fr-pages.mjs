import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "fr");
fs.mkdirSync(outDir, { recursive: true });

const FR_META = {
  "index.html": {
    lang: "fr",
    title: "Hebelie – Le trafic silencieux devient des demandes de consultation",
    description:
      "80 à 90 % des visiteurs d’un med spa partent sans coordonnées. Aperçu de traitements en marque blanche : la demande arrive avec les zones explorées.",
    page: "index",
  },
  "auth.html": {
    lang: "fr",
    title: "Connexion – Hebelie",
    description:
      "Connexion patientes et professionnelles — intégrez l’aperçu esthétique Hebelie à votre med spa.",
    page: "auth",
  },
  "pricing.html": {
    lang: "fr",
    title: "Forfaits – Hebelie pour cliniques",
    description:
      "Forfaits mensuels pour l’aperçu de traitements intégré au site de votre med spa ou clinique esthétique.",
    page: "pricing",
  },
};

function localizeHtml(name, source) {
  let html = source;
  html = html.replace(
    /<html lang="en"[^>]*>/,
    `<html lang="fr" data-i18n-page="${FR_META[name].page}" data-locale="fr">`,
  );
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${FR_META[name].title}</title>`);
  html = html.replace(/\n<link rel="canonical"[^>]*>/g, "");
  html = html.replace(/\n<link rel="alternate" hreflang="[^"]*"[^>]*>/g, "");
  if (html.includes('meta name="description"')) {
    html = html.replace(
      /<meta name="description" content="[^"]*">/,
      `<meta name="description" content="${FR_META[name].description}">`,
    );
  } else if (name === "auth.html") {
    html = html.replace(
      /<title>[^<]*<\/title>/,
      `$&\n<meta name="description" content="${FR_META[name].description}">`,
    );
  }

  html = html.replace(/\.\/lib\//g, "../lib/");
  html = html.replace(/href="\.\/logo\.jpg"/g, 'href="../logo.jpg"');
  html = html.replace(/src="\.\/lib\//g, 'src="../lib/');
  html = html.replace(/href="\.\/(privacy-policy|terms|data-deletion)\.html/g, 'href="./$1.html');
  html = html.replace(/href="\.\/c\//g, 'href="../c/');
  html = html.replace(/href="\.\/auth\.html/g, 'href="./auth.html');
  html = html.replace(/href="\.\/pricing\.html/g, 'href="./pricing.html');
  html = html.replace(/href="\.\/"/g, 'href="./"');
  html = html.replace(/href="\.\/(\?|#)/g, 'href="./$1');

  html = html.replace(
    /<a [^>]*href="\.\/fr\/"[^>]*data-i18n="lang\.switchFr"[^>]*>[\s\S]*?<\/a>/,
    '<a class="nav-link" href="../" data-i18n="lang.switchEn">English</a>',
  );
  html = html.replace(
    /<a [^>]*href="\.\/fr\/auth\.html"[^>]*data-i18n="lang\.switchFr"[^>]*>[\s\S]*?<\/a>/,
    '<a href="../auth.html" data-i18n="lang.switchEn">English</a>',
  );
  html = html.replace(
    /<a [^>]*href="\.\/fr\/pricing\.html"[^>]*data-i18n="lang\.switchFr"[^>]*>[\s\S]*?<\/a>/,
    '<a class="nav-link" href="../pricing.html" data-i18n="lang.switchEn">English</a>',
  );

  const canonical = `https://hebelie.com/fr/${name === "index.html" ? "" : name}`;
  const hreflang = `
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="en" href="https://hebelie.com/${name === "index.html" ? "" : name}">
<link rel="alternate" hreflang="fr" href="${canonical}">
<link rel="alternate" hreflang="x-default" href="https://hebelie.com/${name === "index.html" ? "" : name}">`;
  html = html.replace(/<link rel="icon"/, `${hreflang}\n<link rel="icon"`);

  return html;
}

for (const file of Object.keys(FR_META)) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  fs.writeFileSync(path.join(outDir, file), localizeHtml(file, src));
}

console.log("Wrote fr/index.html, fr/auth.html, fr/pricing.html");
