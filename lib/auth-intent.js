const KEY = "hebelie-auth-intent";

/** @typedef {{ role: "user" | "pro", clinicName?: string, billingCountry?: string, billingRegion?: string }} AuthIntent */

export function setUserIntent() {
  sessionStorage.setItem(KEY, JSON.stringify({ role: "user" }));
}

/** @param {{ clinicName: string, billingCountry: string, billingRegion?: string }} pro */
export function setProIntent(pro) {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({
      role: "pro",
      clinicName: pro.clinicName.trim(),
      billingCountry: pro.billingCountry.trim().toUpperCase(),
      billingRegion: pro.billingRegion?.trim() || "",
    }),
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
