/**
 * تبدیل PNG خام به WebP بهینه برای وب (فاز ۴)
 * محصولات: 800×800 مربع | بنرها: 1280×720 — کیفیت 80
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const TMP = '/home/z/my-project/scripts/img-tmp';
const OUT_PRODUCTS = '/home/z/my-project/public/images/products';
const OUT_BANNERS = '/home/z/my-project/public/images/banners';
fs.mkdirSync(OUT_PRODUCTS, { recursive: true });
fs.mkdirSync(OUT_BANNERS, { recursive: true });

const products = [
  'pistachio-akbari', 'pistachio-ahmadaghaei', 'pistachio-kalehghouchi',
  'almond-mamaei', 'almond-kernel', 'walnut-toyserkan', 'walnut-kernel',
  'hazelnut-ardabil', 'hazelnut-kernel', 'raisin-green', 'raisin-golden',
  'date-mazafati', 'date-piarom', 'dried-fig', 'dried-mulberry',
  'dried-apricot', 'mixed-nuts-luxury', 'pumpkin-seed-kernel',
];
const banners = ['banner-pistachio', 'banner-mixed-nuts'];

async function convert(name, outDir, w, h) {
  const src = path.join(TMP, `${name}.png`);
  const dst = path.join(outDir, `${name}.webp`);
  await sharp(src).resize(w, h, { fit: 'cover', position: 'centre' })
    .webp({ quality: 80, effort: 4 })
    .toFile(dst);
  const kb = Math.round(fs.statSync(dst).size / 1024);
  console.log(`✓ ${name}.webp (${kb}KB)`);
}

for (const p of products) await convert(p, OUT_PRODUCTS, 800, 800);
for (const b of banners) await convert(b, OUT_BANNERS, 1280, 720);
console.log('CONVERT-DONE');
