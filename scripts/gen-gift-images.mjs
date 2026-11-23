/**
 * تولید تصاویر بخش «هدایای سازمانی» — ۳ محصول + ۲ بنر اسلایدر بخش
 * خروجی PNG خام در scripts/img-tmp (قابل ازسرگیری) → webp بهینه در public
 * اجرا: bun scripts/gen-gift-images.mjs
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const TMP = '/home/z/my-project/scripts/img-tmp';
fs.mkdirSync(TMP, { recursive: true });

const STYLE =
  'professional food product photography, soft studio lighting, warm cream linen background, ' +
  'rustic ceramic or wooden props, appetizing, high quality, detailed, no text, no letters, no watermark';

const BANNER_STYLE =
  'luxury food advertising style, deep forest green background with subtle warm golden glow, ' +
  'large empty dark green space on the right for text, no text, no letters, no watermark';

/** [filename, prompt, size, outDir] */
const JOBS = [
  // ——— محصولات هدیه (مربع ۱۰۲۴) ———
  [
    'gift-box-classic',
    'elegant corporate gift box with separate compartments filled with premium Iranian pistachios, almonds, cashews and dried fruits, kraft paper gift box tied with deep green silk ribbon bow, ' + STYLE,
    '1024x1024',
    'products',
  ],
  [
    'gift-basket-luxury',
    'luxury woven wicker gift basket overflowing with premium mixed nuts, dates and dried figs, wrapped with sheer organza ribbon, elegant presentation, ' + STYLE,
    '1024x1024',
    'products',
  ],
  [
    'gift-box-premium',
    'premium dark wooden gift box with golden interior compartments of pistachios, almond kernels, walnut halves and golden raisins, gold ribbon accent, luxury corporate packaging, ' + STYLE,
    '1024x1024',
    'products',
  ],
  // ——— بنرهای اسلایدر بخش هدایا (عریض ۱۳۴۴×۷۶۸، فضای خالی سمت راست برای متن RTL) ———
  [
    'banner-gifts-1',
    'wide advertising banner with elegant stacked corporate gift boxes tied with deep green silk ribbons and a few premium pistachios and almonds scattered beside them on the left, ' + BANNER_STYLE,
    '1344x768',
    'banners',
  ],
  [
    'banner-gifts-2',
    'wide still-life photograph: a woven wicker gift basket filled with dates, dried figs and mixed nuts tied with a sheer golden ribbon, positioned on the far left side; the entire right two-thirds is a plain flat dark forest green empty surface with a soft warm golden glow, clean minimal studio scene, ' + BANNER_STYLE + ', absolutely zero words, zero letters, zero typography, zero signage, zero printed text of any kind',
    '1344x768',
    'banners',
  ],
];

async function main() {
  const zai = await ZAI.create();
  const pending = JOBS.filter(([name]) => {
    const p = path.join(TMP, `${name}.png`);
    if (fs.existsSync(p) && fs.statSync(p).size > 20_000) {
      console.log(`↷ skip (exists): ${name}`);
      return false;
    }
    return true;
  });

  for (const [name, prompt, size] of pending) {
    console.log(`→ generating: ${name} (${size})`);
    let done = false;
    for (let attempt = 1; attempt <= 3 && !done; attempt++) {
      try {
        const resp = await zai.images.generations.create({ prompt, size });
        const b64 = resp?.data?.[0]?.base64;
        if (!b64) throw new Error('empty base64');
        fs.writeFileSync(path.join(TMP, `${name}.png`), Buffer.from(b64, 'base64'));
        done = true;
        console.log(`  ✓ saved ${name}.png`);
      } catch (e) {
        console.error(`  ✗ attempt ${attempt} failed: ${e?.message ?? e}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    if (!done) {
      console.error(`✗✗ ${name} FAILED after 3 attempts`);
      process.exitCode = 1;
    }
  }

  // ——— تبدیل به webp بهینه (هم‌پارامتر پایپ‌لاین اصلی) ———
  const DIM = { products: [1024, 1024], banners: [1344, 768] };
  for (const [name, , , kind] of JOBS) {
    const src = path.join(TMP, `${name}.png`);
    if (!fs.existsSync(src) || fs.statSync(src).size < 20_000) continue;
    const [w, h] = DIM[kind];
    const outDir = `/home/z/my-project/public/images/${kind}`;
    fs.mkdirSync(outDir, { recursive: true });
    const dst = path.join(outDir, `${name}.webp`);
    await sharp(src).resize(w, h, { fit: 'cover', position: 'centre' }).webp({ quality: 80, effort: 4 }).toFile(dst);
    const kb = Math.round(fs.statSync(dst).size / 1024);
    console.log(`✓ ${kind}/${name}.webp (${kb}KB)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
