/**
 * پارسر مارک‌داون امن برای صفحات اختصاصی فروشگاه — درخواست کاربر
 *
 * زیرمجموعهٔ پرکاربرد مارک‌داون را پشتیبانی می‌کند:
 *   - تیترها:   # , ## , ###
 *   - درشت:     **متن**     ایتالیک: *متن*     خط‌خورده: ~~متن~~
 *   - کد درون‌خطی: `کد`      بلوک کد: ``` fenced
 *   - فهرست نقطه‌ای: - مورد / * مورد / + مورد
 *   - فهرست شماره‌دار: 1. مورد / 1) مورد
 *   - نقل‌قول: > متن
 *   - لینک: [متن](آدرس)      تصویر: ![توضیح](آدرس)
 *   - جدول: | ستون | ستون |  +  خط جداکنندهٔ | --- | --- |
 *   - خط جداکنندهٔ افقی: --- / *** / ___
 *   - بلوک‌های قالب‌آماده صفحه‌ساز (درخواست کاربر) با حصار ::: ... :::
 *     :::card (کارت تصویردار) / :::feature (آیکون) / :::note (متن برجسته)
 *     :::slider (اسلایدر تصاویر) / :::gallery (گالری از کتابخانه رسانه)
 *
 * امنیت: هرگز HTML خام تولید نمی‌شود؛ خروجی، درخت بلوک/اسپن است که با
 * المان‌های React رندر می‌شود (React متن را escape می‌کند) و آدرس‌های
 * لینک/تصویر فقط http(s) و مسیرهای نسبی مجازند → امن در برابر تزریق.
 *
 * خروجی هم در نمای SPA (PageView) و هم در صفحهٔ SSR /p/[slug] استفاده
 * می‌شود تا رندر دو مسیر هم‌شکل باشد.
 */

// ———————————————————————— انواع ————————————————————————

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; c: Inline[] }
  | { t: 'italic'; c: Inline[] }
  | { t: 'strike'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'img'; src: string; alt: string };

export type MdBlock =
  | { type: 'heading'; level: 1 | 2 | 3; c: Inline[] }
  | { type: 'para'; c: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'quote'; c: Inline[] }
  | { type: 'code'; lang: string; v: string }
  | { type: 'hr' }
  | { type: 'table'; head: Inline[][]; rows: Inline[][][] }
  // ——— قالب‌های آماده صفحه‌ساز (درخواست کاربر) ———
  | { type: 'card'; image: string; imageAlt: string; title: string; text: Inline[]; link: string; linkText: string }
  | { type: 'feature'; icon: string; title: string; text: Inline[] }
  | { type: 'note'; variant: 'info' | 'success' | 'warning' | 'gold'; c: Inline[] }
  | { type: 'slider'; slides: { src: string; alt: string; caption: string }[] }
  | { type: 'gallery'; srcs: string[] }; // خالی → همهٔ تصاویر عمومی گالری

/** انواع بلوک قالب‌آماده مجاز — نوع ناشناخته نادیده گرفته می‌شود (امن) */
const TEMPLATE_TYPES = new Set(['card', 'feature', 'note', 'slider', 'gallery']);
const TEMPLATE_CLOSE_RE = /^:::\s*$/;
const KEY_VALUE_RE = /^([a-zA-Z][a-zA-Z0-9_-]{0,23})\s*:\s*(.*)$/;
const SLIDE_ITEM_RE = /^-\s+(.+)$/;

/** سقف طول هر فیلد متنی قالب — جلوگیری از سوءاستفاده در متن‌های بزرگ */
const TEMPLATE_FIELD_MAX = 600;

function clip(v: string, max = TEMPLATE_FIELD_MAX): string {
  return v.length > max ? v.slice(0, max) : v;
}

/**
 * خطوط کلید: مقدار را به شیء تبدیل می‌کند؛ خطوط بدون کلید با «_rest» جمع می‌شوند
 * (برای :::note که متن آزاد می‌پذیرد)
 */
function parseTemplateFields(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const rest: string[] = [];
  for (const line of lines) {
    const m = KEY_VALUE_RE.exec(line.trim());
    if (m && !(m[1]!.toLowerCase() in out)) {
      out[m[1]!.toLowerCase()] = clip(m[2]!.trim());
    } else {
      rest.push(line.trim());
    }
  }
  if (rest.length) out._rest = clip(rest.join(' '));
  return out;
}

/** ساخت بلوک قالب از خطوط داخلی — نوع ناشناخته/ناقص → null */
function buildTemplateBlock(kind: string, lines: string[]): MdBlock | null {
  switch (kind) {
    case 'card': {
      const f = parseTemplateFields(lines);
      const image = safeUrl(f.image ?? '');
      if (!f.title && !image && !f.text) return null;
      return {
        type: 'card',
        image: image ?? '',
        imageAlt: clip(f.alt ?? f.title ?? '', 200),
        title: clip(f.title ?? ''),
        text: parseInline(f.text ?? ''),
        link: safeUrl(f.link ?? '') ?? '',
        linkText: clip(f.linkText ?? 'مشاهده', 60),
      };
    }
    case 'feature': {
      const f = parseTemplateFields(lines);
      if (!f.title && !f.text) return null;
      return {
        type: 'feature',
        icon: clip(f.icon ?? 'Sparkles', 40),
        title: clip(f.title ?? ''),
        text: parseInline(f.text ?? ''),
      };
    }
    case 'note': {
      const f = parseTemplateFields(lines);
      const bodyText = f.text ?? f._rest ?? '';
      if (!bodyText.trim()) return null;
      const variant =
        f.variant === 'info' || f.variant === 'success' || f.variant === 'warning'
          ? f.variant
          : 'gold';
      return { type: 'note', variant, c: parseInline(bodyText) };
    }
    case 'slider': {
      const slides: { src: string; alt: string; caption: string }[] = [];
      for (const line of lines) {
        const m = SLIDE_ITEM_RE.exec(line.trim());
        if (!m) continue;
        const [rawSrc, ...restParts] = m[1]!.split('|');
        const src = safeUrl((rawSrc ?? '').trim());
        if (!src) continue;
        slides.push({
          src,
          alt: clip((restParts[0] ?? '').trim(), 200),
          caption: clip((restParts[1] ?? '').trim(), 200),
        });
        if (slides.length >= 12) break;
      }
      if (slides.length === 0) return null;
      return { type: 'slider', slides };
    }
    case 'gallery': {
      const srcs: string[] = [];
      for (const line of lines) {
        const m = SLIDE_ITEM_RE.exec(line.trim());
        if (!m) continue;
        const src = safeUrl(m[1]!.split('|')[0]!.trim());
        if (src) srcs.push(src);
        if (srcs.length >= 60) break;
      }
      // خالی → همهٔ تصاویر عمومی گالری رندر می‌شوند (MarkdownContent منتظر undefined نمی‌ماند)
      return { type: 'gallery', srcs };
    }
    default:
      return null;
  }
}

// ———————————————————————— درون‌خطی ————————————————————————

/** فقط آدرس‌های امن: http/https/mailto/tel و مسیر نسبی (شروع با /) */
const SAFE_URL_RE = /^(https?:\/\/|mailto:|tel:|\/)/i;

function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url || !SAFE_URL_RE.test(url)) return null;
  return url;
}

const ESCAPABLE = /[*_~`[\]!#>\\]/;

function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  let i = 0;

  const flush = () => {
    if (buf) {
      out.push({ t: 'text', v: buf });
      buf = '';
    }
  };

  while (i < src.length) {
    const ch = src[i]!;

    // — escape با بک‌اسلش: \* \_ \~ \[ و ...
    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.test(src[i + 1]!)) {
      buf += src[i + 1]!;
      i += 2;
      continue;
    }

    // — کد درون‌خطی `کد`
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end !== -1) {
        const inner = src.slice(i + 1, end);
        if (inner.trim()) {
          flush();
          out.push({ t: 'code', v: inner });
          i = end + 1;
          continue;
        }
      }
    }

    // — تصویر ![توضیح](آدرس)
    if (ch === '!' && src[i + 1] === '[') {
      const m = /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/.exec(src.slice(i));
      if (m) {
        flush();
        out.push({ t: 'img', src: m[2]!, alt: m[1] ?? '' });
        i += m[0].length;
        continue;
      }
    }

    // — لینک [متن](آدرس)
    if (ch === '[') {
      const m = /^\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/.exec(src.slice(i));
      if (m) {
        flush();
        const href = safeUrl(m[2]!);
        if (href) out.push({ t: 'link', href, c: parseInline(m[1]!) });
        else out.push({ t: 'text', v: m[1]! });
        i += m[0].length;
        continue;
      }
    }

    // — درشت **متن**
    if (ch === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end !== -1) {
        const inner = src.slice(i + 2, end);
        if (inner.trim()) {
          flush();
          out.push({ t: 'bold', c: parseInline(inner) });
          i = end + 2;
          continue;
        }
      }
    }

    // — ایتالیک *متن*
    if (ch === '*') {
      const end = src.indexOf('*', i + 1);
      if (end !== -1 && end > i + 1) {
        const inner = src.slice(i + 1, end);
        if (inner.trim()) {
          flush();
          out.push({ t: 'italic', c: parseInline(inner) });
          i = end + 1;
          continue;
        }
      }
    }

    // — خط‌خورده ~~متن~~
    if (ch === '~' && src[i + 1] === '~') {
      const end = src.indexOf('~~', i + 2);
      if (end !== -1) {
        const inner = src.slice(i + 2, end);
        if (inner.trim()) {
          flush();
          out.push({ t: 'strike', c: parseInline(inner) });
          i = end + 2;
          continue;
        }
      }
    }

    buf += ch;
    i++;
  }

  flush();
  return out;
}

// ———————————————————————— بلوک ————————————————————————

const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const UL_RE = /^\s*[-*+]\s+(.+)$/;
const OL_RE = /^\s*(\d{1,3})[.)]\s+(.+)$/;
const HR_RE = /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/;
const FENCE_RE = /^\s{0,3}```\s*(\S*)\s*$/;
// حصار قالب‌های آماده ::: تا با بلوک کد و سایر بلوک‌ها تداخل نکند
const TEMPLATE_OPEN_RE = /^:::\s*([a-z]+)\s*$/;

/** خط جداکنندهٔ جدول مثل | --- | --- | یا |---|:---:| */
function isTableSep(line: string): boolean {
  const t = line.trim();
  if (!t.includes('|') || !/-{2,}/.test(t)) return false;
  const cells = splitTableRow(t);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function splitTableRow(line: string): string[] {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|')) l = l.slice(0, -1);
  return l.split('|').map((c) => c.trim());
}

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let i = 0;
  const n = lines.length;

  while (i < n) {
    const line = lines[i]!;
    const t = line.trim();

    if (!t) {
      i++;
      continue;
    }

    // — بلوک قالب آماده :::type ... ::: (درخواست کاربر — صفحه‌ساز)
    const tpl = TEMPLATE_OPEN_RE.exec(t);
    if (tpl && TEMPLATE_TYPES.has(tpl[1]!)) {
      const inner: string[] = [];
      i++;
      while (i < n && !TEMPLATE_CLOSE_RE.test(lines[i]!.trim())) {
        inner.push(lines[i]!);
        i++;
      }
      i++; // پرش از ::: پایانی
      const block = buildTemplateBlock(tpl[1]!, inner);
      if (block) blocks.push(block);
      continue;
    }

    // — بلوک کد fenced
    const fence = FENCE_RE.exec(t);
    if (fence) {
      const codeLines: string[] = [];
      i++;
      while (i < n && !FENCE_RE.test(lines[i]!.trim())) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // پرش از ``` پایانی
      blocks.push({ type: 'code', lang: fence[1] ?? '', v: codeLines.join('\n') });
      continue;
    }

    // — خط جداکنندهٔ افقی
    if (HR_RE.test(t) && !UL_RE.test(t)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // — تیتر
    const h = HEADING_RE.exec(t);
    if (h) {
      blocks.push({ type: 'heading', level: h[1]!.length as 1 | 2 | 3, c: parseInline(h[2]!) });
      i++;
      continue;
    }

    // — جدول: خط فعلی با | شروع شود و خط بعد جداکننده باشد
    if (t.startsWith('|') && i + 1 < n && isTableSep(lines[i + 1]!)) {
      const head = splitTableRow(t).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < n) {
        const rt = lines[i]!.trim();
        if (!rt || !rt.includes('|') || isTableSep(rt)) break;
        rows.push(splitTableRow(rt).map(parseInline));
        i++;
      }
      blocks.push({ type: 'table', head, rows });
      continue;
    }

    // — نقل‌قول
    if (t.startsWith('>')) {
      const parts: string[] = [];
      while (i < n) {
        const qt = lines[i]!.trim();
        if (!qt.startsWith('>')) break;
        parts.push(qt.replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', c: parseInline(parts.join(' ')) });
      continue;
    }

    // — فهرست (نقطه‌ای/شماره‌دار)
    if (UL_RE.test(t) || OL_RE.test(t)) {
      const ordered = OL_RE.test(t);
      const items: Inline[][] = [];
      while (i < n) {
        const lt = lines[i]!.trim();
        const m = ordered ? OL_RE.exec(lt) : UL_RE.exec(lt);
        if (!m) break;
        items.push(parseInline((m[1] && ordered ? m[2] : m[1])!));
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // — پاراگراف: جمع‌کردن خطوط تا خط خالی یا شروع بلوک دیگر
    const paraLines: string[] = [];
    while (i < n) {
      const pt = lines[i]!.trim();
      if (!pt) break;
      if (
        paraLines.length &&
        (HEADING_RE.test(pt) ||
          FENCE_RE.test(pt) ||
          HR_RE.test(pt) ||
          UL_RE.test(pt) ||
          OL_RE.test(pt) ||
          pt.startsWith('>') ||
          pt.startsWith('|') ||
          pt.startsWith(':::'))
      ) {
        break;
      }
      paraLines.push(pt);
      i++;
    }
    if (paraLines.length) {
      blocks.push({ type: 'para', c: parseInline(paraLines.join(' ')) });
    }
  }

  return blocks;
}

// ———————————————————————— کمکی‌ها ————————————————————————

/** تبدیل مارک‌داون به متن ساده — برای پیش‌نمایش لیست پنل و description سئو */
export function mdToPlain(md: string): string {
  return md
    // بلوک‌های قالب ::: حذف کامل می‌شوند تا syntax در خلاصهٔ سئو دیده نشود
    .replace(/^:::\s*(?:card|feature|note|slider|gallery)\s*[\s\S]*?^:::\s*$/gm, ' ')
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d{1,3}[.)]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/gm, ' ')
    .replace(/[ \t]+/g, ' ');
}

/** خلاصهٔ متنی بدنه برای description متا — بدون علائم مارک‌داون */
export function pageExcerpt(md: string, max = 160): string {
  const flat = mdToPlain(md)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}
