/**
 * پارس — ویرایش هدفمند تصویر یلدا (حذف مدالیون متنی روی درِ جعبه)
 * اجرا: bun scripts/edit-yalda-image.mjs
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const SRC = 'scripts/festive-raw/yalda.png';
const OUT = 'scripts/festive-raw/yalda-clean.png';

const PROMPT =
  'Remove the small oval golden label badge with writing on the lower left part of the ' +
  'closed red box lid, replace it with plain smooth deep red lid surface matching the ' +
  'surrounding red lid background exactly, keep everything else exactly identical: the moon, ' +
  'stars, candles, pomegranate artwork, ornate borders, the open box with nuts, whole ' +
  'pomegranates, tea light candles and beige linen background all unchanged, maintain overall ' +
  'composition, absolutely no text, no letters, no writing anywhere in the image';

async function main() {
  const buf = fs.readFileSync(SRC);
  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;

  const zai = await ZAI.create();
  console.log('✏️  در حال ویرایش تصویر یلدا...');
  const resp = await zai.images.generations.edit({
    prompt: PROMPT,
    images: [{ url: dataUrl }],
    size: '1024x1024',
  });

  const b64 = resp?.data?.[0]?.base64;
  if (!b64) throw new Error('پاسخ خالی از سرویس ویرایش تصویر');
  const out = Buffer.from(b64, 'base64');
  fs.writeFileSync(OUT, out);
  console.log(`✅ ذخیره شد → ${OUT} (${(out.length / 1024).toFixed(0)}KB)`);
}

main().catch((e) => {
  console.error('❌ خطا:', e.message);
  process.exit(1);
});
