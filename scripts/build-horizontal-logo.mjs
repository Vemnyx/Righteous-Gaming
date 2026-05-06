/**
 * Stacks → horizontal layout: full lion + chess pedestal left, wordmark right.
 * Reads `public/logo-stacked-source.png` by default (white mark on transparent or dark).
 */
import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const input = path.join(repoRoot, process.argv[2] || "public/logo-stacked-source.png");
const output = path.join(repoRoot, process.argv[3] || "public/righteous-logo-horizontal.png");

function isInk(r, g, b, a) {
  if (a < 12) return false;
  const lum = (r + g + b) / 3;
  // Logo mark is bright on dark / transparent canvas
  if (lum > 42) return true;
  return false;
}

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;
const stride = 4;

const rowInk = new Float64Array(h);
for (let y = 0; y < h; y++) {
  let count = 0;
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * stride;
    if (isInk(data[i], data[i + 1], data[i + 2], data[i + 3])) count++;
  }
  rowInk[y] = count;
}

const smooth = new Float64Array(h);
for (let y = 0; y < h; y++) {
  let s = 0;
  let n = 0;
  for (let dy = -2; dy <= 2; dy++) {
    const yy = y + dy;
    if (yy >= 0 && yy < h) {
      s += rowInk[yy];
      n++;
    }
  }
  smooth[y] = n ? s / n : 0;
}

/* Horizontal span per row — wordmark lines are much wider than the lion silhouette. */
const widthSpan = new Float64Array(h);
for (let y = 0; y < h; y++) {
  let minX = w;
  let maxX = -1;
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * stride;
    if (isInk(data[i], data[i + 1], data[i + 2], data[i + 3])) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  widthSpan[y] = maxX >= minX ? maxX - minX + 1 : 0;
}

const peak = Math.max(...rowInk);
const gap = Math.max(3, Math.round(h * 0.012));

/*
 * We used to search ~22–80% height and hit a false “valley” inside the mane,
 * which dropped the chest + pedestal into the text band. Only consider splits
 * in the *lower* third where the real gap sits under the full chess piece, and
 * require wide, inky rows shortly below = start of “RIGHTEOUS” block.
 */
const ySearch0 = Math.floor(h * 0.58);
const ySearch1 = Math.floor(h * 0.86);
let splitY = Math.floor(h * 0.7);
let bestScore = Infinity;

for (let y = ySearch0; y < ySearch1; y++) {
  let belowInk = 0;
  let belowW = 0;
  let nb = 0;
  const yLo = Math.min(y + gap + 4, h - 20);
  const yHi = Math.min(yLo + 48, h);
  for (let yy = yLo; yy < yHi; yy++) {
    belowInk += rowInk[yy];
    belowW += widthSpan[yy];
    nb++;
  }
  if (nb < 8) continue;
  belowInk /= nb;
  belowW /= nb;
  if (belowInk < peak * 0.16) continue;
  if (belowW < w * 0.3) continue;

  const v = smooth[y];
  if (v < bestScore) {
    bestScore = v;
    splitY = y;
  }
}

if (!Number.isFinite(bestScore) || bestScore === Infinity) {
  splitY = Math.floor(h * 0.7);
  for (let y = ySearch0; y < ySearch1; y++) {
    if (smooth[y] < smooth[splitY]) splitY = y;
  }
}

const lionTop = 0;
const lionBottom = Math.max(10, splitY - gap);
const textTop = Math.min(h - 10, splitY + gap);
const textBottom = h;

function boundsForBand(yMin, yMax) {
  let minX = w;
  let maxX = -1;
  let minY = yMax;
  let maxY = yMin - 1;
  for (let y = yMin; y < yMax; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * stride;
      if (isInk(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

const lionBox = boundsForBand(lionTop, lionBottom);
const textBox = boundsForBand(textTop, textBottom);

if (!lionBox || !textBox) {
  console.error("Could not isolate lion vs text bands.", { lionBox, textBox, splitY, h });
  process.exit(1);
}

/* Horizontal gap between lion crop and wordmark (fraction of lion height). */
const pad = Math.round(lionBox.height * 0.14);

let lionBuf = await sharp(input).extract(lionBox).png().toBuffer();
let textBuf = await sharp(input).extract(textBox).png().toBuffer();

const lionMeta = await sharp(lionBuf).metadata();
const textMeta = await sharp(textBuf).metadata();

const lionH = lionMeta.height;
const lionW = lionMeta.width;

const targetTextH = Math.round(lionH * 0.88);
const textScale = targetTextH / textMeta.height;
const scaledTextW = Math.max(1, Math.round(textMeta.width * textScale));

textBuf = await sharp(textBuf)
  .resize({
    width: scaledTextW,
    height: targetTextH,
    fit: "fill",
    kernel: sharp.kernel.lanczos3,
  })
  .png()
  .toBuffer();

const canvasW = lionW + pad + scaledTextW;
const canvasH = Math.max(lionH, targetTextH);
/* Bottom-align wordmark with lion (pedestal), not vertically centered. */
const topLion = canvasH - lionH;
const topText = canvasH - targetTextH;

await sharp({
  create: {
    width: canvasW,
    height: canvasH,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    { input: lionBuf, left: 0, top: topLion },
    { input: textBuf, left: lionW + pad, top: topText },
  ])
  .png()
  .toFile(output);

console.log("Wrote", path.relative(repoRoot, output), `${canvasW}x${canvasH}`, "(split row", splitY, `/${h})`);
