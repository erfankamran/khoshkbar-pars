import type { NextRequest } from 'next/server';
import { baseUrlFromHeaders } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * GET /robots.txt — پویا تا آدرس Sitemap همیشه هم‌دامنه فعلی باشد
 * (localhost / پیش‌نمایش / دامنه نهایی — بدون تنظیم اضافه)
 *
 * - /admin: پنل مدیریت → noindex (متادیتا هم noindex دارد)
 * - /api/: داده خام — محتوای ایندکس‌پذیر نیست
 * - فیدهای مقایسه قیمت بلاک نمی‌شوند (خودشان consumer دارند، نه ایندکس)
 *
 * درخواست کاربر (سئو برای هوش مصنوعی): گروه صریح ربات‌های AI تا سیاست
 * فروشگاه شفاف باشد — همه مجاز به خزش و نقل‌قول محتوا در پاسخ‌های AI.
 * توجه: «نتایج AI گوگل» از ایندکس عادی Googlebot تغذیه می‌شود و بات
 * جداگانه‌ای ندارد؛ Google-Extended هم توسط گوگل بازنشسته شده است.
 */

/** همهٔ ربات‌ها همین قواعد را می‌گیرند — تنها تفاوت، شفافیت سیاست است */
const RULES = ['Allow: /', 'Disallow: /admin', 'Disallow: /api/'];

/**
 * ربات‌های هوش مصنوعی — وضعیت ۲۰۲۶:
 * OpenAI (جست‌وجو/تربیت/کاربر)، Anthropic، Perplexity، Meta، Apple،
 * Amazon، DuckDuckGo، You.com، Mistral و Common Crawl
 */
const AI_AGENTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'meta-externalagent',
  'meta-webindexer',
  'Applebot',
  'Applebot-Extended',
  'Amazonbot',
  'Amzn-SearchBot',
  'DuckAssistBot',
  'YouBot',
  'MistralAI-Index',
  'CCBot',
];

export async function GET(req: NextRequest) {
  const base = baseUrlFromHeaders(req.headers);

  const body = `# فروشگاه پارس — فروشگاه خشکبار و مغزهای تازه
# موتورهای جستجو و ربات‌های هوش مصنوعی مجاز به خزش و نقل‌قول هستند
# پنل مدیریت و API دادهٔ خام ایندکس نمی‌شوند

User-agent: *
${RULES.join('\n')}

# ——— اجازهٔ صریح ربات‌های هوش مصنوعی (درخواست کاربر) ———
${AI_AGENTS.map((ua) => `User-agent: ${ua}`).join('\n')}
${RULES.join('\n')}

Sitemap: ${base}/sitemap.xml
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
}
