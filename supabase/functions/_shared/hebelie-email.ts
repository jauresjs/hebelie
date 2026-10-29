/** Branded transactional email layout (inline styles for client compatibility). */

export const SITE_URL = "https://hebelie.com";
export const LOGO_URL = `${SITE_URL}/logo.jpg`;

export function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type EmailCta = { label: string; href: string };

export type HebelieEmailOptions = {
  preheader: string;
  kicker: string;
  title: string;
  bodyHtml: string;
  cta?: EmailCta;
};

const C = {
  ivory: "#FAF8F4",
  cream: "#F3F0E8",
  ink: "#141412",
  muted: "#6E6A63",
  line: "#E0DBD2",
  bronze: "#9A8565",
  bronzeLight: "#C4B49A",
};

export function renderHebelieEmail(opts: HebelieEmailOptions): string {
  const preheader = escapeHtml(opts.preheader);
  const kicker = escapeHtml(opts.kicker);
  const title = escapeHtml(opts.title);
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0">
<tr><td align="center" style="border-radius:0;background:${C.ink}">
<a href="${escapeHtml(opts.cta.href)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;font-family:Inter,system-ui,sans-serif;font-size:11px;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;color:#FAF8F4;text-decoration:none">${escapeHtml(opts.cta.label)}</a>
</td></tr></table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
<!--[if mso]><style type="text/css">body,table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${C.ivory};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.ivory}">
<tr><td align="center" style="padding:40px 16px 48px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="padding:0 0 24px;border-bottom:1px solid ${C.line}">
<a href="${SITE_URL}" style="text-decoration:none">
<span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:400;letter-spacing:0.04em;color:${C.ink}">Hebelie</span>
</a>
</td></tr>
<tr><td style="padding:32px 28px;background-color:${C.cream};border:1px solid ${C.line}">
<p style="margin:0 0 12px;font-family:Inter,system-ui,sans-serif;font-size:10px;font-weight:500;letter-spacing:0.28em;text-transform:uppercase;color:${C.bronze}">${kicker}</p>
<h1 style="margin:0 0 20px;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:300;line-height:1.15;letter-spacing:-0.02em;color:${C.ink}">${title}</h1>
<div style="font-family:Inter,system-ui,sans-serif;font-size:15px;font-weight:300;line-height:1.65;color:${C.ink}">${opts.bodyHtml}</div>
${cta}
</td></tr>
<tr><td style="padding:28px 8px 0;font-family:Inter,system-ui,sans-serif;font-size:12px;line-height:1.6;color:${C.muted};text-align:center">
<p style="margin:0 0 8px">AI-generated simulation for illustration only. Outcomes vary.</p>
<p style="margin:0"><a href="${SITE_URL}/privacy-policy.html" style="color:${C.ink}">Privacy</a> · <a href="${SITE_URL}/terms.html" style="color:${C.ink}">Terms</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function detailRow(label: string, value: string) {
  if (!value) return "";
  return `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${C.line};font-family:Inter,system-ui,sans-serif;font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${C.muted};vertical-align:top;width:38%">${escapeHtml(label)}</td>
<td style="padding:10px 0 10px 12px;border-bottom:1px solid ${C.line};font-family:Inter,system-ui,sans-serif;font-size:15px;font-weight:400;color:${C.ink};vertical-align:top">${escapeHtml(value)}</td>
</tr>`;
}

export function detailTable(rows: string) {
  if (!rows.trim()) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0">${rows}</table>`;
}

export function previewImagePair(beforeUrl: string | null, afterUrl: string | null) {
  if (!beforeUrl && !afterUrl) return "";
  const cell = (label: string, url: string | null) => {
    if (!url) return `<td width="50%" style="padding:0 6px 0 0;vertical-align:top"></td>`;
    const href = escapeHtml(url);
    return `<td width="50%" style="padding:0 6px;vertical-align:top">
<p style="margin:0 0 8px;font-family:Inter,system-ui,sans-serif;font-size:10px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${C.muted}">${escapeHtml(label)}</p>
<a href="${href}" target="_blank" rel="noopener"><img src="${href}" alt="${escapeHtml(label)}" width="240" style="display:block;width:100%;max-width:240px;height:auto;border:1px solid ${C.line}" /></a>
</td>`;
  };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0">
<tr>${cell("Before", beforeUrl)}${cell("After preview", afterUrl)}</tr>
</table>
<p style="margin:12px 0 0;font-size:13px;color:${C.muted}">Links expire after seven days. Open your dashboard for the latest files.</p>`;
}

export type LeadEmailPayload = {
  clinicName: string;
  kind: "consultation" | "preview";
  leadName: string;
  leadEmail: string;
  phone?: string | null;
  treatments?: string;
  beforeUrl?: string | null;
  afterUrl?: string | null;
};

export function buildLeadEmailContent(payload: LeadEmailPayload): {
  subject: string;
  text: string;
  html: string;
} {
  const isConsult = payload.kind === "consultation";
  const subject = isConsult
    ? `New consultation request – ${payload.leadName}`
    : `New preview lead – ${payload.leadName}`;

  const intro = isConsult
    ? "A visitor requested a consultation from your Hebelie embed."
    : "A patient completed a treatment preview on your embed.";

  const text = [
    isConsult
      ? `New consultation request for ${payload.clinicName}`
      : `New preview lead for ${payload.clinicName}`,
    "",
    intro,
    "",
    `Name: ${payload.leadName}`,
    `Email: ${payload.leadEmail}`,
    payload.phone ? `Phone: ${payload.phone}` : "",
    payload.treatments ? `Treatments: ${payload.treatments}` : "",
    payload.beforeUrl ? `Before photo: ${payload.beforeUrl}` : "",
    payload.afterUrl ? `After preview: ${payload.afterUrl}` : "",
    "",
    "Open your Hebelie dashboard to follow up.",
    "",
    "Sent via Hebelie.",
  ]
    .filter(Boolean)
    .join("\n");

  const rows = [
    detailRow("Name", payload.leadName),
    detailRow("Email", payload.leadEmail),
    detailRow("Phone", payload.phone ?? ""),
    detailRow("Treatments", payload.treatments ?? ""),
  ].join("");

  const bodyHtml = [
    `<p style="margin:0 0 16px;color:${C.muted}">${escapeHtml(intro)}</p>`,
    `<p style="margin:0 0 4px;font-size:13px;color:${C.muted}">Clinic</p>`,
    `<p style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:${C.ink}">${escapeHtml(payload.clinicName)}</p>`,
    detailTable(rows),
    previewImagePair(payload.beforeUrl ?? null, payload.afterUrl ?? null),
  ].join("");

  const html = renderHebelieEmail({
    preheader: `${payload.leadName} · ${payload.treatments || "treatment preview"}`,
    kicker: isConsult ? "Consultation request" : "Preview lead",
    title: isConsult ? "Someone wants a consult" : "New preview on your embed",
    bodyHtml,
    cta: { label: "Open dashboard", href: `${SITE_URL}/dashboard.html` },
  });

  return { subject, text, html };
}

export async function sendResendEmail(opts: {
  to: string[];
  subject: string;
  text: string;
  html: string;
}): Promise<{ ok: boolean; detail?: string }> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return { ok: false, detail: "mail_not_configured" };

  const mail = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM") ?? "Hebelie <onboarding@resend.dev>",
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });

  if (!mail.ok) {
    return { ok: false, detail: await mail.text() };
  }
  return { ok: true };
}
