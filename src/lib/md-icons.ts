import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Cherry,
  Citrus,
  Clock,
  Coffee,
  Cookie,
  Drumstick,
  Flame,
  Gift,
  Grape,
  Heart,
  Info,
  Leaf,
  MapPin,
  MessageCircle,
  Nut,
  Package,
  Percent,
  Phone,
  RefreshCw,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Truck,
  Wheat,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * نقشهٔ آیکون‌های مجاز بلوک :::feature صفحه‌ساز (درخواست کاربر)
 *
 * فقط نام‌های همین whitelist قابل استفاده‌اند — رندر آیکون دلخواه کاربر با
 * دسترسی پویا به کتابخانه ریسک ندارد ولی برای باندل و امنیت محدود می‌شود.
 * نام‌ها در دکمهٔ «آیکون» ادیتور صفحات هم پیشنهاد می‌شوند.
 */
export const MD_ICONS: Record<string, LucideIcon> = {
  AlertTriangle,
  Award,
  CheckCircle2,
  Cherry,
  Citrus,
  Clock,
  Coffee,
  Cookie,
  Drumstick,
  Flame,
  Gift,
  Grape,
  Heart,
  Info,
  Leaf,
  MapPin,
  MessageCircle,
  Nut,
  Package,
  Percent,
  Phone,
  RefreshCw,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Truck,
  Wheat,
};

export const MD_ICON_NAMES = Object.keys(MD_ICONS);

/** آیکون امن — نام ناشناخته → Sparkles */
export function mdIcon(name: string): LucideIcon {
  return MD_ICONS[name] ?? Sparkles;
}
