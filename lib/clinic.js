import { supabase } from "./supabase.js?v=11";

export function clinicSlugFromUrl() {
  const slug = new URLSearchParams(location.search).get("clinic");
  return slug ? slug.trim().toLowerCase() : null;
}

export async function fetchClinic(slug) {
  if (!supabase || !slug) return null;
  const { data, error } = await supabase.rpc("get_clinic_by_slug", { p_slug: slug });
  if (error || !data?.length) return null;
  return data[0];
}

export function applyClinicTheme(clinic) {
  if (clinic?.accent_color) {
    document.documentElement.style.setProperty("--bronze", clinic.accent_color);
  }
  const brand = document.getElementById("embedBrand");
  if (brand && clinic?.name) brand.textContent = clinic.name;
  const logo = document.getElementById("embedLogo");
  if (logo && clinic?.logo_url) {
    logo.src = clinic.logo_url;
    logo.hidden = false;
  }
  if (clinic?.name) document.title = `${clinic.name} – Treatment preview`;
}
