/**
 * تولید آیکون‌های PWA برند پارس از SVG منبع با sharp
 * خروجی: public/icons/{icon-192,icon-512,maskable-192,maskable-512,apple-touch-icon}.png
 * اجرا: bun scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'public', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

function logoSvg({ size, maskable = false }) {
  const pad = maskable ? 0.62 : 0.78; // ناحیه امن آیکون maskable
  const rx = maskable ? 0 : Math.round(size * 0.22);
  const scale = maskable ? 512 * pad : 512 * pad;
  const offset = (512 - scale) / 2;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rx}" fill="#0d3a27"/>
  <g transform="translate(${offset} ${offset}) scale(${scale / 512})">
    <circle cx="256" cy="256" r="182" fill="none" stroke="#c89b34" stroke-width="14" opacity="0.9"/>
    <path d="M256 96c60 45 88 109 77 179-9 55-40 100-77 122-37-22-68-67-77-122-11-70 17-134 77-179Z" fill="#f6f1e5"/>
    <path d="M256 152c35 29 52 70 46 115-6 40-24 73-46 91-22-18-40-51-46-91-6-45 11-86 46-115Z" fill="#1f8f5a"/>
    <path d="M256 152v206" stroke="#0d3a27" stroke-width="10" opacity="0.25" stroke-linecap="round"/>
  </g>
</svg>`;
}

async function render(name, size, maskable) {
  const svg = Buffer.from(logoSvg({ size, maskable }));
  await sharp(svg).resize(size, size).png().toFile(join(OUT_DIR, name));
  console.log(`✔ ${name}`);
}

await render('icon-192.png', 192, false);
await render('icon-512.png', 512, false);
await render('maskable-192.png', 192, true);
await render('maskable-512.png', 512, true);
await render('apple-touch-icon.png', 180, true);
console.log('همه آیکون‌ها ساخته شدند →', OUT_DIR);
