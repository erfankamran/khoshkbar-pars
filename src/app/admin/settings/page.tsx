'use client';

import { useEffect, useState } from 'react';
import {
  Banknote,
  CreditCard,
  Loader2,
  MapPin,
  MessageSquareText,
  PackageCheck,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  Smartphone,
  Sparkles,
  Store,
  Trash2,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { EmptyState, PageHeader, Pill, mutationError } from '@/components/admin/kit';
import { MediaUploadField } from '@/components/admin/MediaUploadField';
import { MapPicker } from '@/components/admin/MapPicker';
import { LogoMark } from '@/components/shared/Logo';
import { BRAND } from '@/lib/config';
import { useApi } from '@/hooks/use-api';
import { apiPost, apiPut } from '@/lib/api-client';
import { normalizePhone } from '@/lib/phone';
import { toFaDigits } from '@/lib/fa';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * تنظیمات فروشگاه (فاز ۱۴ و ۱۵ + فاز ۲ + اسپلش) — شش بخش:
 *  ۰) برند و هویت: نام، شعار، توضیح سئو و لوگوی آپلودی (namespace برند)
 *  ۱) تم رنگی: رنگ اصلی و تأکیدی — پالت کل فروشگاه از همین دو رنگ ساخته می‌شود
 *  ۲) فروش و سفارش: باز بودن فروشگاه، حداقل سفارش، تلفن پشتیبانی
 *  ۳) ارسال پستی: آستانه رایگان، هزینه پایه، روش‌های ارسال (نام/هزینه/زمان/فعال)
 *     و توضیح وضعیت ارسال که در تسویه حساب و جزئیات سفارش به مشتری نمایش داده می‌شود
 *  ۴) درگاه پرداخت: فعال/غیرفعال کردن پرداخت آنلاین و در محل، انتخاب درگاه و مرچنت کد
 *  ۵) اسکرین اسپلش: فعال/غیرفعال، لوگو، رنگ پس‌زمینه، متن و مدت نمایش صفحه آغازین (با پیش‌نمایش زنده)
 *
 * ذخیره فقط برای کلیدهای whitelist — سمت سرور هر مقدار را اعتبارسنجی می‌کند.
 */

interface SettingRow {
  key: string;
  value: string;
  description: string;
  updatedAt: string | null;
}

interface SettingsResp {
  settings: SettingRow[];
  /** پیامک از متغیرهای محیطی پیکربندی شده و مقادیر پنل نادیده گرفته می‌شود */
  smsEnvManaged?: boolean;
}

/** ساختار یک روش ارسال پستی — هم‌راستا با shipping.service سمت سرور */
interface ShipMethodRow {
  id: string;
  name: string;
  costToman: number;
  etaDays: string;
  enabled: boolean;
}

const LABELS: Record<string, string> = {
  freeShippingThresholdToman: 'آستانه ارسال رایگان (تومان)',
  deliveryFeeToman: 'هزینه پایه ارسال (تومان)',
  minOrderToman: 'حداقل مبلغ سفارش (تومان)',
  storeOpen: 'فروشگاه باز است',
  supportPhone: 'تلفن پشتیبانی',
  shippingNote: 'توضیح وضعیت ارسال برای مشتری',
  onlineGatewayEnabled: 'پرداخت آنلاین فعال باشد',
  codEnabled: 'پرداخت در محل فعال باشد',
  gatewayProvider: 'درگاه پرداخت آنلاین',
  gatewayMerchantId: 'مرچنت کد درگاه',
  // فاز ۲ — برند و تم
  'brand.name': 'نام کوتاه برند',
  'brand.fullName': 'نام کامل برند',
  'brand.tagline': 'زیرنویس برند (زیر نام در هدر)',
  'brand.slogan': 'شعار برند',
  'brand.description': 'توضیح برند برای سئو',
  'brand.logoUrl': 'لوگوی فروشگاه',
  'theme.primary': 'رنگ اصلی برند',
  'theme.accent': 'رنگ تأکیدی (برچسب و تخفیف)',
  // نقشه موقعیت فروشگاه
  'store.mapLat': 'عرض جغرافیایی (Latitude)',
  'store.mapLng': 'طول جغرافیایی (Longitude)',
  // نشانی پستی فروشگاه — چاپ فاکتور (درخواست کاربر)
  'store.address': 'نشانی پستی فروشگاه',
  'store.postalCode': 'کدپستی فروشگاه',
  // پیامک ملی‌پیامک
  'sms.provider': 'سرویس پیامک کد تایید',
  'sms.melipayamak.username': 'نام کاربری ملی‌پیامک',
  'sms.melipayamak.password': 'رمز وب‌سروس ملی‌پیامک',
  'sms.melipayamak.sender': 'خط ارسال‌کننده (از پنل)',
  // اسکرین اسپلش (صفحه آغازین) — درخواست کاربر
  'splash.enabled': 'نمایش صفحه آغازین (اسپلش)',
  'splash.logoUrl': 'لوگوی صفحه آغازین',
  'splash.backgroundColor': 'رنگ پس‌زمینه صفحه آغازین',
  'splash.title': 'عنوان روی صفحه آغازین',
  'splash.slogan': 'شعار روی صفحه آغازین',
  'splash.durationMs': 'مدت نمایش صفحه آغازین (میلی‌ثانیه)',
};

const NUMERIC = new Set(['freeShippingThresholdToman', 'deliveryFeeToman', 'minOrderToman', 'splash.durationMs']);
const BOOLEAN = new Set(['storeOpen', 'onlineGatewayEnabled', 'codEnabled', 'splash.enabled']);
/** فاز ۲ — فیلدهای متنی برند + اسپلش (فارسی، کامل) */
const BRAND_TEXT = new Set(['brand.name', 'brand.fullName', 'brand.tagline', 'brand.slogan', 'splash.title', 'splash.slogan']);
const THEME_COLOR = new Set(['theme.primary', 'theme.accent', 'splash.backgroundColor']);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const GATEWAY_OPTIONS = [
  { value: 'SANDBOX', label: 'درگاه تستی (شبیه‌سازی)' },
  { value: 'ZARINPAL', label: 'زرین‌پال' },
  { value: 'IDPAY', label: 'آیدی‌پی' },
  { value: 'ZIBAL', label: 'زیبال' },
] as const;

const GROUPS: Array<{
  title: string;
  desc: string;
  icon: typeof Store;
  keys: string[];
}> = [
  {
    title: 'برند و هویت',
    desc: 'نام، شعار، توضیح سئو و لوگو — همان لحظه در فروشگاه و نتایج جست‌وجو',
    icon: Sparkles,
    keys: ['brand.name', 'brand.fullName', 'brand.tagline', 'brand.slogan', 'brand.description', 'brand.logoUrl'],
  },
  {
    title: 'تم رنگی',
    desc: 'پالت فروشگاه از این دو رنگ ساخته می‌شود — بدون رفرش برای مشتری اعمال می‌شود',
    icon: Palette,
    keys: ['theme.primary', 'theme.accent'],
  },
  {
    title: 'اسکرین اسپلش (صفحه آغازین)',
    desc: 'لوگو، رنگ پس‌زمینه، متن و مدت نمایش صفحه‌ای که با باز کردن فروشگاه دیده می‌شود — با پیش‌نمایش زنده',
    icon: Smartphone,
    keys: [
      'splash.enabled',
      'splash.logoUrl',
      'splash.backgroundColor',
      'splash.title',
      'splash.slogan',
      'splash.durationMs',
    ],
  },
  {
    title: 'فروش و سفارش',
    desc: 'وضعیت باز بودن فروشگاه و قواعد ثبت سفارش',
    icon: Store,
    keys: ['storeOpen', 'minOrderToman', 'supportPhone'],
  },
  {
    title: 'ارسال پستی',
    desc: 'هزینه‌ها، روش‌های ارسال و توضیحی که مشتری در تسویه حساب می‌بیند',
    icon: Truck,
    keys: ['freeShippingThresholdToman', 'deliveryFeeToman', 'shippingNote'],
  },
  {
    title: 'درگاه پرداخت',
    desc: 'روش‌های پرداخت مجاز و پیکربندی درگاه آنلاین',
    icon: CreditCard,
    keys: ['onlineGatewayEnabled', 'codEnabled', 'gatewayProvider', 'gatewayMerchantId'],
  },
  {
    title: 'نقشه فروشگاه',
    desc: 'موقعیت فروشگاه روی نقشه — در صفحه «درباره فروشگاه» به مشتری نمایش داده می‌شود',
    icon: MapPin,
    keys: ['store.mapLat', 'store.mapLng'],
  },
  {
    title: 'نشانی پستی فروشگاه',
    desc: 'سربرگ فاکتور چاپی A5 و بخش فرستنده مرسوله («از کی به کی») از همین نشانی پر می‌شود',
    icon: MapPin,
    keys: ['store.address', 'store.postalCode'],
  },
  {
    title: 'پیامک کد تایید (ملی‌پیامک)',
    desc: 'ارسال واقعی کد تایید ورود و ثبت سفارش با سرویس ملی‌پیامک',
    icon: MessageSquareText,
    keys: [
      'sms.provider',
      'sms.melipayamak.username',
      'sms.melipayamak.password',
      'sms.melipayamak.sender',
    ],
  },
];

function parseMethods(raw: string): ShipMethodRow[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((m) => {
      const r = (m ?? {}) as Record<string, unknown>;
      return {
        id: typeof r.id === 'string' ? r.id : '',
        name: typeof r.name === 'string' ? r.name : '',
        costToman: typeof r.costToman === 'number' ? r.costToman : Number(r.costToman) || 0,
        etaDays: typeof r.etaDays === 'string' ? r.etaDays : '',
        enabled: r.enabled !== false,
      };
    });
  } catch {
    return [];
  }
}

export default function AdminSettingsPage() {
  return (
    <AdminShell>
      <SettingsContent />
    </AdminShell>
  );
}

function SettingsContent() {
  const { data, loading, error, reload } = useApi<SettingsResp>('/api/admin/settings');
  const [values, setValues] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<ShipMethodRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      const next: Record<string, string> = {};
      for (const s of data.settings) next[s.key] = s.value;
      setValues(next);
      setMethods(parseMethods(next.shippingMethods ?? '[]'));
    }
  }, [data]);

  const setVal = (key: string, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  const updateMethod = (index: number, patch: Partial<ShipMethodRow>) =>
    setMethods((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const addMethod = () =>
    setMethods((rows) => [
      ...rows,
      {
        id: `post-${Date.now().toString(36).slice(-5)}`,
        name: '',
        costToman: 0,
        etaDays: '',
        enabled: true,
      },
    ]);

  const removeMethod = (index: number) =>
    setMethods((rows) => rows.filter((_, i) => i !== index));

  const save = async () => {
    // محاسبه مستقل «تغییر وجود دارد» — مستقل از رندر؛ اگر هیچ تغییری
    // نبود، دکمه سیو پیام راهنما می‌دهد و درخواست اضافه به سرور نمی‌رود
    const serverMap = data
      ? Object.fromEntries(data.settings.map((s) => [s.key, s.value]))
      : null;
    const changed =
      !!serverMap &&
      JSON.stringify({ ...values, shippingMethods: JSON.stringify(methods) }) !==
        JSON.stringify({
          ...serverMap,
          shippingMethods: JSON.stringify(parseMethods(serverMap.shippingMethods ?? '[]')),
        });
    if (!changed) {
      toast.info('تغییر جدیدی برای ذخیره وجود ندارد');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...values, shippingMethods: JSON.stringify(methods) };
      await apiPut('/api/admin/settings', { values: payload });
      toast.success('تنظیمات ذخیره شد — بلافاصله برای مشتری‌ها اعمال شد');
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="تنظیمات" desc="پیکربندی برند و تم، فروش، ارسال پستی و درگاه پرداخت" />
        <div className="shimmer h-64 rounded-3xl" aria-label="در حال بارگذاری" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader title="تنظیمات" desc="پیکربندی برند و تم، فروش، ارسال پستی و درگاه پرداخت" />
        <EmptyState icon={Settings} title="دریافت تنظیمات ناموفق بود" hint={error ?? undefined} />
      </div>
    );
  }

  const serverValues = Object.fromEntries(data.settings.map((s) => [s.key, s.value]));
  const dirty =
    JSON.stringify({ ...values, shippingMethods: JSON.stringify(methods) }) !==
    JSON.stringify({ ...serverValues, shippingMethods: JSON.stringify(parseMethods(serverValues.shippingMethods ?? '[]')) });

  const byKey = new Map(data.settings.map((s) => [s.key, s]));
  const gatewayProvider = values.gatewayProvider ?? 'SANDBOX';

  return (
    <div className="pb-28">
      <PageHeader
        title="تنظیمات"
        desc="پیکربندی برند و تم، فروش، ارسال پستی و درگاه پرداخت — بلافاصله روی فروشگاه اعمال می‌شود"
        action={
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={cn(
              'flex h-10 items-center gap-1.5 rounded-xl px-4 text-[12px] font-black transition-colors',
              dirty
                ? 'bg-brand-600 text-white hover:bg-brand-700'
                : 'bg-cream-200 text-ink-400',
              saving && 'opacity-60'
            )}
          >
            {saving ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            ذخیره تغییرات
          </button>
        }
      />

      <div className="max-w-2xl space-y-5">
        {GROUPS.map((group) => {
          const Icon = group.icon;
          return (
            <section
              key={group.title}
              className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
              aria-label={group.title}
            >
              <header className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <h2 className="text-[13px] font-black text-ink-900">{group.title}</h2>
                  <p className="text-[10.5px] text-ink-400">{group.desc}</p>
                </div>
              </header>

              <div className="space-y-3">
                {/* ——— ردیف‌های ساده هر بخش ——— */}
                {group.keys.map((key) => {
                  const s = byKey.get(key);
                  if (!s) return null;
                  /* ——— نقشه فروشگاه: کارت ترکیبی (هر دو مختصات + پیش‌نمایش) ——— */
                  if (key === 'store.mapLat') {
                    return <MapSettingsCard key={key} values={values} setVal={setVal} />;
                  }
                  if (key === 'store.mapLng') {
                    return null; // داخل کارت ترکیبی رندر می‌شود
                  }
                  /* ——— اسکرین اسپلش: کلید فعال/غیرفعال + پیش‌نمایش زنده (درخواست کاربر) ——— */
                  if (key === 'splash.enabled') {
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[12.5px] font-black text-ink-900">{LABELS[key]}</p>
                            <p className="mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                          </div>
                          <Switch
                            checked={values[key] === 'true'}
                            onCheckedChange={(v) => setVal(key, v ? 'true' : 'false')}
                            aria-label={LABELS[key]}
                          />
                        </div>
                        {values[key] === 'false' ? (
                          <p className="mt-2.5 rounded-xl bg-gold-100/80 px-3 py-2 text-[10px] leading-5 text-gold-800">
                            اسپلش خاموش است — کاربر با باز کردن فروشگاه، مستقیم صفحه اصلی را می‌بیند.
                          </p>
                        ) : (
                          <SplashPreviewCard values={values} />
                        )}
                      </div>
                    );
                  }
                  /* ——— اسکرین اسپلش: آپلود لوگوی صفحه آغازین ——— */
                  if (key === 'splash.logoUrl') {
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <p className="text-[12.5px] font-black text-ink-900">{LABELS[key]}</p>
                        <p className="mb-2.5 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        <MediaUploadField
                          value={values[key] ?? ''}
                          onChange={(url) => setVal(key, url)}
                          ariaLabel={LABELS[key]}
                          kind="brand"
                          aspect="avatar"
                          emptyHint="خالی = نشان پیش‌فرض پارس — تصویر مربعی (PNG/JPG/WebP تا ۵ مگابایت)"
                        />
                      </div>
                    );
                  }
                  /* ——— پیامک ملی‌پیامک (درخواست کاربر) — پیکربندی از env هم ممکن است ——— */
                  if (key === 'sms.provider') {
                    const provider = (values['sms.provider'] ?? '').trim();
                    const envManaged = data?.smsEnvManaged === true;
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <Label htmlFor="st-sms-provider" className="text-[12.5px] font-black text-ink-900">
                          {LABELS[key]}
                        </Label>
                        <p className="mb-2 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        {envManaged && (
                          <p className="mb-2 rounded-xl bg-brand-50 px-3 py-2 text-[10px] font-bold leading-5 text-brand-800 ring-1 ring-brand-200">
                            پیامک از متغیرهای محیطی (env) مدیریت می‌شود — مقادیر این بخش تا حذف env نادیده گرفته می‌شوند. برای تغییر، SMS_PROVIDER و SMS_USERNAME و SMS_PASSWORD و SMS_SENDER را در محیط سرور ویرایش و سرویس را ری‌استارت کنید.
                          </p>
                        )}
                        <Select
                          value={provider || 'none'}
                          onValueChange={(v) => setVal('sms.provider', v === 'none' ? '' : v)}
                        >
                          <SelectTrigger id="st-sms-provider" className="h-9 w-60 text-[12.5px] font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">خاموش — کد فقط حالت آزمایشی</SelectItem>
                            <SelectItem value="melipayamak">ملی‌پیامک — ارسال واقعی</SelectItem>
                          </SelectContent>
                        </Select>
                        {provider === 'melipayamak' ? (
                          <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-[10px] leading-5 text-brand-800">
                            ارسال واقعی فعال است — کد تایید ورود و ثبت سفارش با پیامک ملی‌پیامک می‌رسد. سه فیلد بعدی را کامل کنید و با «ارسال آزمایشی» سلامت اتصال را بسنجید.
                          </p>
                        ) : (
                          <p className="mt-2 rounded-xl bg-gold-100/80 px-3 py-2 text-[10px] leading-5 text-gold-800">
                            سرویس خاموش است — کد تایید فقط در حالت آزمایشی (بدون پیامک واقعی) نمایش داده می‌شود.
                          </p>
                        )}
                        <SmsTestCard />
                      </div>
                    );
                  }
                  if (
                    key === 'sms.melipayamak.username' ||
                    key === 'sms.melipayamak.password' ||
                    key === 'sms.melipayamak.sender'
                  ) {
                    const isSecret = key === 'sms.melipayamak.password';
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <Label htmlFor={`st-${key}`} className="text-[12.5px] font-black text-ink-900">
                          {LABELS[key]}
                        </Label>
                        <p className="mb-2 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        <Input
                          id={`st-${key}`}
                          dir="ltr"
                          type={isSecret ? 'password' : 'text'}
                          autoComplete={isSecret ? 'off' : undefined}
                          value={values[key] ?? ''}
                          onChange={(e) => setVal(key, e.target.value)}
                          placeholder={key === 'sms.melipayamak.sender' ? '50004000123456' : ''}
                          className="h-9 w-64 text-left font-mono text-[12.5px]"
                        />
                      </div>
                    );
                  }
                  /* ——— نشانی پستی فروشگاه — سربرگ فاکتور چاپی A5 (درخواست کاربر) ——— */
                  if (key === 'store.address') {
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <Label htmlFor="st-store-address" className="text-[12.5px] font-black text-ink-900">
                          {LABELS[key]}
                        </Label>
                        <p className="mb-2 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        <Textarea
                          id="st-store-address"
                          rows={2}
                          value={values[key] ?? ''}
                          onChange={(e) => setVal(key, e.target.value)}
                          maxLength={300}
                          placeholder="مثلاً: تهران، خیابان ولی‌عصر، پلاک ۱۲، واحد ۳"
                          className="text-[12.5px]"
                        />
                      </div>
                    );
                  }
                  if (key === 'store.postalCode') {
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <Label htmlFor="st-store-postal" className="text-[12.5px] font-black text-ink-900">
                          {LABELS[key]}
                        </Label>
                        <p className="mb-2 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        <Input
                          id="st-store-postal"
                          dir="ltr"
                          inputMode="numeric"
                          value={values[key] ?? ''}
                          onChange={(e) => setVal(key, e.target.value)}
                          placeholder="کدپستی ۱۰ رقمی"
                          className="h-9 w-44 text-left text-[12.5px]"
                        />
                      </div>
                    );
                  }
                  if (BOOLEAN.has(key)) {
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-2xl border border-cream-100 bg-cream-50/60 p-3"
                      >
                        <div>
                          <p className="text-[12.5px] font-black text-ink-900">{LABELS[key]}</p>
                          <p className="mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        </div>
                        <Switch
                          checked={values[key] === 'true'}
                          onCheckedChange={(v) => setVal(key, v ? 'true' : 'false')}
                          aria-label={LABELS[key]}
                        />
                      </div>
                    );
                  }
                  /* ——— فاز ۲: آپلود لوگو برند ——— */
                  if (key === 'brand.logoUrl') {
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <p className="text-[12.5px] font-black text-ink-900">{LABELS[key]}</p>
                        <p className="mb-2.5 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        <MediaUploadField
                          value={values[key] ?? ''}
                          onChange={(url) => setVal(key, url)}
                          ariaLabel={LABELS[key]}
                          kind="brand"
                          aspect="avatar"
                          emptyHint="خالی = نشان پیش‌فرض پارس — PNG/JPG/WebP تا ۵ مگابایت"
                        />
                      </div>
                    );
                  }
                  /* ——— فاز ۲: انتخابگر رنگ تم ——— */
                  if (THEME_COLOR.has(key)) {
                    const current = values[key] ?? '';
                    const valid = HEX_RE.test(current);
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <Label htmlFor={`st-${key}`} className="text-[12.5px] font-black text-ink-900">
                          {LABELS[key]}
                        </Label>
                        <p className="mb-2 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <input
                            type="color"
                            value={valid ? current : '#000000'}
                            onChange={(e) => setVal(key, e.target.value)}
                            aria-label={`انتخاب ${LABELS[key]}`}
                            className="h-9 w-12 cursor-pointer rounded-lg border border-cream-200 bg-white p-1"
                          />
                          <Input
                            id={`st-${key}`}
                            dir="ltr"
                            value={current}
                            onChange={(e) => setVal(key, e.target.value)}
                            placeholder="#1f8f5a"
                            className="h-9 w-32 text-left text-[12.5px]"
                          />
                          <span
                            aria-hidden
                            className="h-9 w-9 rounded-lg border border-cream-200"
                            style={{ backgroundColor: valid ? current : 'transparent' }}
                          />
                          {!valid && (
                            <span className="text-[10px] font-bold text-red-500">
                              رنگ باید HEX شش‌رقمی باشد
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }
                  /* ——— فاز ۲: توضیح برند (چندخطی) ——— */
                  if (key === 'brand.description') {
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <Label htmlFor={`st-${key}`} className="text-[12.5px] font-black text-ink-900">
                          {LABELS[key]}
                        </Label>
                        <p className="mb-2 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        <Textarea
                          id={`st-${key}`}
                          rows={2}
                          value={values[key] ?? ''}
                          onChange={(e) => setVal(key, e.target.value)}
                          maxLength={300}
                          className="text-[12.5px]"
                        />
                      </div>
                    );
                  }
                  /* ——— فاز ۲: متن‌های برند (فارسی، عرض کامل) ——— */
                  if (BRAND_TEXT.has(key)) {
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <Label htmlFor={`st-${key}`} className="text-[12.5px] font-black text-ink-900">
                          {LABELS[key]}
                        </Label>
                        <p className="mb-2 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        <Input
                          id={`st-${key}`}
                          value={values[key] ?? ''}
                          onChange={(e) => setVal(key, e.target.value)}
                          className="h-9 w-full text-right text-[12.5px]"
                        />
                      </div>
                    );
                  }
                  if (key === 'gatewayProvider') {
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <Label htmlFor="st-provider" className="text-[12.5px] font-black text-ink-900">
                          {LABELS[key]}
                        </Label>
                        <p className="mb-2 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        <Select value={gatewayProvider} onValueChange={(v) => setVal('gatewayProvider', v)}>
                          <SelectTrigger id="st-provider" className="h-9 w-56 text-[12.5px] font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {GATEWAY_OPTIONS.map((g) => (
                              <SelectItem key={g.value} value={g.value}>
                                {g.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {gatewayProvider !== 'SANDBOX' && (
                          <p className="mt-2 rounded-xl bg-gold-100/80 px-3 py-2 text-[10px] leading-5 text-gold-800">
                            {gatewayProvider === 'ZIBAL' ? (
                              <>پرداخت واقعی زیبال فعال است — مشتری به gateway.zibal.ir هدایت می‌شود. برای تست بدون ثبت‌نام، مرچنت کد را «zibal» بگذارید. آدرس بازگشت: /payment/callback</>
                            ) : (
                              <>تا وقتی درگاه تستی (SANDBOX) انتخاب است، پرداخت آنلاین شبیه‌سازی‌شده ثبت می‌شود (برچسب تستی). برای پرداخت واقعی، درگاه «زیبال» را انتخاب و مرچنت کد را وارد کنید.</>
                            )}
                          </p>
                        )}
                      </div>
                    );
                  }
                  if (key === 'gatewayMerchantId') {
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <Label htmlFor="st-merchant" className="text-[12.5px] font-black text-ink-900">
                          {LABELS[key]}
                        </Label>
                        <p className="mb-2 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        <Input
                          id="st-merchant"
                          dir="ltr"
                          value={values[key] ?? ''}
                          onChange={(e) => setVal(key, e.target.value)}
                          placeholder={gatewayProvider === 'ZIBAL' ? 'zibal (تست) یا کد مرچنت واقعی' : 'کد مرچنت درگاه'}
                          className="h-9 w-64 text-left text-[12.5px]"
                        />
                        {gatewayProvider === 'ZIBAL' && (
                          <p className="mt-2 text-[10px] leading-5 text-ink-400">
                            کد مرچنت از پنل zibal.ir → بخش درگاه‌ها قابل مشاهده است. مقدار «zibal» فقط برای تست است و پول واقعی جابه‌جا نمی‌شود.
                          </p>
                        )}
                      </div>
                    );
                  }
                  if (key === 'shippingNote') {
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <Label htmlFor="st-shipnote" className="text-[12.5px] font-black text-ink-900">
                          {LABELS[key]}
                        </Label>
                        <p className="mb-2 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        <Textarea
                          id="st-shipnote"
                          rows={2}
                          value={values[key] ?? ''}
                          onChange={(e) => setVal(key, e.target.value)}
                          maxLength={200}
                          className="text-[12.5px]"
                        />
                      </div>
                    );
                  }
                  if (NUMERIC.has(key)) {
                    return (
                      <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                        <Label htmlFor={`st-${key}`} className="text-[12.5px] font-black text-ink-900">
                          {LABELS[key]}
                        </Label>
                        <p className="mb-2 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                        <Input
                          id={`st-${key}`}
                          type="number"
                          value={values[key] ?? ''}
                          onChange={(e) => setVal(key, e.target.value)}
                          className="h-9 w-44 text-[12.5px]"
                          min={0}
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={key} className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
                      <Label htmlFor={`st-${key}`} className="text-[12.5px] font-black text-ink-900">
                        {LABELS[key]}
                      </Label>
                      <p className="mb-2 mt-0.5 text-[10.5px] leading-5 text-ink-400">{s.description}</p>
                      <Input
                        id={`st-${key}`}
                        dir="ltr"
                        value={values[key] ?? ''}
                        onChange={(e) => setVal(key, e.target.value)}
                        className="h-9 w-52 text-left text-[12.5px]"
                      />
                    </div>
                  );
                })}

                {/* ——— ویرایشگر روش‌های ارسال (فقط بخش ارسال پستی) ——— */}
                {group.keys.includes('shippingNote') && (
                  <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <PackageCheck className="h-4 w-4 text-brand-600" aria-hidden />
                        <p className="text-[12.5px] font-black text-ink-900">
                          روش‌های ارسال پستی
                          <span className="mr-1.5 text-[10px] font-bold text-ink-400">
                            ({toFaDigits(methods.length)} روش)
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addMethod}
                        className="flex h-8 items-center gap-1 rounded-lg bg-brand-600 px-2.5 text-[10.5px] font-black text-white hover:bg-brand-700"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        افزودن روش
                      </button>
                    </div>
                    <p className="mb-2 text-[10.5px] leading-5 text-ink-500">
                      این روش‌ها در تسویه حساب به مشتری نمایش داده می‌شود؛ مشتری یکی را انتخاب می‌کند و
                      هزینه همان روش به سفارش او اضافه می‌شود (آستانه ارسال رایگان روی همه روش‌ها
                      اعمال می‌شود).
                    </p>
                    {methods.length === 0 && (
                      <p className="rounded-xl bg-white p-3 text-[11px] text-ink-400">
                        هنوز روشی تعریف نشده — با «افزودن روش» اولین روش ارسال را بسازید. بدون روش،
                        هزینه پایه ارسال برای همه سفارش‌ها اعمال می‌شود.
                      </p>
                    )}
                    <div className="space-y-2">
                      {methods.map((m, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-cream-200 bg-white p-2.5"
                          aria-label={`روش ارسال ${i + 1}`}
                        >
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="min-w-32 flex-1">
                              <Label htmlFor={`m-name-${i}`} className="text-[10px] font-bold text-ink-500">
                                نام روش
                              </Label>
                              <Input
                                id={`m-name-${i}`}
                                value={m.name}
                                onChange={(e) => updateMethod(i, { name: e.target.value })}
                                placeholder="پست پیشتاز"
                                className="h-8 text-[12px]"
                              />
                            </div>
                            <div className="w-28">
                              <Label htmlFor={`m-cost-${i}`} className="text-[10px] font-bold text-ink-500">
                                هزینه (تومان)
                              </Label>
                              <Input
                                id={`m-cost-${i}`}
                                type="number"
                                min={0}
                                value={m.costToman}
                                onChange={(e) => updateMethod(i, { costToman: Number(e.target.value) })}
                                className="h-8 text-[12px]"
                              />
                            </div>
                            <div className="min-w-32 flex-1">
                              <Label htmlFor={`m-eta-${i}`} className="text-[10px] font-bold text-ink-500">
                                زمان تحویل
                              </Label>
                              <Input
                                id={`m-eta-${i}`}
                                value={m.etaDays}
                                onChange={(e) => updateMethod(i, { etaDays: e.target.value })}
                                placeholder="۲ تا ۴ روز کاری"
                                className="h-8 text-[12px]"
                              />
                            </div>
                            <div className="w-24">
                              <Label htmlFor={`m-id-${i}`} className="text-[10px] font-bold text-ink-500">
                                شناسه
                              </Label>
                              <Input
                                id={`m-id-${i}`}
                                dir="ltr"
                                value={m.id}
                                onChange={(e) => updateMethod(i, { id: e.target.value })}
                                className="h-8 text-left text-[11px]"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeMethod(i)}
                              aria-label={`حذف روش ${m.name || i + 1}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-ink-400">
                              نمایش در تسویه حساب
                            </span>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={m.enabled}
                                onCheckedChange={(v) => updateMethod(i, { enabled: v })}
                                aria-label={`فعال بودن روش ${m.name || i + 1}`}
                              />
                              <Pill tone={m.enabled ? 'green' : 'ink'}>
                                {m.enabled ? 'فعال' : 'غیرفعال'}
                              </Pill>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })}

        <p className="rounded-2xl bg-cream-100 p-3 text-[10.5px] leading-5 text-ink-500">
          نکته: تغییر «آستانه ارسال رایگان» و روش‌های ارسال بلافاصله در سبد خرید کاربران و محاسبه
          سفارش‌های جدید اعمال می‌شود — سفارش‌های ثبت‌شده با Snapshot همان لحظه ثبت می‌مانند. با
          خاموش‌کردن «فروشگاه باز است»، ثبت سفارش جدید برای همه مشتری‌ها مسدود می‌شود.
        </p>
        <p className="rounded-2xl bg-cream-100 p-3 text-[10.5px] leading-5 text-ink-500">
          نکته امنیتی: «مرچنت کد درگاه» فقط در پرداخت استفاده می‌شود و در هیچ پاسخ عمومی
          سایت (API تنظیمات عمومی) قرار نمی‌گیرد.
        </p>
      </div>

      {/* ——— نوار ذخیرهٔ چسبان پایین — همیشه دیده می‌شود ———
          بدون تغییر: خاکستری «همه تغییرات ذخیره شده»؛ با تغییر: دکمهٔ آبی فعال —
          در موبایل بعد از ویرایش بخش‌های انتهایی، دکمهٔ ذخیره همیشه در دسترس است */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-cream-200 bg-white/95 px-4 pb-safe pt-3 shadow-float backdrop-blur"
        role="toolbar"
        aria-label="ذخیره تنظیمات"
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          {dirty ? (
            <>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[13px] font-black text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="h-4 w-4" aria-hidden />
                )}
                ذخیره تغییرات
              </button>
              <button
                type="button"
                onClick={() => reload()}
                disabled={saving}
                className="flex h-11 items-center rounded-xl border border-cream-200 px-4 text-[11.5px] font-bold text-ink-500 transition-colors hover:bg-cream-100 disabled:opacity-40"
              >
                بازگردانی
              </button>
            </>
          ) : (
            <div
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-cream-100 px-4 text-[12px] font-bold text-ink-400"
              aria-live="polite"
            >
              <PackageCheck className="h-4 w-4" aria-hidden />
              همه تغییرات ذخیره شده
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————
// کارت ارسال پیامک آزمایشی ملی‌پیامک — سنجش سلامت اتصال از پنل
// (درخواست کاربر: فیلدهای کانفیگ + بررسی صحت)
// ————————————————————————————————————————————
/**
 * پیش‌نمایش زنده اسکرین اسپلش (درخواست کاربر) — همان منطق SplashScreen:
 * رنگ/لوگو/عنوان/شعار از مقادیر فعلی فرم می‌خواند و بی‌درنگ به‌روز می‌شود؛
 * متن خالی = مقدار برند (همان رفتار فروشگاه).
 */
function SplashPreviewCard({ values }: { values: Record<string, string> }) {
  const bgRaw = (values['splash.backgroundColor'] ?? '').trim();
  const bg = HEX_RE.test(bgRaw) ? bgRaw : '#06241a';
  const logoUrl = (values['splash.logoUrl'] ?? '').trim();
  const title = (values['splash.title'] ?? '').trim() || (values['brand.name'] ?? '').trim() || BRAND.name;
  const slogan = (values['splash.slogan'] ?? '').trim() || (values['brand.slogan'] ?? '').trim() || BRAND.slogan;
  const durationMs = Number(values['splash.durationMs']) || 1900;

  return (
    <div className="mt-3 rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-black text-brand-800">پیش‌نمایش زنده صفحه آغازین</p>
        <span className="rounded-lg bg-white px-2 py-0.5 text-[9.5px] font-bold text-ink-500">
          مدت: {toFaDigits(String(durationMs / 1000))} ثانیه
        </span>
      </div>
      <div
        className="mx-auto flex h-48 w-32 flex-col items-center justify-center rounded-[1.7rem] border-4 border-cream-300 shadow-inner"
        style={{ backgroundColor: bg }}
        role="img"
        aria-label="پیش‌نمایش صفحه آغازین فروشگاه"
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="پیش‌نمایش لوگو"
            className="h-11 w-11 rounded-xl object-cover shadow-md"
          />
        ) : (
          <LogoMark size={44} />
        )}
        <p className="mt-2.5 max-w-[7rem] truncate text-[13px] font-black text-cream-50">{title}</p>
        <p className="mt-0.5 max-w-[7.5rem] truncate text-[7px] text-gold-300">{slogan}</p>
        <div className="mt-3 h-0.5 w-12 overflow-hidden rounded-full bg-white/20">
          <div className="h-full w-2/3 rounded-full bg-gold-400" />
        </div>
      </div>
      <p className="mt-2 text-center text-[9.5px] leading-4 text-ink-400">
        با تغییر هر فیلد، همین‌جا بی‌درنگ دیده می‌شود — برای اعمال روی فروشگاه، «ذخیره تغییرات» را بزنید.
      </p>
    </div>
  );
}

function SmsTestCard() {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      toast.error('شماره موبایل معتبر نیست — مثال: ۰۹۱۲۳۴۵۶۷۸۹');
      return;
    }
    setBusy(true);
    try {
      await apiPost('/api/admin/sms/test', { phone: normalized });
      toast.success('پیامک آزمایشی ارسال شد — گوشی خود را بررسی کنید');
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-dashed border-brand-200 bg-white p-3">
      <p className="text-[11px] font-black text-ink-700">ارسال پیامک آزمایشی</p>
      <p className="mt-0.5 text-[10px] leading-4 text-ink-400">
        پس از ذخیرهٔ تغییرات، شماره موبایل خود را وارد و سلامت اتصال را بسنجید
      </p>
      <div className="mt-2 flex gap-2">
        <Input
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="09123456789"
          className="h-9 flex-1 text-left font-mono text-[12px]"
          aria-label="شماره موبایل برای پیامک آزمایشی"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || phone.trim().length < 10}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-[11.5px] font-black text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Send className="h-3.5 w-3.5" aria-hidden />
          )}
          ارسال
        </button>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————
// کارت نقشه فروشگاه — ثبت مختصات + پیش‌نمایش زنده OSM + موقعیت‌یابی
// (درخواست کاربر: ثبت مکان فروشگاه در داشبرد، نمایش در «درباره فروشگاه»)
// ————————————————————————————————————————————

function MapSettingsCard({
  values,
  setVal,
}: {
  values: Record<string, string>;
  setVal: (key: string, value: string) => void;
}) {
  const lat = (values['store.mapLat'] ?? '').trim();
  const lng = (values['store.mapLng'] ?? '').trim();
  const latNum = Number(lat);
  const lngNum = Number(lng);
  const valid =
    lat !== '' &&
    lng !== '' &&
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum) &&
    Math.abs(latNum) <= 90 &&
    Math.abs(lngNum) <= 180;

  /** موقعیت‌یابی دستگاه مدیر — پر کردن خودکار هر دو مختصات */
  const locateMe = () => {
    if (!('geolocation' in navigator)) {
      toast.error('مرورگر شما از موقعیت‌یابی پشتیبانی نمی‌کند — مختصات را دستی وارد کنید');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setVal('store.mapLat', pos.coords.latitude.toFixed(6));
        setVal('store.mapLng', pos.coords.longitude.toFixed(6));
        toast.success('موقعیت فعلی دستگاه ثبت شد — با «ذخیرهٔ تغییرات» همیشگی می‌شود');
      },
      () => {
        toast.error('دسترسی به موقعیت رد شد — مختصات را دستی وارد کنید');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // لینک نقشه کامل OpenStreetMap برای تنظیم دقیق‌تر (اختیاری)
  const fullMapUrl = valid
    ? `https://www.openstreetmap.org/?mlat=${latNum}&mlon=${lngNum}#map=17/${latNum}/${lngNum}`
    : null;

  return (
    <div className="rounded-2xl border border-cream-100 bg-cream-50/60 p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[12.5px] font-black text-ink-900">موقعیت روی نقشه</p>
        <button
          type="button"
          onClick={locateMe}
          className="flex h-8 items-center gap-1.5 rounded-xl bg-brand-600 px-3 text-[11px] font-black text-white transition-colors hover:bg-brand-700"
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          موقعیت فعلی من
        </button>
      </div>
      <p className="mb-2.5 text-[10.5px] leading-5 text-ink-400">
        مارکر روی نقشه را با کشیدن جابجا کنید یا مستقیم روی نقشه بزنید — مختصات خودکار پر می‌شود؛
        یا با دکمه «موقعیت فعلی من» (اجازه مرورگر) یا ورود دستی عرض/طول.
        این موقعیت در صفحه «درباره فروشگاه» به مشتری نمایش داده می‌شود.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="st-map-lat" className="text-[10px] text-ink-400">
            عرض جغرافیایی (Latitude)
          </Label>
          <Input
            id="st-map-lat"
            dir="ltr"
            inputMode="decimal"
            value={lat}
            onChange={(e) => setVal('store.mapLat', e.target.value)}
            placeholder="35.689200"
            className="mt-1 h-9 text-left font-mono text-[12px]"
          />
        </div>
        <div>
          <Label htmlFor="st-map-lng" className="text-[10px] text-ink-400">
            طول جغرافیایی (Longitude)
          </Label>
          <Input
            id="st-map-lng"
            dir="ltr"
            inputMode="decimal"
            value={lng}
            onChange={(e) => setVal('store.mapLng', e.target.value)}
            placeholder="51.389000"
            className="mt-1 h-9 text-left font-mono text-[12px]"
          />
        </div>
      </div>

      {/* نقشه تعاملی — مارکر قابل کشیدن (درخواست کاربر) */}
      <div className="mt-3">
        <MapPicker
          lat={lat}
          lng={lng}
          onChange={(la, ln) => {
            setVal('store.mapLat', la);
            setVal('store.mapLng', ln);
          }}
          ariaLabel="نقشه موقعیت فروشگاه — مارکر را جابجا کنید"
        />
        {!valid && (
          <p className="mt-2 rounded-xl border border-dashed border-cream-300 bg-white px-3 py-2 text-center text-[10.5px] text-ink-300">
            هنوز مختصات معتبری ثبت نشده — مارکر را روی نقشه بزنید یا مختصات را دستی وارد کنید
          </p>
        )}
      </div>

      {valid && fullMapUrl && (
        <a
          href={fullMapUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[10.5px] font-black text-brand-600 underline underline-offset-4"
        >
          مشاهده و تنظیم دقیق در OpenStreetMap ↗
        </a>
      )}
    </div>
  );
}
