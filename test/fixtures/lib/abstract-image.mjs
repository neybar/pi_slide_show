/**
 * Shared abstract test-image generator (Node + sharp only).
 *
 * Produces deterministic, impressionistic JPEGs that are easy to tell apart in
 * screenshots: a seed-derived palette, a light "sky" over a dark "ground" (so
 * rotation/flip is obvious) and a small bitmap-font label. The label is drawn
 * from <rect>s, never SVG <text>, so output does not depend on installed fonts.
 *
 * Determinism: same sharp/libvips build on the same machine gives identical
 * bytes. No cross-machine byte promise; tests should assert decoded stats.
 */
import sharp from 'sharp';

// Size presets as width:height ratios (scale to taste).
export const LANDSCAPE_4_3 = { w: 4, h: 3 };
export const LANDSCAPE_3_2 = { w: 3, h: 2 };
export const PORTRAIT = { w: 2, h: 3 };
export const PANORAMA = { w: 3, h: 1 };   // 3.0 > PANORAMA_ASPECT_THRESHOLD (2.0)
export const SQUARE = { w: 1, h: 1 };

// 5x7 bitmap font: seven rows per glyph, bit 4 = leftmost pixel.
const FONT = {
  '0': [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
  '1': [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
  '2': [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F],
  '3': [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E],
  '4': [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
  '5': [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
  '6': [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E],
  '7': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
  '9': [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],
  A: [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  B: [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
  C: [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
  D: [0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C],
  E: [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
  F: [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
  G: [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F],
  H: [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  I: [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
  M: [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11],
  O: [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  P: [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
  Q: [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D],
  R: [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
  S: [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E],
  T: [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0A],
  X: [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
  ':': [0x00, 0x04, 0x00, 0x00, 0x00, 0x04, 0x00],
  '-': [0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

/** Seeded PRNG (mulberry32) returning floats in [0, 1). */
export function mulberry32(a) {
  return function next() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToInt(seed) {
  if (Number.isInteger(seed)) return seed | 0;
  let h = 2166136261;               // FNV-1a for strings
  for (const ch of String(seed)) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  }
  return h | 0;
}

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

function labelSvg(label, w, h) {
  const text = String(label ?? '').toUpperCase();
  if (!text) return '';
  const s = Math.max(2, Math.round((Math.min(w, h) * 0.04) / 7));
  const pad = s * 2;
  const advance = 6 * s;
  const boxW = text.length * advance - s + pad * 2;
  const boxH = 7 * s + pad * 2;
  const x0 = Math.round(Math.min(w, h) * 0.02);
  const y0 = x0;
  let out = `<rect x="${x0}" y="${y0}" width="${boxW}" height="${boxH}" fill="#000" fill-opacity="0.6"/>`;
  let d = '';
  [...text].forEach((ch, i) => {
    const rows = FONT[ch] || FONT[' '];
    rows.forEach((bits, r) => {
      for (let c = 0; c < 5; c++) {
        if (bits & (1 << (4 - c))) {
          d += `M${x0 + pad + i * advance + c * s} ${y0 + pad + r * s}h${s}v${s}h${-s}z`;
        }
      }
    });
  });
  out += `<path d="${d}" fill="#fff"/>`;
  return out;
}

function buildSvg(width, height, seed, label) {
  const rnd = mulberry32(seedToInt(seed));
  // Golden angle: integer seeds n and n+1 differ clearly in hue.
  const base = Number.isInteger(seed) ? seed * 137.508 : rnd() * 360;
  const hue = base + rnd() * 20;
  const horizon = Math.round(height * (0.55 + rnd() * 0.1));
  const sky0 = hsl(hue, 60, 82);
  const sky1 = hsl(hue + 25, 65, 66);
  const gnd0 = hsl(hue + 150, 45, 32);
  const gnd1 = hsl(hue + 170, 50, 14);
  const long = Math.max(width, height);

  let defs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky0}"/><stop offset="1" stop-color="${sky1}"/></linearGradient>`
    + `<linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${gnd0}"/><stop offset="1" stop-color="${gnd1}"/></linearGradient>`;
  let shapes = `<rect width="${width}" height="${height}" fill="url(#sky)"/>`
    + `<rect y="${horizon}" width="${width}" height="${height - horizon}" fill="url(#gnd)"/>`;

  // Soft radial blobs, alternating sky and ground.
  for (let i = 0; i < 7; i++) {
    const inSky = i % 2 === 0;
    const cx = Math.round(rnd() * width);
    const cy = Math.round(inSky ? rnd() * horizon : horizon + rnd() * (height - horizon));
    const r = Math.round(long * (0.12 + rnd() * 0.22));
    const col = hsl(hue + rnd() * 120 - 20, 70, inSky ? 90 : 52);
    defs += `<radialGradient id="b${i}"><stop offset="0" stop-color="${col}" stop-opacity="0.75"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
    shapes += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#b${i})"/>`;
  }

  // A few broad translucent strokes.
  for (let i = 0; i < 4; i++) {
    const cx = Math.round(rnd() * width);
    const cy = Math.round(rnd() * height);
    const rx = Math.round(long * (0.15 + rnd() * 0.25));
    const ry = Math.max(2, Math.round(long * (0.01 + rnd() * 0.03)));
    const rot = Math.round(rnd() * 60 - 30);
    const col = hsl(hue + 60 + rnd() * 100, 55, rnd() < 0.5 ? 85 : 25);
    shapes += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${col}" fill-opacity="0.35" transform="rotate(${rot} ${cx} ${cy})"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs>${shapes}${labelSvg(label, width, height)}</svg>`;
}

/**
 * @param {object} o
 * @param {number} o.width   displayed width in px (after EXIF rotation)
 * @param {number} o.height  displayed height in px
 * @param {string|number} o.seed
 * @param {string} [o.label]
 * @param {1|6|8} [o.exifOrientation=1]
 * @param {number} [o.quality=70]
 * @returns {Promise<Buffer>}
 */
export async function generateAbstractJpeg({
  width, height, seed, label = '', exifOrientation = 1, quality = 70,
}) {
  if (![1, 6, 8].includes(exifOrientation)) {
    throw new RangeError(`exifOrientation must be 1, 6 or 8 (got ${exifOrientation})`);
  }
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  const png = await sharp(Buffer.from(buildSvg(width, height, seed, label)))
    .png().toBuffer();
  let img = sharp(png);
  // Store pixels rotated opposite to the tag so applying the tag restores them.
  if (exifOrientation === 6) img = img.rotate(270);   // stored = displayed rotated CCW
  if (exifOrientation === 8) img = img.rotate(90);    // stored = displayed rotated CW
  return img
    .jpeg({ quality, mozjpeg: false, chromaSubsampling: '4:2:0' })
    .withMetadata({ orientation: exifOrientation })
    .toBuffer();
}
