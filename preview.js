// Vercel serverless function (CommonJS). Keeps the fal.ai key and prompts off the client.
// Env vars: FAL_KEY (required), ALLOWED_ORIGIN (your site, e.g. https://clinic.com)
// Needs lib/prompts.js next to this api/ folder (outside api/, so it is not exposed as an endpoint).

const { buildRequest } = require("../lib/prompts.js");

const INTENSITIES = ["light", "medium"];

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image, procedures, intensity = "light" } = req.body || {};
  if (typeof image !== "string" || !image.startsWith("data:image/") || !INTENSITIES.includes(intensity))
    return res.status(400).json({ error: "Invalid request" });

  let body;
  try {
    body = buildRequest(procedures, intensity, image, 1); // throws on unknown id or more than 3
  } catch (e) {
    return res.status(400).json({ error: "Invalid request" });
  }

  try {
    const r = await fetch("https://fal.run/fal-ai/nano-banana/edit", {
      method: "POST",
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    const url = data?.images?.[0]?.url;
    if (!r.ok || !url) return res.status(502).json({ error: "Generation failed" });
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: "4mb" } } };
