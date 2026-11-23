import { Fragment } from 'react';
import { AlertTriangle, CheckCircle2, Info, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { parseMarkdown, type Inline, type MdBlock } from '@/lib/markdown';
import { MD_ICONS } from '@/lib/md-icons';
import { MdSlider } from '@/components/shared/MdSlider';
import { MdGallery } from '@/components/shared/MdGallery';

/**
 * رندرکنندهٔ مشترک مارک‌داون صفحات اختصاصی — درخواست کاربر
 *
 * - بدون dangerouslySetInnerHTML: هر بلوک با المان React رندر می‌شود
 *   (متن escape می‌شود) → امن در برابر تزریق.
 * - تیترهای «##» مثل قبل کارت می‌سازند تا ظاهر فعلی صفحات حفظ شود؛
 *   بقیهٔ بلوک‌های مارک‌داون داخل همان کارت جاری می‌آیند.
 * - variant: «spa» = نمای اپلیکیشنی (PageView) — «ssr» = صفحهٔ /p/[slug]
 */

type HeadingBlock = Extract<MdBlock, { type: 'heading' }>;

interface MarkdownContentProps {
  source: string;
  variant?: 'spa' | 'ssr';
  /** تصاویر گالری عمومی — بلوک :::gallery خالی از این لیست پر می‌شود (درخواست کاربر) */
  galleryImages?: { src: string; alt: string }[];
}

// ———————————————————————— اسپن‌های درون‌خطی ————————————————————————

function InlineSpans({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((s, i) => {
        switch (s.t) {
          case 'text':
            return <Fragment key={i}>{s.v}</Fragment>;
          case 'bold':
            return (
              <strong key={i} className="font-black text-ink-800">
                <InlineSpans c={s.c} />
              </strong>
            );
          case 'italic':
            return (
              <em key={i} className="text-ink-700">
                <InlineSpans c={s.c} />
              </em>
            );
          case 'strike':
            return (
              <del key={i} className="text-ink-300">
                <InlineSpans c={s.c} />
              </del>
            );
          case 'code':
            return (
              <code
                key={i}
                dir="ltr"
                className="mx-0.5 rounded-md bg-cream-100 px-1.5 py-0.5 font-mono text-[0.85em] text-brand-700"
              >
                {s.v}
              </code>
            );
          case 'link': {
            const external = /^https?:\/\//i.test(s.href);
            return (
              <a
                key={i}
                href={s.href}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="font-bold text-brand-700 underline decoration-brand-300 decoration-1 underline-offset-4 transition-colors hover:text-brand-800"
              >
                <InlineSpans c={s.c} />
              </a>
            );
          }
          case 'img': {
            if (!/^(https?:\/\/|\/)/.test(s.src)) return <Fragment key={i}>{s.alt}</Fragment>;
            return (
              <img
                key={i}
                src={s.src}
                alt={s.alt}
                loading="lazy"
                className="mx-1 inline-block max-h-56 rounded-xl align-middle"
              />
            );
          }
          default:
            return null;
        }
      })}
    </>
  );
}

// ———————————————————————— بلوک‌ها ————————————————————————

function BlockView({
  b,
  variant,
  galleryImages,
}: {
  b: MdBlock;
  variant: 'spa' | 'ssr';
  galleryImages: { src: string; alt: string }[];
}) {
  switch (b.type) {
    case 'heading':
      if (b.level === 1) {
        return (
          <h2 className="text-[15px] font-black leading-7 text-ink-900">
            <InlineSpans c={b.c} />
          </h2>
        );
      }
      // تیتر ۳ داخل کارت‌ها
      return (
        <h4 className="text-[12.5px] font-black text-ink-800">
          <InlineSpans c={b.c} />
        </h4>
      );

    case 'para':
      return (
        <p className={variant === 'ssr' ? 'text-[13px] leading-7 text-ink-600' : 'text-[12.5px] leading-7 text-ink-600'}>
          <InlineSpans c={b.c} />
        </p>
      );

    case 'list':
      if (b.ordered) {
        return (
          <ol className="list-decimal space-y-1.5 ps-5 marker:font-black marker:text-brand-600">
            {b.items.map((item, k) => (
              <li key={k} className={variant === 'ssr' ? 'text-[13px] leading-7 text-ink-600' : 'text-[12.5px] leading-7 text-ink-600'}>
                <InlineSpans c={item} />
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="list-disc space-y-1.5 ps-5 marker:text-gold-400">
          {b.items.map((item, k) => (
            <li key={k} className={variant === 'ssr' ? 'text-[13px] leading-7 text-ink-600' : 'text-[12.5px] leading-7 text-ink-600'}>
              <InlineSpans c={item} />
            </li>
          ))}
        </ul>
      );

    case 'quote':
      return (
        <blockquote className="rounded-e-xl border-s-[3px] border-s-gold-400 bg-cream-100/60 px-3.5 py-2.5">
          <p className={variant === 'ssr' ? 'text-[12.5px] leading-6 text-ink-500' : 'text-[12px] leading-6 text-ink-500'}>
            <InlineSpans c={b.c} />
          </p>
        </blockquote>
      );

    case 'code':
      return (
        <pre
          dir="ltr"
          className="overflow-x-auto rounded-xl bg-ink-900 px-3.5 py-3 text-left font-mono text-[11px] leading-5 text-cream-100"
        >
          <code>{b.v}</code>
        </pre>
      );

    case 'hr':
      return <hr className="border-cream-200" />;

    case 'table':
      return (
        <div className="overflow-x-auto rounded-2xl border border-cream-200">
          <table className="w-full border-collapse text-right">
            <thead>
              <tr className="bg-cream-50">
                {b.head.map((cell, k) => (
                  <th key={k} className="px-3 py-2 text-[11.5px] font-black text-ink-700">
                    <InlineSpans c={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r} className="border-t border-cream-100">
                  {row.map((cell, k) => (
                    <td key={k} className="px-3 py-2 text-[11.5px] leading-6 text-ink-600">
                      <InlineSpans c={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    // ——— قالب‌های آماده صفحه‌ساز (درخواست کاربر) ———

    case 'card': {
      const href = b.link || null;
      const body = (
        <>
          {b.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={b.image}
              alt={b.imageAlt || b.title || 'تصویر کارت'}
              loading="lazy"
              className="aspect-[16/9] w-full object-cover"
            />
          )}
          <div className="space-y-1.5 p-3.5">
            {b.title && <p className="text-[13px] font-black text-ink-900">{b.title}</p>}
            {b.text.length > 0 && (
              <p className="text-[12px] leading-6 text-ink-600">
                <InlineSpans c={b.text} />
              </p>
            )}
            {href && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-1.5 text-[11px] font-black text-white">
                {b.linkText || 'مشاهده'}
              </span>
            )}
          </div>
        </>
      );
      const shell = 'block w-full overflow-hidden rounded-2xl border border-cream-200 bg-white text-right shadow-card';
      if (href) {
        const external = /^https?:\/\//i.test(href);
        if (external) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={shell}>
              {body}
            </a>
          );
        }
        return (
          <Link href={href} className={shell}>
            {body}
          </Link>
        );
      }
      return <div className={shell}>{body}</div>;
    }

    case 'feature': {
      // lookup مستقیم از نقشهٔ ثابت — کامپوننت در رندر «ساخته» نمی‌شود (قانون static-components)
      const Icon = MD_ICONS[b.icon] ?? Sparkles;
      return (
        <div className="flex items-start gap-3 rounded-2xl border border-cream-200 bg-cream-50/60 p-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-400/15 text-brand-700">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            {b.title && <p className="text-[12.5px] font-black text-ink-900">{b.title}</p>}
            {b.text.length > 0 && (
              <p className="text-[11.5px] leading-6 text-ink-600">
                <InlineSpans c={b.text} />
              </p>
            )}
          </div>
        </div>
      );
    }

    case 'note': {
      const tones = {
        gold: { box: 'border-gold-400/50 bg-gold-100/50', text: 'text-gold-800', Icon: Sparkles },
        info: { box: 'border-cream-300 bg-cream-100/70', text: 'text-ink-700', Icon: Info },
        success: { box: 'border-brand-200 bg-brand-50/70', text: 'text-brand-800', Icon: CheckCircle2 },
        warning: { box: 'border-red-200 bg-red-50/70', text: 'text-red-700', Icon: AlertTriangle },
      } as const;
      const tone = tones[b.variant];
      const ToneIcon = tone.Icon;
      return (
        <div className={`flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 ${tone.box}`}>
          <ToneIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className={`text-[12.5px] font-bold leading-7 ${tone.text}`}>
            <InlineSpans c={b.c} />
          </p>
        </div>
      );
    }

    case 'slider':
      return <MdSlider slides={b.slides} />;

    case 'gallery': {
      const images =
        b.srcs.length > 0
          ? b.srcs.map((src) => ({ src, alt: '' }))
          : galleryImages;
      return <MdGallery images={images} />;
    }

    default:
      return null;
  }
}

// ———————————————————————— کامپوننت اصلی ————————————————————————

export function MarkdownContent({
  source,
  variant = 'spa',
  galleryImages = [],
}: MarkdownContentProps) {
  const blocks = parseMarkdown(source);

  // گروه‌بندی: «##» کارت می‌سازد و بلوک‌های بعدی تا «##» بعدی داخل آن می‌روند
  const groups: { heading: HeadingBlock | null; items: MdBlock[] }[] = [];
  for (const b of blocks) {
    if (b.type === 'heading' && b.level === 2) {
      groups.push({ heading: b, items: [] });
      continue;
    }
    const last = groups[groups.length - 1];
    if (!last) groups.push({ heading: null, items: [b] });
    else last.items.push(b);
  }

  return (
    <div className="space-y-3">
      {groups.map((g, gi) =>
        g.heading ? (
          <section
            key={gi}
            className={
              variant === 'ssr'
                ? 'space-y-2.5 rounded-2xl border border-cream-200 bg-cream-50/60 p-4'
                : 'space-y-2.5 rounded-2xl border border-cream-200 bg-white p-3.5'
            }
          >
            <h3
              className={
                variant === 'ssr'
                  ? 'flex items-center gap-1.5 text-[14px] font-black text-brand-800'
                  : 'flex items-center gap-1.5 text-[13px] font-black text-brand-800'
              }
            >
              <span className="inline-block h-3.5 w-1 rounded-full bg-gold-400" aria-hidden />
              <InlineSpans c={g.heading.c} />
            </h3>
            {g.items.map((b, bi) => (
              <BlockView key={bi} b={b} variant={variant} galleryImages={galleryImages} />
            ))}
          </section>
        ) : (
          <div key={gi} className="space-y-2.5">
            {g.items.map((b, bi) => (
              <BlockView key={bi} b={b} variant={variant} galleryImages={galleryImages} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
