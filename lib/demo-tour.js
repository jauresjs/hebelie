const EMBED_SRC =
  "/embed.html?clinic=demo-medspa&demo=simulate&start=studio";
const PROMPT_DELAY_MS = 3000;

const isFr =
  document.documentElement.lang === "fr" ||
  document.documentElement.dataset.locale === "fr";

const STEPS_EN = [
  {
    kicker: "Step 1 · Your website",
    title: "This is what visitors see on your site",
    body: "Hebelie lives on your med spa domain—not a separate marketplace. Your brand, your booking flow.",
    spotlight: null,
  },
  {
    kicker: "Step 2 · Preview button",
    title: "They can click Preview anytime",
    body: "The embed adds a branded button on every page. Highlight it for your team—or click it now to open the preview.",
    spotlight: "fab",
  },
  {
    kicker: "Step 3 · Or the 3-second popup",
    title: "Or we prompt them after 3 seconds",
    body: "When auto-prompt is on, curious visitors see this dialog without hunting for a button—same preview, higher engagement.",
    spotlight: "popup",
    autoPopup: true,
  },
  {
    kicker: "Step 4 · Treatments",
    title: "They pick up to three treatments",
    body: "Lips, Botox, cheeks, and more—watch the visitor flow inside the preview (simulated for this tour).",
    spotlight: "embed",
    embedActions: ["pickTreatments", "setPortrait"],
  },
  {
    kicker: "Step 5 · Sign-in gate",
    title: "Sign-in before they see results",
    body: "The preview is gated. They sign in with email or Google—you capture contact details while curiosity is high. Click Next to simulate sign-in.",
    spotlight: "embed",
    embedActions: ["triggerGenerate"],
    waitAuth: true,
  },
  {
    kicker: "Step 6 · Their preview",
    title: "Then they see their before / after",
    body: "AI-generated, directional only—your team confirms what’s appropriate in consult.",
    spotlight: "embed",
    waitPreview: true,
  },
  {
    kicker: "Step 7 · Your lead",
    title: "You get the lead in your dashboard",
    body: "Name, email, treatments explored, and visuals—your front desk follows up already briefed.",
    spotlight: "lead",
  },
];

const STEPS_FR = [
  {
    kicker: "Étape 1 · Votre site",
    title: "Ce que voient vos visiteurs sur votre site",
    body: "Hebelie s’intègre à votre domaine—pas un marketplace séparé. Votre marque, votre parcours de réservation.",
    spotlight: null,
  },
  {
    kicker: "Étape 2 · Bouton aperçu",
    title: "Ils peuvent cliquer Aperçu à tout moment",
    body: "L’embed ajoute un bouton de marque sur chaque page. Mettez-le en avant pour votre équipe—ou cliquez pour ouvrir l’aperçu.",
    spotlight: "fab",
  },
  {
    kicker: "Étape 3 · Popup à 3 secondes",
    title: "Ou nous les invitons après 3 secondes",
    body: "Avec l’invite automatique, les visiteurs curieux voient cette fenêtre sans chercher le bouton—même aperçu, plus d’engagement.",
    spotlight: "popup",
    autoPopup: true,
  },
  {
    kicker: "Étape 4 · Traitements",
    title: "Ils choisissent jusqu’à trois traitements",
    body: "Lèvres, Botox, joues, et plus—suivez le parcours visiteur dans l’aperçu (simulation pour cette démo).",
    spotlight: "embed",
    embedActions: ["pickTreatments", "setPortrait"],
  },
  {
    kicker: "Étape 5 · Connexion",
    title: "Connexion avant de voir le résultat",
    body: "L’aperçu est protégé. Connexion par courriel ou Google—vous capturez le contact au moment de la curiosité. Suivant simule la connexion.",
    spotlight: "embed",
    embedActions: ["triggerGenerate"],
    waitAuth: true,
  },
  {
    kicker: "Étape 6 · Leur aperçu",
    title: "Puis ils voient leur avant / après",
    body: "Généré par IA, à titre indicatif—votre équipe valide ce qui convient en consultation.",
    spotlight: "embed",
    waitPreview: true,
  },
  {
    kicker: "Étape 7 · Votre lead",
    title: "Vous recevez la lead dans votre tableau de bord",
    body: "Nom, courriel, traitements explorés et visuels—votre accueil fait le suivi déjà informé.",
    spotlight: "lead",
  },
];

const STEPS = isFr ? STEPS_FR : STEPS_EN;

const $ = (s) => document.querySelector(s);
const iframe = () => $("#demoEmbedFrame");

function postEmbed(action) {
  const win = iframe()?.contentWindow;
  if (!win) return;
  win.postMessage({ type: "hebelie-demo-tour", action }, "*");
}

function openEmbed() {
  const panel = $("#demoEmbedPanel");
  const frame = iframe();
  if (!panel || !frame) return;
  if (!frame.src) frame.src = EMBED_SRC;
  panel.hidden = false;
}

function closeEmbed() {
  const panel = $("#demoEmbedPanel");
  if (panel) panel.hidden = true;
}

function mountTourPopup() {
  if (document.getElementById("hebelie-tour-prompt-root")) return;
  const origin = location.origin;
  const beforeImg = `${origin}/before.png?v=9`;
  const afterImg = `${origin}/after.png?v=9`;
  const host = document.createElement("div");
  host.id = "hebelie-tour-prompt-root";
  host.innerHTML = `
<div class="hb-backdrop" role="presentation" style="position:fixed;inset:0;z-index:100001;background:rgba(20,20,18,.45);display:flex;align-items:center;justify-content:center;padding:16px">
  <div class="hb-card" role="dialog" aria-modal="true" style="position:relative;max-width:min(22rem,100%);width:100%;background:#FAF8F4;border:1px solid #E0DBD2;padding:24px 20px;box-shadow:0 24px 48px rgba(0,0,0,.12)">
    <h2 style="margin:0 0 12px;font:400 1.25rem/1.25 Georgia,serif;text-align:center">${isFr ? "Voyez à quoi cela pourrait ressembler" : "See how it could look on you"}</h2>
    <div class="hb-cmp" style="position:relative;aspect-ratio:3/4;width:100%;max-height:38vh;margin:0 auto 10px;overflow:hidden;background:#F3F0E8;border:1px solid #E0DBD2;--p:50%">
      <div style="position:absolute;inset:0"><img src="${beforeImg}" alt="" style="width:100%;height:100%;object-fit:cover"></div>
      <div class="hb-after" style="position:absolute;inset:0;clip-path:inset(0 0 0 50%)"><img src="${afterImg}" alt="" style="width:100%;height:100%;object-fit:cover"></div>
    </div>
    <p style="margin:0 0 16px;font-size:.88rem;color:#6E6A63;text-align:center">${isFr ? "Demo Medspa — aperçu privé sur votre photo." : "Demo Medspa — try a private preview on your own photo."}</p>
    <button type="button" class="hb-primary" style="display:flex;width:100%;min-height:48px;align-items:center;justify-content:center;border:0;background:#9A8565;color:#fff;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">${isFr ? "Aperçu des traitements" : "Preview treatments"}</button>
  </div>
</div>`;
  host.querySelector(".hb-primary")?.addEventListener("click", () => {
    host.remove();
    openEmbed();
  });
  document.body.appendChild(host);
}

let stepIndex = 0;
let authSeen = false;
let previewSeen = false;
let popupTimer = null;

function renderStep() {
  const step = STEPS[stepIndex];
  const dim = $("#tourDim");
  const fab = $("#hebelie-fab");
  const lead = $("#tourLeadCard");

  $("#tourKicker").textContent = step.kicker;
  $("#tourTitle").textContent = step.title;
  $("#tourBody").textContent = step.body;
  $("#tourStepCount").textContent = `${stepIndex + 1} / ${STEPS.length}`;
  $("#tourBack").hidden = stepIndex === 0;
  const nextLabel = isFr
    ? stepIndex === STEPS.length - 1
      ? "Terminer"
      : "Suivant"
    : stepIndex === STEPS.length - 1
      ? "Done"
      : "Next";
  $("#tourNext").textContent = nextLabel;
  if ($("#tourBack")) {
    $("#tourBack").textContent = isFr ? "Retour" : "Back";
  }

  fab?.classList.remove("is-spotlight");
  dim.hidden = !step.spotlight;
  lead.hidden = step.spotlight !== "lead";
  closeEmbed();
  document.getElementById("hebelie-tour-prompt-root")?.remove();
  if (popupTimer) {
    clearTimeout(popupTimer);
    popupTimer = null;
  }

  if (step.spotlight === "fab") fab?.classList.add("is-spotlight");
  if (step.spotlight === "embed") openEmbed();
  if (step.autoPopup) {
    popupTimer = window.setTimeout(mountTourPopup, PROMPT_DELAY_MS);
  }
  if (step.embedActions?.length) {
    window.setTimeout(() => {
      step.embedActions.forEach((a) => postEmbed(a));
    }, 600);
  }
  if (step.spotlight === "lead") {
    dim.hidden = false;
  }
}

function nextStep() {
  const step = STEPS[stepIndex];
  if (step.waitAuth) {
    if (!authSeen) return;
    postEmbed("completeAuth");
    return;
  }
  if (step.waitPreview && !previewSeen) return;

  if (stepIndex >= STEPS.length - 1) {
    location.href = "./auth.html?as=professional";
    return;
  }
  stepIndex += 1;
  renderStep();
}

function prevStep() {
  if (stepIndex <= 0) return;
  stepIndex -= 1;
  authSeen = false;
  previewSeen = false;
  renderStep();
}

window.addEventListener("message", (e) => {
  if (e.data?.type !== "hebelie-demo-tour") return;
  if (e.data.event === "authRequired") authSeen = true;
  if (e.data.event === "previewReady") {
    previewSeen = true;
    if (STEPS[stepIndex]?.waitPreview || stepIndex === 4) {
      stepIndex = 5;
      renderStep();
    }
  }
});

function init() {
  $("#hebelie-fab")?.addEventListener("click", () => {
    openEmbed();
    const i = STEPS.findIndex((s) => s.spotlight === "fab");
    if (i >= 0 && stepIndex < i) {
      stepIndex = i;
      renderStep();
    }
  });
  $("#tourNext")?.addEventListener("click", () => nextStep());
  $("#tourBack")?.addEventListener("click", () => prevStep());
  renderStep();
}

init();
