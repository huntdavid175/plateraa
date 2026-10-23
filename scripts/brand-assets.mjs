// Makes every Brixx icon and logo from public/images/brixx-logo.png: the tablet's app
// icons and splash, the dashboard's favicons and logos, the online store's and the landing page's.
// Run it again whenever the logo changes: `pnpm brand:assets`.
//
// - brixx-logo.png: the orange B mark and the "brixx" name beside it, on a transparent background.
//   The icons are rebuilt from it rather than scaled: a clean orange rounded square in the logo's
//   measured colour, with the B lifted out of the logo and set in white in the middle. The whole
//   logo, trimmed, is the wordmark shown where the name is spelled out.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'public/images/brixx-logo.png');

const { data, info } = await sharp(source)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const at = (x, y) => (y * W + x) * 4;
const solid = (x, y) => data[at(x, y) + 3] > 128;

// The B: the first block of solid columns from the left, ending at the gap before the name.
const colSolid = (x) => {
  for (let y = 0; y < H; y++) if (solid(x, y)) return true;
  return false;
};
const gap = Math.round(W * 0.02);
let left = 0;
while (left < W && !colSolid(left)) left++;
let right = left;
for (let x = left, empty = 0; x < W && empty < gap; x++) {
  if (colSolid(x)) {
    right = x;
    empty = 0;
  } else empty++;
}
let top = H;
let bottom = 0;
for (let y = 0; y < H; y++) {
  for (let x = left; x <= right; x++) {
    if (solid(x, y)) {
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      break;
    }
  }
}

// Its colour: the average of the fully solid pixels in the B.
let sum = [0, 0, 0];
let count = 0;
for (let y = top; y <= bottom; y++) {
  for (let x = left; x <= right; x++) {
    const i = at(x, y);
    if (data[i + 3] === 255) {
      sum = [sum[0] + data[i], sum[1] + data[i + 1], sum[2] + data[i + 2]];
      count++;
    }
  }
}
const orange = sum.map((v) => Math.round(v / count));
const hex = `#${orange.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

// The B in white, its shape taken from the logo's transparency: solid wherever the logo is nearly
// solid (so no faint spots show the orange through), soft only at the edges, with a little room
// around it for them.
const pad = 4;
const bLeft = Math.max(0, left - pad);
const bTop = Math.max(0, top - pad);
const bW = Math.min(W - 1, right + pad) - bLeft + 1;
const bH = Math.min(H - 1, bottom + pad) - bTop + 1;
const bCrop = Buffer.alloc(bW * bH * 4);
for (let y = 0; y < bH; y++) {
  for (let x = 0; x < bW; x++) {
    const o = (y * bW + x) * 4;
    bCrop[o] = bCrop[o + 1] = bCrop[o + 2] = 255;
    const a = data[at(bLeft + x, bTop + y) + 3];
    bCrop[o + 3] = Math.round(Math.min(1, Math.max(0, (a - 30) / 170)) * 255);
  }
}

/** How much of the square the B's height takes, and the square's corner as a share of its side. */
const MARK = 0.58;
const RADIUS = 0.225;

/**
 * One icon, `size` pixels square. `square`: how much of the canvas the orange square takes (the
 * B is sized to it). `background`: 'rounded' (transparent corners), 'full' (edge to edge, for
 * icons the system rounds itself) or 'none' (the B alone, for Android's adaptive icon).
 */
async function icon(size, { square = 1, background = 'rounded' } = {}) {
  const s = size * square;
  const layers = [];
  if (background !== 'none') {
    const inner =
      background === 'full'
        ? `<rect width="${size}" height="${size}" fill="${hex}"/>`
        : `<rect x="${(size - s) / 2}" y="${(size - s) / 2}" width="${s}" height="${s}" rx="${s * RADIUS}" fill="${hex}"/>`;
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${inner}</svg>`,
      ),
    });
  }
  const h = Math.max(1, Math.round(s * MARK * (bH / (bottom - top + 1))));
  const w = Math.max(1, Math.round((h * bW) / bH));
  const b = await sharp(bCrop, { raw: { width: bW, height: bH, channels: 4 } })
    .resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  layers.push({ input: b, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) });
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** A solid square of the orange: Android's adaptive icon background. */
const plain = (size) =>
  sharp({ create: { width: size, height: size, channels: 3, background: hex } })
    .png()
    .toBuffer();

/** The whole logo, trimmed to its edges, `height` pixels tall (shown at a third of that). */
const wordmark = (height) =>
  sharp(source).trim().resize({ height }).png({ compressionLevel: 9 }).toBuffer();

/** A .ico holding PNGs, which every current browser reads. */
async function ico(sizes) {
  const images = await Promise.all(sizes.map((size) => icon(size)));
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((png, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(sizes[index] >= 256 ? 0 : sizes[index], entry);
    header.writeUInt8(sizes[index] >= 256 ? 0 : sizes[index], entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images]);
}

// Android's adaptive icons show the middle 72 of 108 dp, and round launchers crop to a circle
// inside that: the B is sized for a square 60% of the canvas so none of it is cut.
const ADAPTIVE = { square: 0.6, background: 'none' };

const outputs = {
  // The tablet (Expo): app.json points at these.
  'apps/mobile/assets/icon.png': () => icon(1024, { background: 'full' }),
  'apps/mobile/assets/android-icon-foreground.png': () => icon(1024, ADAPTIVE),
  'apps/mobile/assets/android-icon-monochrome.png': () => icon(1024, ADAPTIVE),
  'apps/mobile/assets/android-icon-background.png': () => plain(1024),
  'apps/mobile/assets/splash-icon.png': () => icon(1024),
  'apps/mobile/assets/favicon.png': () => icon(48),
  'apps/mobile/assets/logo.png': () => icon(256),
  // The dashboard (Vite serves public/ at the root).
  'apps/dashboard/public/favicon.ico': () => ico([16, 32, 48]),
  'apps/dashboard/public/icon-192.png': () => icon(192),
  'apps/dashboard/public/apple-touch-icon.png': () => icon(180, { background: 'full' }),
  'apps/dashboard/public/logo.png': () => icon(256),
  'apps/dashboard/public/wordmark.png': () => wordmark(96),
  // The online store (Next picks up favicon.ico, icon.png and apple-icon.png in app/).
  'apps/storefront/app/favicon.ico': () => ico([16, 32, 48]),
  'apps/storefront/app/icon.png': () => icon(192),
  'apps/storefront/app/apple-icon.png': () => icon(180, { background: 'full' }),
  'apps/storefront/public/logo.png': () => icon(256),
  // The landing page (same as the store).
  'apps/landing/app/favicon.ico': () => ico([16, 32, 48]),
  'apps/landing/app/icon.png': () => icon(192),
  'apps/landing/app/apple-icon.png': () => icon(180, { background: 'full' }),
  'apps/landing/public/logo.png': () => icon(256),
  'apps/landing/public/wordmark.png': () => wordmark(132),
};

for (const [path, make] of Object.entries(outputs)) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  const bytes = await make();
  writeFileSync(file, bytes);
  console.log(`${path}  ${Math.round(bytes.length / 1024)} KB`);
}
console.log(
  `\nsource ${W}×${H}; B ${right - left + 1}×${bottom - top + 1} at ${left},${top}; orange ${hex}`,
);
