import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "clinic-leads";

export function dataUrlToBytes(dataUrl: string): {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
} {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error("bad_image");
  const binary = atob(m[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
  return { bytes, contentType: m[1], ext };
}

export async function uploadPreviewImages(
  admin: SupabaseClient,
  clinicId: string,
  previewId: string,
  beforeDataUrl: string,
  afterRemoteUrl: string,
): Promise<{ beforePath: string; afterPath: string }> {
  const { bytes: beforeBytes, contentType: beforeType, ext: beforeExt } = dataUrlToBytes(beforeDataUrl);

  const afterRes = await fetch(afterRemoteUrl);
  if (!afterRes.ok) throw new Error("after_download_failed");
  const afterBytes = new Uint8Array(await afterRes.arrayBuffer());
  const afterType = afterRes.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const afterExt = afterType.includes("png") ? "png" : afterType.includes("webp") ? "webp" : "jpg";

  const beforePath = `${clinicId}/${previewId}/before.${beforeExt}`;
  const afterPath = `${clinicId}/${previewId}/after.${afterExt}`;

  const upBefore = await admin.storage.from(BUCKET).upload(beforePath, beforeBytes, {
    contentType: beforeType,
    upsert: true,
  });
  if (upBefore.error) throw new Error("before_upload_failed:" + upBefore.error.message);

  const upAfter = await admin.storage.from(BUCKET).upload(afterPath, afterBytes, {
    contentType: afterType,
    upsert: true,
  });
  if (upAfter.error) throw new Error("after_upload_failed:" + upAfter.error.message);

  return { beforePath, afterPath };
}

export async function signedImageUrl(
  admin: SupabaseClient,
  path: string,
  expiresSec = 60 * 60 * 24 * 7,
): Promise<string | null> {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
