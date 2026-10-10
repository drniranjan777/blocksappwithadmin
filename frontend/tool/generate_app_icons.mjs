// Generates the BLOCKS launcher icons for Android, iOS and web from the brand mark.
//
//     node tool/generate_app_icons.mjs
//
// The mark is the same four rising bars that `lib/core/widgets/blocks_mark.dart` paints (heights
// 0.38 / 0.58 / 0.78 / 1.0, bar width 0.19, gap 0.08, corner radius 0.3 of a bar), in the four
// Reach colours of `BlocksPalette` on its `night` background. If either changes, change it here
// and run this again.
//
// It needs `sharp` and borrows the copy installed for the staff console (`admin-frontend`), so run
// `npm install` there first. Nothing is downloaded and the app itself does not depend on it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(resolve(app, '..', 'admin-frontend', 'package.json'))('sharp');

const BACKGROUND = '#0B0D1E'; // BlocksPalette.night
const REACH = ['#0FA39A', '#2F6BFF', '#F08A00', '#D6246E']; // district, state, national, global
const HEIGHTS = [0.38, 0.58, 0.78, 1.0];

/** The four bars, `side` wide and tall, centred on a canvas of `n` pixels. */
function mark(n, side, fills = REACH) {
  const bar = side * 0.19;
  const gap = side * 0.08;
  const left = (n - side) / 2;
  const top = (n - side) / 2;
  return HEIGHTS.map((h, i) => {
    const height = side * h;
    const x = left + i * (bar + gap);
    const y = top + side - height;
    return `<rect x="${x}" y="${y}" width="${bar}" height="${height}" rx="${bar * 0.3}" fill="${fills[i]}"/>`;
  }).join('');
}

/** A square icon: a solid background (rounded when `round` > 0) with the mark on it. */
function square(n, { side, round = 0, background = BACKGROUND, fills }) {
  const back = background
    ? `<rect width="${n}" height="${n}" rx="${n * round}" fill="${background}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}">${back}${mark(n, side, fills)}</svg>`;
}

async function png(file, svg, { opaque = false } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  let image = sharp(Buffer.from(svg));
  if (opaque) image = image.flatten({ background: BACKGROUND }).removeAlpha();
  await image.png({ compressionLevel: 9 }).toFile(file);
}

// ---- Android -----------------------------------------------------------------------------------
// Adaptive icon (Android 8+): a 108dp canvas of which only the middle ~66dp is always visible, so
// the mark stays inside 48dp. Older phones use the plain rounded square. The monochrome layer is
// what Android 13+ tints when the user turns on themed icons.
const res = join(app, 'android', 'app', 'src', 'main', 'res');
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, scale] of Object.entries(densities)) {
  const dir = join(res, `mipmap-${name}`);
  const legacy = Math.round(48 * scale);
  await png(join(dir, 'ic_launcher.png'), square(legacy, { side: legacy * 0.64, round: 0.22, background: BACKGROUND }));
  const layer = Math.round(108 * scale);
  const side = (layer * 48) / 108;
  await png(join(dir, 'ic_launcher_foreground.png'), square(layer, { side, background: null }));
  await png(join(dir, 'ic_launcher_monochrome.png'), square(layer, { side, background: null, fills: Array(4).fill('#FFFFFF') }));
}
mkdirSync(join(res, 'mipmap-anydpi-v26'), { recursive: true });
writeFileSync(
  join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`,
);
writeFileSync(
  join(res, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BACKGROUND}</color>
</resources>
`,
);

// ---- iOS ---------------------------------------------------------------------------------------
// Full-bleed squares with no transparency (the App Store rejects an alpha channel); the system
// rounds the corners itself.
const iconset = join(app, 'ios', 'Runner', 'Assets.xcassets', 'AppIcon.appiconset');
const contents = JSON.parse(readFileSync(join(iconset, 'Contents.json'), 'utf8'));
for (const image of contents.images) {
  const px = Math.round(parseFloat(image.size) * parseFloat(image.scale));
  await png(join(iconset, image.filename), square(px, { side: px * 0.6 }), { opaque: true });
}

// ---- Web ---------------------------------------------------------------------------------------
// The "maskable" pair may be cropped to a circle, so the mark sits inside its central 80%.
const web = join(app, 'web');
for (const px of [192, 512]) {
  await png(join(web, 'icons', `Icon-${px}.png`), square(px, { side: px * 0.6 }), { opaque: true });
  await png(join(web, 'icons', `Icon-maskable-${px}.png`), square(px, { side: px * 0.5 }), { opaque: true });
}
await png(join(web, 'favicon.png'), square(16, { side: 11.5, round: 0.2 }));

console.log('icons written');
