'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  FileJson,
  FileText,
  Globe,
  Info,
  Rss,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { useApi } from '@/hooks/use-api';
import { toFaDigits } from '@/lib/fa';
import { cn } from '@/lib/utils';

/**
 * صفحه «فید و سئو» پنل مدیریت (فاز ۱۳)
 *
 * - فید رسمی ترب (Product API v3) و فید ایمالز (XML + API استخراج JSON)
 * - آدرس‌های sitemap و robots + چک‌لیست سئو پایه
 * - راهنمای گام‌به‌گام ثبت فروشگاه در هر پلتفرم بر اساس مستندات رسمی
 */

interface ProductsResp {
  total: number;
}

interface TorobFeedResp {
  api_version: string;
  total: number;
  max_pages: number;
  products: Array<Record<string, unknown>>;
}

/** فیلد آدرس با دکمه کپی */
function CopyField({
  label,
  path,
  fullUrl,
  hint,
  mono = true,
}: {
  label: string;
  path: string;
  fullUrl: string;
  hint?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success('آدرس کپی شد');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('کپی ناموفق بود — آدرس را دستی انتخاب کنید');
    }
  };

  return (
    <div className="rounded-2xl border border-cream-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11.5px] font-black text-ink-800">{label}</p>
        <button
          type="button"
          onClick={() => void copy()}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition-colors',
            copied
              ? 'bg-brand-600 text-white'
              : 'bg-cream-100 text-ink-600 hover:bg-cream-200'
          )}
          aria-label={`کپی ${label}`}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied ? 'کپی شد' : 'کپی'}
        </button>
      </div>
      <p
        dir="ltr"
        className={cn(
          'mt-2 overflow-x-auto rounded-lg bg-cream-50 px-2.5 py-2 text-left text-[11px] text-ink-700',
          mono && 'font-mono'
        )}
      >
        {path}
      </p>
      {fullUrl && fullUrl !== path && (
        <p dir="ltr" className="mt-1 overflow-x-auto text-left text-[10px] text-ink-400">
          {fullUrl}
        </p>
      )}
      {hint && <p className="mt-1.5 text-[10.5px] leading-5 text-ink-400">{hint}</p>}
    </div>
  );
}

/** ردیف راهنمای گام‌به‌گام */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-black text-white">
        {toFaDigits(n)}
      </span>
      <p className="text-[11.5px] leading-6 text-ink-600">{children}</p>
    </li>
  );
}

function FeedsContent() {
  const { data: productsData } = useApi<ProductsResp>('/api/products?limit=1');
  const { data: torobData } = useApi<TorobFeedResp>('/api/feeds/torob');

  // مقدار client-only بدون شکستن قاعده set-state-in-effect و بدون mismatch هیدریشن
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ''
  );

  const productCount = productsData?.total ?? null;
  const feedRowCount = torobData?.total ?? null;

  const feeds = [
    {
      key: 'torob',
      title: 'فید ترب',
      subtitle: 'Product API v3 — مستند رسمی ترب',
      badge: 'ترب',
      badgeClass: 'bg-brand-50 text-brand-700',
      paths: [
        {
          label: 'آدرس فید (JSON API v3)',
          path: '/api/feeds/torob',
          hint: 'صفحه‌بندی با ?page=2 — هر ردیف یک واریانت وزنی با شناسه پایدار',
        },
      ],
      stats: [
        { label: 'محصول فعال', value: productCount },
        { label: 'ردیف فید (واریانت‌ها)', value: feedRowCount },
      ],
      docsUrl: 'https://github.com/torob/Torob-Sync',
      docsLabel: 'مستند رسمی Torob-Sync',
      panelUrl: 'https://panel.torob.com',
      panelLabel: 'پنل فروشندگان ترب',
      intro:
        'محصولات با قیمت تومان، موجودی، تصاویر و مشخصات کامل به ساختار رسمی Product API v3 ترب صادر می‌شود؛ گروه‌بندی واریانت‌های وزنی یک محصول با product_group_id انجام شده است.',
      steps: [
        <>در پنل فروشندگان ترب (panel.torob.com) حساب فروشگاه بسازید و مدارک را تکمیل کنید.</>,
        <>در بخش اتصال فروشگاه/فید، آدرس «/api/feeds/torob» را با دامنه نهایی سایت ثبت کنید.</>,
        <>تیم ترب فید را بررسی و محصولات را به صفحات مقایسه قیمت متصل می‌کند؛ به‌روزرسانی قیمت و موجودی خودکار است (کش ۵ دقیقه‌ای).</>,
      ],
      notes: [
        'قیمت‌ها به تومان و صحیح است؛ availability بولی و image_links مطلق است (مطابق مستند).',
        'تصاویر فعلی ۸۰۰×۸۰۰ هستند؛ مستند ترب برای بهترین نمایش حداقل ۹۰۰×۹۰۰ را توصیه می‌کند — با جایگزینی تصاویر محصول در پنل، فید خودکار به‌روز می‌شود.',
      ],
    },
    {
      key: 'emalls',
      title: 'فید ایمالز',
      subtitle: 'فید XML استاندارد + API استخراج JSON',
      badge: 'ایمالز',
      badgeClass: 'bg-gold-100 text-gold-700',
      paths: [
        {
          label: 'فید XML',
          path: '/feeds/emalls.xml',
          hint: 'ساختار products/product با id، title، link، price، image، availability و مشخصات',
        },
        {
          label: 'API استخراج (JSON)',
          path: '/api/feeds/emalls',
          hint: 'هم‌ارز خروجی افزونه رسمی «Emalls Extraction API» برای وب‌سرویس ایمالز',
        },
      ],
      stats: [{ label: 'ردیف فید (واریانت‌ها)', value: feedRowCount }],
      docsUrl: 'https://emalls.ir/ShopRequest',
      docsLabel: 'ثبت فروشگاه در ایمالز',
      panelUrl: 'https://emalls.ir',
      panelLabel: 'وب‌سایت ایمالز',
      intro:
        'دو قالب آماده دارد: فید XML استاندارد مقایسه قیمت و API استخراج JSON هم‌ارز افزونه رسمی ایمالز (نام، قیمت، تصاویر، مشخصات، موجودی). هر دو همیشه به‌روز هستند.',
      steps: [
        <>ثبت فروشگاه در ایمالز فقط با نماد اعتماد الکترونیکی (اینماد) ممکن است — از emalls.ir/ShopRequest درخواست بدهید.</>,
        <>پس از تایید و شارژ پنل، آدرس «/feeds/emalls.xml» یا «/api/feeds/emalls» را از طریق پشتیبانی ایمالز (۰۲۱-۹۱۰۰۳۹۳۳) یا پنل فروشگاهی معرفی کنید.</>,
        <>ربات ایمالز کاتالوگ را می‌خواند و محصولات را به صفحات متناظر متصل می‌کند (معمولاً ۳ تا ۵ روز کاری).</>,
      ],
      notes: [
        'شرط ثبت: اینماد معتبر + سبد خرید فعال (دو مورد فرآیندی‌اند و به کد ربطی ندارند — فید از الان آماده است).',
      ],
    },
  ] as const;

  return (
    <div className="space-y-5">
      {/* ——— سرصفحه ——— */}
      <div>
        <h1 className="text-base font-black text-ink-900">فید مقایسه قیمت و سئو</h1>
        <p className="mt-1 text-[12px] leading-6 text-ink-500">
          آدرس‌های زیر محصولات فروشگاه را برای موتورهای مقایسه قیمت (ترب و ایمالز) و
          موتورهای جستجو منتشر می‌کنند. آدرس‌ها به‌صورت خودکار با دامنه فعلی سایت ساخته
          می‌شوند و همیشه به‌روز هستند.
        </p>
      </div>

      {/* ——— آمار ——— */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            icon: Globe,
            label: 'محصولات فعال در فید',
            value: productCount === null ? '…' : toFaDigits(productCount),
          },
          {
            icon: Rss,
            label: 'ردیف فید (هر واریانت یک ردیف)',
            value: feedRowCount === null ? '…' : toFaDigits(feedRowCount),
          },
          {
            icon: Search,
            label: 'صفحات ایندکس‌پذیر (محصول + اصلی)',
            value:
              productCount === null ? '…' : toFaDigits((productCount ?? 0) + 1),
          },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-card"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-black text-ink-900">{s.value}</p>
                <p className="truncate text-[10.5px] text-ink-400">{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ——— کارت‌های پلتفرم‌ها ——— */}
      {feeds.map((f) => (
        <section key={f.key} className="rounded-3xl bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[10.5px] font-black',
                f.badgeClass
              )}
            >
              {f.badge}
            </span>
            <h2 className="text-[14px] font-black text-ink-900">{f.title}</h2>
            <span className="text-[11px] text-ink-300">| {f.subtitle}</span>
            <a
              href={f.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mr-auto flex items-center gap-1 text-[11px] font-bold text-brand-700 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {f.docsLabel}
            </a>
          </div>

          <p className="mt-3 text-[12px] leading-6 text-ink-600">{f.intro}</p>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {f.paths.map((p) => (
              <CopyField
                key={p.path}
                label={p.label}
                path={p.path}
                fullUrl={`${origin}${p.path}`}
                hint={p.hint}
              />
            ))}
          </div>

          {f.stats.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {f.stats.map((s) => (
                <span
                  key={s.label}
                  className="rounded-full bg-cream-100 px-3 py-1.5 text-[11px] font-bold text-ink-600"
                >
                  {s.label}:{' '}
                  <span className="font-black text-brand-700">
                    {s.value === null ? '…' : toFaDigits(s.value)}
                  </span>
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-2xl bg-cream-50 p-4">
            <p className="text-[11.5px] font-black text-ink-800">
              راهنمای اتصال به {f.badge}
            </p>
            <ol className="mt-2.5 space-y-2">
              {f.steps.map((s, i) => (
                <Step key={i} n={i + 1}>
                  {s}
                </Step>
              ))}
            </ol>
            <a
              href={f.panelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-[11px] font-black text-white transition-colors hover:bg-brand-700"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {f.panelLabel}
            </a>
          </div>

          {f.notes.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {f.notes.map((n, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-6 text-ink-500">
                  <Info className="mt-1 h-3.5 w-3.5 shrink-0 text-gold-600" aria-hidden />
                  {n}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {/* ——— سئو پایه ——— */}
      <section className="rounded-3xl bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[10.5px] font-black text-ink-700">
            سئو
          </span>
          <h2 className="text-[14px] font-black text-ink-900">سئو پایه سایت</h2>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <CopyField
            label="نقشه سایت (Sitemap)"
            path="/sitemap.xml"
            fullUrl={`${origin}/sitemap.xml`}
            hint="آدرس صفحه اصلی + همه صفحات محصولات با lastmod — برای ثبت در Google Search Console"
          />
          <CopyField
            label="robots.txt"
            path="/robots.txt"
            fullUrl={`${origin}/robots.txt`}
            hint="مسیرهای /admin و /api بلاک است، ربات‌های هوش مصنوعی صریحاً مجازند و آدرس Sitemap داخلش معرفی شده"
          />
          <CopyField
            label="llms.txt (برای هوش مصنوعی)"
            path="/llms.txt"
            fullUrl={`${origin}/llms.txt`}
            hint="معرفی برند + لینک دسته‌ها، محصولات و صفحات راهنما — برای ابزارهای AI"
          />
        </div>

        <div className="mt-4">
          <p className="text-[11.5px] font-black text-ink-800">وضعیت چک‌لیست سئو</p>
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: 'متادیتای اختصاصی هر محصول (title/description)', done: true },
              { label: 'آدرس canonical برای صفحه اصلی و محصولات', done: true },
              { label: 'OpenGraph و Twitter Card', done: true },
              { label: 'داده ساختاریافته JSON-LD (Product/Organization/Breadcrumb)', done: true },
              { label: 'alt فارسی برای همه تصاویر محصولات و محتوا', done: true },
              { label: 'sitemap.xml و robots.txt پویا', done: true },
              { label: 'صفحهٔ محصول SSR با لینک‌سازی داخلی (مرتبط‌ها)', done: true },
              { label: 'صفحات SSR دسته‌بندی /c/[slug] با ItemList', done: true },
              { label: 'بلاک SSR قابل خزش در صفحهٔ اصلی', done: true },
              { label: 'robots.txt با اجازهٔ صریح ربات‌های هوش مصنوعی', done: true },
              { label: 'llms.txt پویا برای ابزارهای هوش مصنوعی', done: true },
              { label: 'ثبت در Google Search Console (فرآیندی — پس از دامنهٔ نهایی)', done: false },
              { label: 'ثبت در Bing Webmaster Tools (مبنای ChatGPT/Copilot)', done: false },
            ].map((c) => (
              <div
                key={c.label}
                className={cn(
                  'flex items-start gap-2 rounded-2xl border p-3 text-[11px] leading-5',
                  c.done
                    ? 'border-brand-100 bg-brand-50/50 text-ink-700'
                    : 'border-gold-200 bg-gold-50 text-gold-800'
                )}
              >
                {c.done ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                )}
                <span className="font-bold">{c.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-cream-50 p-3.5 text-[11px] leading-6 text-ink-500">
          <FileJson className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          <span>
            صفحه استاندارد هر محصول در آدرس{' '}
            <span dir="ltr" className="font-mono text-ink-700">
              /p/[slug]
            </span>{' '}
            سرو می‌شود — همین آدرس‌ها در فید ترب/ایمالز و sitemap استفاده می‌شوند و
            اشتراک‌گذاری و ایندکس‌شدن محصول را ممکن می‌کنند.
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-cream-50 p-3.5 text-[11px] leading-6 text-ink-500">
          <FileText className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          <span>
            پس از تنظیم دامنه نهایی، متغیر محیطی{' '}
            <span dir="ltr" className="font-mono text-ink-700">
              NEXT_PUBLIC_SITE_URL
            </span>{' '}
            را روی همان دامنه بگذارید (برای متادیتای پایه) — فیدها و sitemap به‌صورت
            خودکار از هدر درخواست دامنه درست را می‌سازند.
          </span>
        </div>
      </section>
    </div>
  );
}

export default function AdminFeedsPage() {
  return (
    <AdminShell>
      <FeedsContent />
    </AdminShell>
  );
}
