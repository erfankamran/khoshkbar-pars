/**
 * پارس — تولید تصویر محصولات پک‌های مناسبتی (یلدا و نوروز)
 *
 * - اجرا: bun scripts/generate-festive-packs.mjs
 * - خروجی خام: scripts/festive-raw/{yalda,nowruz}.png (۱۰۲۴×۱۰۲۴)
 * - فایل موجود (>10000 بایت) رد می‌شود — اجرای مکرر امن است
 * - سبک: عکاسی محصول واقع‌گرایانه، هماهنگ با تصاویر موجود فروشگاه
 * - بدون هیچ متن/حروف (متن تولیدی AI خراب می‌شود)
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const RAW_DIR = 'scripts/festive-raw';

const PACKS = [
  {
    key: 'yalda',
    prompt:
      'Professional product photography of a large square wooden gift box of Iranian mixed nuts, ' +
      'the closed lid is completely covered edge-to-edge with dense Yalda night artwork: ' +
      'deep crimson red background painted with a golden crescent moon and stars, lit candles, ' +
      'ripe pomegranates and a watermelon slice, ornate Persian paisley border patterns covering ' +
      'the whole lid with no empty areas, dense decorative artwork with no label zone, no panel, ' +
      'no card, the open red box beside the lid shows four compartments filled with roasted ' +
      'pistachios, almonds, cashews and green pumpkin seeds, a lower tray with dark raisins, ' +
      'two whole pomegranates and small tea light candles beside the box, warm candlelight glow, ' +
      'beige linen tablecloth, cozy winter evening atmosphere, soft warm lighting, absolutely ' +
      'no text, no letters, no numbers, no labels, no stickers, no inscriptions, no writing of ' +
      'any kind on the box or anywhere in the image, no watermark, high quality, detailed, photorealistic',
  },
  {
    key: 'nowruz',
    prompt:
      'Professional product photography of a large square gift box of Iranian mixed nuts, ' +
      'box painted in festive emerald green with Nowruz spring design on the closed lid: ' +
      'red and yellow tulips and painted colorful eggs inside a green Persian tile arch, ' +
      'ornate Persian floral border patterns covering the whole lid, no panel, no card, no label area, ' +
      'the open green box beside the lid shows six compartments filled with roasted pistachios, ' +
      'almonds, cashews, walnut halves, golden raisins and dried figs, a small wooden bowl of green ' +
      'wheat sprouts and fresh tulips beside the box, bright spring daylight, beige linen tablecloth, ' +
      'cheerful festive atmosphere, soft natural lighting, absolutely no text, no letters, no numbers, ' +
      'no labels, no stickers, no inscriptions, no writing of any kind on the box or anywhere in the image, ' +
      'no watermark, high quality, detailed, photorealistic',
  },
];

const MAX_RETRIES = 3;
const BACKOFF = (attempt) => 1500 * attempt;

async function generate() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const zai = await ZAI.create();

  for (const pack of PACKS) {
    const outPath = path.join(RAW_DIR, `${pack.key}.png`);

    // skip اگر از قبل موجود و سالم است
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 10000) {
      console.log(`⏭  ${pack.key} — از قبل موجود، رد شد`);
      continue;
    }

    let done = false;
    for (let attempt = 1; attempt <= MAX_RETRIES && !done; attempt++) {
      try {
        console.log(`🎨 ${pack.key} — تلاش ${attempt}...`);
        const resp = await zai.images.generations.create({
          prompt: pack.prompt,
          size: '1024x1024',
        });
        const b64 = resp?.data?.[0]?.base64;
        if (!b64) throw new Error('پاسخ خالی از سرویس تصویر');
        const buf = Buffer.from(b64, 'base64');
        if (buf.length < 10000) throw new Error('تصویر بیش‌ازحد کوچک است');
        fs.writeFileSync(outPath, buf);
        console.log(`✅ ${pack.key} → ${outPath} (${(buf.length / 1024).toFixed(0)}KB)`);
        done = true;
      } catch (err) {
        console.error(`✗ ${pack.key} تلاش ${attempt} ناموفق: ${err.message}`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, BACKOFF(attempt)));
        }
      }
    }

    if (!done) {
      console.error(`❌ ${pack.key} پس از ${MAX_RETRIES} تلاش ناموفق بود`);
      process.exitCode = 1;
    }
  }
}

generate().catch((e) => {
  console.error('خطای کلی:', e);
  process.exit(1);
});
