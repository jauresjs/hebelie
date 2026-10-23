export const INTENSITIES = ["light", "medium"];

const PRESERVE = [
  "Edit the supplied portrait. The person must stay unmistakably the same individual.",
  "Keep their identity, age, gender presentation, ethnicity, skin tone, freckles, moles and distinctive marks.",
  "Keep the head position, camera angle, framing, crop, gaze, expression, hairstyle, hairline, eyewear, clothing, background and lighting exactly as they are.",
  "Do not smooth, slim, brighten or retouch anything outside the treated area. Keep natural skin texture, pores and fine lines.",
  "No beauty filter, no airbrushing, no waxy or plastic finish."
].join(" ");

const STYLE = "Photorealistic clinical photography. Natural colour, soft even light, sharp focus, no added makeup, no added jewellery, no text, no watermark.";

export const TREATMENTS = {
  lips: {
    label: "Lip filler",
    area: "the lips and the skin immediately around the mouth",
    change: "give the lips a little more volume and a slightly cleaner vermilion border, inside the lip shape the person already has",
    exclusions: "do not change the width of the mouth, do not create a pout or duck lip, do not alter the teeth or the smile line"
  },
  cheeks: {
    label: "Cheek filler",
    area: "the mid-face over the cheekbones",
    change: "restore a little volume over the cheekbones with a soft transition into the mid-face",
    exclusions: "do not hollow the cheeks, do not widen or lengthen the face, do not erase the nasolabial folds, do not change the jaw width"
  },
  botox: {
    label: "Botox",
    area: "the forehead and the outer corners of the eyes",
    change: "soften the horizontal forehead lines and the lines at the outer eye corners",
    exclusions: "do not raise the brows into a surprised look, do not lower the eyelids, do not remove expression entirely, keep the natural expression"
  },
  jawline: {
    label: "Jawline contour",
    area: "the jawline from the chin to below the ear",
    change: "make the jaw contour slightly cleaner and more defined while keeping the same face width",
    exclusions: "do not narrow or lengthen the face, do not add a hard unnatural edge, do not change how far the chin projects"
  },
  skin: {
    label: "Skin rejuvenation",
    area: "the skin across the face",
    change: "even out the tone, reduce redness and calm visible blemishes",
    exclusions: "do not smooth the texture away, do not lighten the skin, do not remove freckles, moles or fine lines"
  },
  browlift: {
    label: "Brow lift",
    area: "the brows and the skin above them",
    change: "raise the brows a little and open the upper eyelid slightly",
    exclusions: "do not change the brow shape, do not create a surprised or over-arched look, do not change the eye shape"
  },
  facelift: {
    label: "Facelift",
    area: "the lower face, the jaw and the neck",
    change: "lift the lower face and tighten the jaw-neck angle moderately",
    exclusions: "do not turn the face into a different person, do not pull the ears, do not create a tight or windswept look, keep the natural neck lines",
    surgical: true
  },
  rhino: {
    label: "Rhinoplasty",
    area: "the nose only",
    change: "refine the bridge and the tip slightly so the nose sits in better balance with the rest of the face",
    exclusions: "do not change the width of the nostrils, do not pinch the tip, do not change anything outside the nose",
    surgical: true
  }
};

const INTENSITY = {
  light: "Keep the change restrained: the version of it a careful clinician would call conservative.",
  medium: "Apply a moderate version of the change, still inside conservative clinical limits."
};

function normalise(list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error("no_treatments");
  const ids = [...new Set(list.map(v => String(v).trim().toLowerCase()))];
  if (ids.length > 3) throw new Error("too_many_treatments");
  for (const id of ids) {
    if (!Object.prototype.hasOwnProperty.call(TREATMENTS, id)) throw new Error("unknown_treatment:" + id);
  }
  return ids;
}

export function buildPrompt(procedures, intensity = "medium") {
  const ids = normalise(procedures);
  if (!INTENSITIES.includes(intensity)) throw new Error("unknown_intensity");
  const lead = ids.length === 1
    ? "Retouch this portrait with one aesthetic treatment."
    : "Retouch this portrait with these aesthetic treatments, applied together as one consistent edit.";
  const steps = ids.map((id, i) => {
    const t = TREATMENTS[id];
    let line = (i + 1) + ". " + t.label + ". Area: " + t.area + ". Change: " + t.change + ". Exclusions: " + t.exclusions + ".";
    if (id === "lips") line += " " + INTENSITY.light;
    return line;
  });
  const globalIntensity = ids.every(id => id === "lips") ? INTENSITY.light : INTENSITY[intensity];
  return [lead, PRESERVE, STYLE, ...steps, globalIntensity,
    "If the change cannot be made without altering the identity of the person, keep it minimal."].join(" ");
}

export function buildRequest(procedures, intensity, image, numImages = 1) {
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) throw new Error("bad_image");
  return {
    prompt: buildPrompt(procedures, intensity),
    image_urls: [image],
    num_images: numImages,
    output_format: "jpeg",
    aspect_ratio: "auto",
    sync_mode: false,
    limit_generations: true
  };
}

export const isSurgical = id => !!(TREATMENTS[id] && TREATMENTS[id].surgical);
