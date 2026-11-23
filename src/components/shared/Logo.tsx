import { cn } from '@/lib/utils';

/**
 * نشان برند پارس — پسته‌ای طلایی روی سبز تیره
 * به‌صورت SVG درون‌خطی برای وضوح در تمام اندازه‌ها و پشتیبانی از تم.
 */
export function LogoMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="نشان پارس"
    >
      <rect width="64" height="64" rx="17" fill="#0d3a27" />
      <circle
        cx="32"
        cy="32"
        r="23"
        fill="none"
        stroke="#c89b34"
        strokeWidth="2"
        opacity="0.9"
      />
      {/* پوسته کرم پسته */}
      <path
        d="M32 13c7.5 5.6 11 13.6 9.6 22.4C40.6 42 36.8 47.6 32 50.6 27.2 47.6 23.4 42 22.4 35.4 21 26.6 24.5 18.6 32 13Z"
        fill="#f6f1e5"
      />
      {/* مغز سبز */}
      <path
        d="M32 19.5c4.6 3.8 6.8 9.1 6 15-.7 5.3-3 9.5-6 11.8-3-2.3-5.3-6.5-6-11.8-.8-5.9 1.4-11.2 6-15Z"
        fill="#1f8f5a"
      />
      {/* شیار میانی */}
      <path
        d="M32 19.5v27"
        stroke="#0d3a27"
        strokeWidth="1.6"
        opacity="0.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** نشان + نام برند برای هدر و Splash */
export function LogoLockup({
  size = 38,
  light = true,
  className,
}: {
  size?: number;
  light?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      <div className="flex flex-col leading-tight">
        <span
          className={cn(
            'text-lg font-black tracking-tight',
            light ? 'text-cream-50' : 'text-brand-900'
          )}
        >
          پارس
        </span>
        <span
          className={cn(
            'text-[10px]',
            light ? 'text-brand-200' : 'text-ink-500'
          )}
        >
          خشکبار و مغزهای تازه
        </span>
      </div>
    </div>
  );
}
