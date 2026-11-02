const KEY = "hebelie-auth-intent";
/** Survives magic-link opens in a new tab (sessionStorage is tab-scoped). */
const PERSIST_KEY = "hebelie-auth-intent-persist";
const PERSIST_MAX_MS = 7 * 24 * 60 * 60 * 1000;

/** @typedef {{ role: "user" | "pro", clinicName?: string, billingCountry?: string, billingRegion?: string }} AuthIntent */

function writeIntent(payload) {
  sessionStorage.setItem(KEY, JSON.stringify(payload));
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ ...payload, savedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function setUserIntent() {
  writeIntent({ role: "user" });
}

/** Returning clinic — sign in only (no new clinic provisioning). */
export function setProSignInIntent() {
  writeIntent({ role: "pro" });
}

/** @param {{ clinicName: string, billingCountry: string, billingRegion?: string }} pro */
export function setProIntent(pro) {
  writeIntent({
    role: "pro",
    clinicName: pro.clinicName.trim(),
    billingCountry: pro.billingCountry.trim().toUpperCase(),
    billingRegion: pro.billingRegion?.trim() || "",
  });
}

function readPersistedIntent() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > PERSIST_MAX_MS) {
      localStorage.removeItem(PERSIST_KEY);
      return null;
    }
    const { savedAt: _s, ...intent } = parsed;
    return /** @type {AuthIntent} */ (intent);
  } catch {
    return null;
  }
}

export function peekAuthIntent() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return /** @type {AuthIntent} */ (JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return readPersistedIntent();
}

export function clearAuthIntent() {
  sessionStorage.removeItem(KEY);
  try {
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* ignore */
  }
}
