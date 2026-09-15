// Makes every Plateraa icon and logo from the one source picture, public/images/logo.png: the
// tablet's app icons and splash, the dashboard's favicons and mark, and the online store's.
// Run it again whenever the logo changes: `pnpm brand:assets`.
//
// The source is an orange rounded square with a white "P". Rather than scaling the picture itself
// (which has stray specks outside the square), each icon is rebuilt: a clean orange square in the
// measured colour and corner, with the white P lifted out of the source and placed where it was.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'public/images/logo.png');

const { data, info } = await sharp(source)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const at = (x, y) => (y * W + x) * 4;
const solid = (x, y) => data[at(x, y) + 3] > 200;

// The orange square: the rows and columns that are mostly solid (specks outside are thin).
function span(length, count, across) {
  let first = -1;
  let last = -1;
  for (let i = 0; i < length; i++) {
    if (count(i) > across * 0.3) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return [first, last];
}
const rowCount = (y) => {
  let n = 0;
  for (let x = 0; x < W; x++) if (solid(x, y)) n++;
  return n;
};
const colCount = (x) => {
  let n = 0;
  for (let y = 0; y < H; y++) if (solid(x, y)) n++;
  return n;
};
const [top, bottom] = span(H, rowCount, W);
const [left, right] = span(W, colCount, H);
const squareW = right - left + 1;
const squareH = bottom - top + 1;
const side = (squareW + squareH) / 2;

// Its corner: along the diagonal from a corner, the edge is r(1 − 1/√2) in. Top corners only,
// as the bottom edge is where the specks are.
function diagonalIn(x0, y0, dx) {
  for (let d = 0; d < side / 2; d++) if (solid(x0 + dx * d, y0 + d)) return d;
  return 0;
}
const inset = (diagonalIn(left, top, 1) + diagonalIn(right, top, -1)) / 2;
const radius = inset / (1 - Math.SQRT1_2) / side;

// Its colour: the average of the solid, clearly orange pixels inside it.
let sum = [0, 0, 0];
let count = 0;
for (let y = top; y <= bottom; y += 2) {
  for (let x = left; x <= right; x += 2) {
    const i = at(x, y);
    if (data[i + 3] === 255 && data[i + 2] < 60) {
      sum = [sum[0] + data[i], sum[1] + data[i + 1], sum[2] + data[i + 2]];
      count++;
    }
  }
}
const orange = sum.map((v) => Math.round(v / count));
const hex = `#${orange.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

// The white P: how far each pixel is from orange towards white, read from the blue channel (near
// 0 in the orange, full in the white), with the texture in the orange cut away.
const mask = Buffer.alloc(W * H);
let pLeft = W;
let pRight = 0;
let pTop = H;
let pBottom = 0;
for (let y = top; y <= bottom; y++) {
  for (let x = left; x <= right; x++) {
    const i = at(x, y);
    const white = (data[i + 2] - orange[2]) / (255 - orange[2]);
    const alpha = Math.min(1, Math.max(0, (white - 0.12) / 0.76)) * (data[i + 3] / 255);
    const value = Math.round(alpha * 255);
    mask[y * W + x] = value;
    if (value > 128) {
      pLeft = Math.min(pLeft, x);
      pRight = Math.max(pRight, x);
      pTop = Math.min(pTop, y);
      pBottom = Math.max(pBottom, y);
    }
  }
}
// A little room around the P for its soft edges.
pLeft -= 4;
pTop -= 4;
pRight += 4;
pBottom += 4;
const pW = pRight - pLeft + 1;
const pH = pBottom - pTop + 1;
const pCrop = Buffer.alloc(pW * pH * 4);
for (let y = 0; y < pH; y++) {
  for (let x = 0; x < pW; x++) {
    const o = (y * pW + x) * 4;
    pCrop[o] = pCrop[o + 1] = pCrop[o + 2] = 255;
    pCrop[o + 3] = mask[(pTop + y) * W + (pLeft + x)];
  }
}
// Where the P sits, as fractions of the square, from the square's centre.
const centreX = (left + right) / 2;
const centreY = (top + bottom) / 2;
const place = {
  x: (pLeft - centreX) / side,
  y: (pTop - centreY) / side,
  w: pW / side,
  h: pH / side,
};

/**
 * One icon, `size` pixels square. `square`: how much of the canvas the orange square takes (the
 * P is sized to it). `background`: 'rounded' (transparent corners), 'full' (edge to edge, for
 * icons the system rounds itself) or 'none' (the P alone, for Android's adaptive icon).
 */
async function icon(size, { square = 1, background = 'rounded' } = {}) {
  const s = size * square;
  const layers = [];
  if (background !== 'none') {
    const inner =
      background === 'full'
        ? `<rect width="${size}" height="${size}" fill="${hex}"/>`
        : `<rect x="${(size - s) / 2}" y="${(size - s) / 2}" width="${s}" height="${s}" rx="${s * radius}" fill="${hex}"/>`;
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${inner}</svg>`,
      ),
    });
  }
  const w = Math.max(1, Math.round(place.w * s));
  const h = Math.max(1, Math.round(place.h * s));
  const p = await sharp(pCrop, { raw: { width: pW, height: pH, channels: 4 } })
    .resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  layers.push({
    input: p,
    left: Math.round(size / 2 + place.x * s),
    top: Math.round(size / 2 + place.y * s),
  });
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
// inside that: the P is sized for a square 60% of the canvas so none of it is cut.
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
  // The online store (Next picks up favicon.ico, icon.png and apple-icon.png in app/).
  'apps/storefront/app/favicon.ico': () => ico([16, 32, 48]),
  'apps/storefront/app/icon.png': () => icon(192),
  'apps/storefront/app/apple-icon.png': () => icon(180, { background: 'full' }),
  'apps/storefront/public/logo.png': () => icon(256),
};

for (const [path, make] of Object.entries(outputs)) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  const bytes = await make();
  writeFileSync(file, bytes);
  console.log(`${path}  ${Math.round(bytes.length / 1024)} KB`);
}
console.log(
  `\nsource ${W}×${H}; square ${squareW}×${squareH} at ${left},${top}; corner ${(radius * 100).toFixed(1)}% of its side; orange ${hex}`,
);
