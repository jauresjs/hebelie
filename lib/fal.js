// fal.ai queue client. Browser-only: submit, poll status, fetch result.

const QUEUE = "https://queue.fal.run";

export class FalError extends Error {
  constructor(kind, status, detail) {
    super(kind);
    this.name = "FalError";
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(url, key) {
  const r = await fetch(url, { headers: { Authorization: `Key ${key}` } });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

function kindOf(status, data) {
  const detail = data && Array.isArray(data.detail) ? data.detail : [];
  if (detail.some(d => d && d.type === "content_policy_violation")) return "moderated";
  if (status === 401 || status === 403) return "auth";
  return "failed";
}

export async function submit(key, model, input) {
  const r = await fetch(`${QUEUE}/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data || !data.request_id) {
    throw new FalError(kindOf(r.status, data), r.status, data);
  }
  return data;
}

export async function runEdit({ key, model, input, timeoutMs = 95000, onStatus }) {
  const job = await submit(key, model, input);
  const started = Date.now();
  let delay = 1500;

  while (Date.now() - started < timeoutMs) {
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.35), 3000);

    const s = await call(job.status_url, key);
    const status = s.data && s.data.status;

    if (status === "COMPLETED") {
      const out = await call(job.response_url, key);
      const url = out.data && out.data.images && out.data.images[0] && out.data.images[0].url;
      if (!url) throw new FalError(kindOf(out.status, out.data), out.status, out.data);
      return url;
    }
    if (!s.ok || (status && status !== "IN_QUEUE" && status !== "IN_PROGRESS")) {
      throw new FalError(kindOf(s.status, s.data), s.status, s.data);
    }
    if (onStatus) onStatus(status, s.data && s.data.queue_position);
  }
  throw new FalError("timeout", 0, null);
}

export function friendly(e) {
  if (e && e.kind === "moderated") return "This photo could not be used for a preview. Try a different photo, ideally a plain, front-facing shot in even light.";
  if (e && e.kind === "auth") return "The preview service is not available right now. Please try again later.";
  if (e && e.kind === "timeout") return "This is taking longer than usual. Please try again.";
  if (e && e.kind === "invalid") return "That photo did not come through. Try uploading it again.";
  if (e && e.status === 429) return "The studio is busy right now. Give it a moment and try again.";
  return "We could not create your preview. Try a different photo in even light, or try again in a moment.";
}
