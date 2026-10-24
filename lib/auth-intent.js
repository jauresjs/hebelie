const KEY = "hebelie-auth-intent";

/** @typedef {{ role: "user" | "pro", clinicName?: string }} AuthIntent */

export function setUserIntent() {
  sessionStorage.setItem(KEY, JSON.stringify({ role: "user" }));
}

/** @param {string} clinicName */
export function setProIntent(clinicName) {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({ role: "pro", clinicName: clinicName.trim() })
  );
}

export function peekAuthIntent() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return /** @type {AuthIntent} */ (JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearAuthIntent() {
  sessionStorage.removeItem(KEY);
}
