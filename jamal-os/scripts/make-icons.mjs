// Generates PWA icons from an inline SVG mark. Requires sharp on the
// module path (present as a transitive dependency). Run once:
//   node scripts/make-icons.mjs
// Outputs are committed, so this only needs re-running if the mark
// changes.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");
mkdirSync(PUB, { recursive: true });

const BG = "#040c14";
const CYAN = "#3fdef6";

// pad: extra safe-zone padding for maskable icons (fraction of canvas)
function markSvg({ size, pad = 0, rounded = true }) {
  const c = size / 2;
  const s = (size * (1 - pad * 2)) / 512; // scale of the 512 artwork
  const r = (v) => v * s;
  const corner = rounded ? size * 0.1875 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <radialGradient id="glow">
      <stop offset="0%" stop-color="${CYAN}" stop-opacity="0.85"/>
      <stop offset="55%" stop-color="${CYAN}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${CYAN}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${corner}" fill="${BG}"/>
  <circle cx="${c}" cy="${c}" r="${r(185)}" fill="none" stroke="${CYAN}"
    stroke-width="${r(3)}" stroke-opacity="0.35"
    stroke-dasharray="${r(28)} ${r(18)}"/>
  <circle cx="${c}" cy="${c}" r="${r(150)}" fill="none" stroke="${CYAN}"
    stroke-width="${r(10)}" stroke-opacity="0.9"/>
  <circle cx="${c}" cy="${c}" r="${r(110)}" fill="none" stroke="${CYAN}"
    stroke-width="${r(4)}" stroke-opacity="0.45"/>
  <circle cx="${c}" cy="${c}" r="${r(78)}" fill="url(#glow)"/>
  <circle cx="${c}" cy="${c}" r="${r(40)}" fill="${CYAN}"/>
  <line x1="${c}" y1="${c - r(206)}" x2="${c}" y2="${c - r(168)}"
    stroke="${CYAN}" stroke-width="${r(8)}" stroke-opacity="0.9"/>
</svg>`;
}

async function png(svg, size, name) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(PUB, name));
  console.log("wrote public/" + name);
}

await png(markSvg({ size: 512 }), 192, "icon-192.png");
await png(markSvg({ size: 512 }), 512, "icon-512.png");
await png(markSvg({ size: 512, pad: 0.1, rounded: false }), 512, "icon-maskable-512.png");
await png(markSvg({ size: 512 }), 180, "apple-touch-icon.png");

writeFileSync(
  join(ROOT, "src", "app", "icon.svg"),
  markSvg({ size: 512 }) + "\n",
);
console.log("wrote src/app/icon.svg");
