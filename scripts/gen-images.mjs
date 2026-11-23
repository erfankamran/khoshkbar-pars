/**
 * تولید تصاویر محصولات و بنرهای فروشگاه پارس (فاز ۴)
 * - خروجی PNG خام در scripts/img-tmp (قابل ازسرگیری: اگر فایل موجود باشد رد می‌شود)
 * - سپس scripts/convert-images.mjs آن‌ها را به webp بهینه در public تبدیل می‌کند
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const TMP = '/home/z/my-project/scripts/img-tmp';
fs.mkdirSync(TMP, { recursive: true });

const STYLE =
  'professional food product photography, soft studio lighting, warm cream linen background, ' +
  'rustic ceramic or wooden props, appetizing, high quality, detailed, no text, no watermark';

/** [filename, prompt, size] */
const JOBS = [
  // ——— محصولات (مربع ۱۰۲۴) ———
  ['pistachio-akbari', 'long slender premium Iranian Akbari pistachios in shell, piled in a rustic ceramic bowl, ' + STYLE, '1024x1024'],
  ['pistachio-ahmadaghaei', 'Iranian Ahmad Aghaei pistachios with light beige shells, elongated elegant shape in a wooden bowl, ' + STYLE, '1024x1024'],
  ['pistachio-kalehghouchi', 'round plump Kaleh Ghouchi Iranian pistachios with naturally split shells in a clay dish, ' + STYLE, '1024x1024'],
  ['almond-mamaei', 'raw Iranian in-shell almonds (Mamaei variety) in a burlap sack and wooden scoop, ' + STYLE, '1024x1024'],
  ['almond-kernel', 'blanched raw almond kernels piled in a white ceramic bowl, ' + STYLE, '1024x1024'],
  ['walnut-toyserkan', 'whole paper-shell walnuts from Tuyserkan, a few cracked open, rustic wooden table, ' + STYLE, '1024x1024'],
  ['walnut-kernel', 'fresh walnut half kernels with rich brown skin, arranged in a ceramic dish, ' + STYLE, '1024x1024'],
  ['hazelnut-ardabil', 'whole round hazelnuts from Ardabil with smooth brown shells in a wooden bowl, ' + STYLE, '1024x1024'],
  ['hazelnut-kernel', 'roasted hazelnut kernels in a small glass jar and scattered around, ' + STYLE, '1024x1024'],
  ['raisin-green', 'green seedless Persian raisins (Kashmari) in a rustic bowl with fresh grape vine leaves, ' + STYLE, '1024x1024'],
  ['raisin-golden', 'golden sultana raisins glistening in a ceramic dish, ' + STYLE, '1024x1024'],
  ['date-mazafati', 'dark glossy soft Mazafati dates from Bam, arranged in rows on a dark slate plate, ' + STYLE, '1024x1024'],
  ['date-piarom', 'elongated semi-dry Piarom dates with wrinkled amber skin in an elegant bowl, ' + STYLE, '1024x1024'],
  ['dried-fig', 'stacked dried figs from Estahban with natural open tops, cream colored, ' + STYLE, '1024x1024'],
  ['dried-mulberry', 'dried white mulberries with natural sugar frost, piled in a shallow basket, ' + STYLE, '1024x1024'],
  ['dried-apricot', 'sun-dried apricot halves with warm orange color in a ceramic bowl, ' + STYLE, '1024x1024'],
  ['mixed-nuts-luxury', 'luxury mixed nuts platter with pistachios, almonds, cashews and walnut halves in an elegant golden bowl, festive arrangement, ' + STYLE, '1024x1024'],
  ['pumpkin-seed-kernel', 'green raw pumpkin seed kernels (pepitas) in a wooden bowl, ' + STYLE, '1024x1024'],
  // ——— بنرها (عریض ۱۳۴۴×۷۶۸، فضای خالی سمت راست برای متن فارسی RTL) ———
  ['banner-pistachio', 'wide advertising banner of premium Iranian pistachios scattered on a deep forest green background, subtle golden rim light from the left side, large empty dark green space on the right for text, luxury food advertising style, ' + 'no text, no watermark', '1344x768'],
  ['banner-mixed-nuts', 'wide advertising banner with an elegant golden bowl of premium mixed nuts on the left, deep forest green luxury background with soft warm glow, large empty space on the right for text, ' + 'no text, no watermark', '1344x768'],
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
  console.log(`TOTAL=${JOBS.length} PENDING=${pending.length}`);

  for (const [name, prompt, size] of pending) {
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const t0 = Date.now();
        const res = await zai.images.generations.create({ prompt, size });
        const b64 = res?.data?.[0]?.base64;
        if (!b64) throw new Error('empty base64');
        const buf = Buffer.from(b64, 'base64');
        if (buf.length < 20_000) throw new Error('suspiciously small image');
        fs.writeFileSync(path.join(TMP, `${name}.png`), buf);
        console.log(`✓ ${name} (${Math.round(buf.length / 1024)}KB, ${Math.round((Date.now() - t0) / 1000)}s)`);
        ok = true;
      } catch (e) {
        console.error(`✗ ${name} attempt ${attempt}: ${e.message}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    if (!ok) console.error(`✗✗ FAILED permanently: ${name}`);
  }
  console.log('DONE');
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
