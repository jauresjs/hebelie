#!/usr/bin/env node
/**
 * Poll IMAP for Supabase signup / magic-link confirmation URLs (Hebelie auth emails).
 *
 * Usage:
 *   node e2e/fetch-confirm-link.mjs test01@hebelie.com
 *   node e2e/fetch-confirm-link.mjs --wait 180 test02@hebelie.com
 *   node e2e/fetch-confirm-link.mjs --host 127.0.0.1 --list
 *
 * Config: e2e/mail.config.local.json or HEBELIE_MAIL_CONFIG=/path/to.json
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONFIRM_URL_RE =
  /https:\/\/[^\s"'<>\]]+(?:supabase\.co\/auth\/v1\/verify|hebelie\.com\/[^?\s"'<>]*\?[^#\s"'<>]*(?:type=signup|type=magiclink|token_hash=))[^\s"'<>\]]*/gi;

function usage(code = 0) {
  console.log(`Usage: node e2e/fetch-confirm-link.mjs [options] <email>

Options:
  --wait <seconds>   Poll until a link appears (default: 0 = single fetch)
  --since <minutes>  Only consider mail newer than N minutes (default: 60)
  --host <hostname>  Override imap.host (e.g. 127.0.0.1 on VPS)
  --list             List configured account emails
  --json             Print { "url", "messageId" } instead of URL only
  -h, --help         This help
`);
  process.exit(code);
}

function loadConfig() {
  const configPath =
    process.env.HEBELIE_MAIL_CONFIG ||
    join(__dirname, "mail.config.local.json");
  if (!existsSync(configPath)) {
    console.error(
      `Missing mail config. Copy e2e/mail.config.example.json to e2e/mail.config.local.json\n  (${configPath})`,
    );
    process.exit(1);
  }
  return { path: configPath, data: JSON.parse(readFileSync(configPath, "utf8")) };
}

function parseArgs(argv) {
  const opts = {
    waitSec: 0,
    sinceMin: 60,
    host: null,
    list: false,
    json: false,
    email: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") usage(0);
    if (a === "--list") {
      opts.list = true;
      continue;
    }
    if (a === "--json") {
      opts.json = true;
      continue;
    }
    if (a === "--wait") {
      opts.waitSec = Number(argv[++i]);
      continue;
    }
    if (a === "--since") {
      opts.sinceMin = Number(argv[++i]);
      continue;
    }
    if (a === "--host") {
      opts.host = argv[++i];
      continue;
    }
    if (!a.startsWith("-")) opts.email = a;
  }
  return opts;
}

function findAccount(config, email) {
  const accounts = config.accounts || [];
  if (!email) return null;
  const lower = email.toLowerCase();
  return accounts.find((a) => a.email?.toLowerCase() === lower) ?? null;
}

function extractUrls(text) {
  if (!text) return [];
  const matches = text.match(CONFIRM_URL_RE) || [];
  return [...new Set(matches.map((u) => u.replace(/[).,;]+$/, "")))];
}

async function bodyText(source) {
  const parsed = await simpleParser(source);
  const parts = [parsed.text, parsed.html?.replace(/<[^>]+>/g, " ")].filter(Boolean);
  return parts.join("\n");
}

async function fetchLatestLink(client, sinceDate) {
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids = await client.search({ since: sinceDate }, { uid: true });
    if (!uids.length) return null;

    const sorted = [...uids].sort((a, b) => a - b);
    for (let i = sorted.length - 1; i >= 0; i--) {
      const uid = sorted[i];
      const msg = await client.fetchOne(
        uid,
        { source: true, envelope: true },
        { uid: true },
      );
      if (!msg?.source) continue;
      const text = await bodyText(msg.source);
      const urls = extractUrls(text);
      if (urls.length) {
        return {
          url: urls[0],
          allUrls: urls,
          subject: msg.envelope?.subject,
          date: msg.envelope?.date,
          uid,
        };
      }
    }
    return null;
  } finally {
    lock.release();
  }
}

async function pollForLink(imapOpts, sinceDate, waitSec) {
  const deadline = Date.now() + waitSec * 1000;
  const intervalMs = 5000;

  do {
    const client = new ImapFlow(imapOpts);
    try {
      await client.connect();
      const hit = await fetchLatestLink(client, sinceDate);
      if (hit) return hit;
    } finally {
      await client.logout().catch(() => {});
    }

    if (waitSec <= 0) break;
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  } while (Date.now() < deadline);

  return null;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { data: config } = loadConfig();

  if (opts.list) {
    for (const a of config.accounts || []) console.log(a.email);
    return;
  }

  if (!opts.email) usage(1);

  const account = findAccount(config, opts.email);
  if (!account?.password) {
    console.error(`No account/password for ${opts.email} in mail config.`);
    process.exit(1);
  }

  const sinceDate = new Date(Date.now() - opts.sinceMin * 60 * 1000);
  const host = opts.host || config.imap?.host || "localhost";
  const port = config.imap?.port ?? 993;
  const secure = config.imap?.ssl !== false;

  const tlsRejectUnauthorized = config.imap?.tlsRejectUnauthorized;
  const imapOpts = {
    host,
    port,
    secure,
    auth: { user: account.email, pass: account.password },
    logger: false,
    ...(tlsRejectUnauthorized === false
      ? { tls: { rejectUnauthorized: false, servername: config.imap?.tlsServername || "hebelie.com" } }
      : {}),
  };

  const hit = await pollForLink(imapOpts, sinceDate, opts.waitSec);
  if (!hit) {
    console.error(
      `No confirmation link in INBOX for ${opts.email} (since ${sinceDate.toISOString()}).`,
    );
    process.exit(2);
  }

  if (opts.json) {
    console.log(JSON.stringify({ url: hit.url, subject: hit.subject, date: hit.date }, null, 0));
  } else {
    console.log(hit.url);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
