#!/usr/bin/env python3
"""
Generate src/components/admin/iran-provinces.ts from the downloaded iran-raw.svg.
- Extracts the 31 province <path id="..."> d-strings (excludes caspian-sea / persian-gulf)
- Rounds all coordinates to 1 decimal to shrink the payload
- Maps English ids to Persian province names
"""
import json
import re

SRC = '/home/z/my-project/scripts/iran-raw.svg'
OUT = '/home/z/my-project/src/components/admin/iran-provinces.ts'

FA_NAMES = {
    'alborz': 'البرز',
    'ardabil': 'اردبیل',
    'azerbaijan-east': 'آذربایجان شرقی',
    'azerbaijan-west': 'آذربایجان غربی',
    'bushehr': 'بوشهر',
    'chaharmahal-bakhriari': 'چهارمحال و بختیاری',
    'fars': 'فارس',
    'gilan': 'گیلان',
    'golestan': 'گلستان',
    'hamadan': 'همدان',
    'hormozgan': 'هرمزگان',
    'ilam': 'ایلام',
    'isfahan': 'اصفهان',
    'kerman': 'کرمان',
    'kermanshah': 'کرمانشاه',
    'khorasan-north': 'خراسان شمالی',
    'khorasan-razavi': 'خراسان رضوی',
    'khorasan-south': 'خراسان جنوبی',
    'khuzestan': 'خوزستان',
    'kohgiluye-boyerahmad': 'کهگیلویه و بویراحمد',
    'kurdistan': 'کردستان',
    'lorestan': 'لرستان',
    'markazi': 'مرکزی',
    'mazandaran': 'مازندران',
    'qazvin': 'قزوین',
    'qom': 'قم',
    'semnan': 'سمنان',
    'sistan-baluchestan': 'سیستان و بلوچستان',
    'tehran': 'تهران',
    'yazd': 'یزد',
    'zanjan': 'زنجان',
}

svg = open(SRC, encoding='utf-8').read()

# Each path element (multiline) — capture id + d
paths = re.findall(r'<path\s+id="([^"]+)"[^>]*?d="([^"]+)"', svg, re.S)
found = {pid for pid, _ in paths}
missing = set(FA_NAMES) - found
if missing:
    raise SystemExit(f'MISSING PROVINCES IN SVG: {missing}')


def round_d(d: str) -> str:
    """Round every number in the path data to 1 decimal, collapse whitespace."""
    d = re.sub(r'\s+', ' ', d).strip()

    def repl(m):
        v = float(m.group(0))
        if v == int(v):
            return str(int(v))
        return f'{v:.1f}'.rstrip('0').rstrip('.')

    return re.sub(r'-?\d+\.\d+', repl, d)


entries = []
for pid, d in paths:
    if pid not in FA_NAMES:
        continue  # caspian-sea, persian-gulf_3_
    entries.append((pid, FA_NAMES[pid], round_d(d)))

header = '''/**
 * مسیرهای ۳۱ استان ایران به‌صورت داده‌ی استاتیک — تولیدشده از نقشهٔ SVG آزاد
 * (nastoohir/iran-map-svg) با اسکریپت scripts/gen-iran-map.py — دستی ویرایش نکنید.
 * viewBox نقشه: «0 0 1200 1070.6»
 */
'''

lines = [header, 'export interface IranProvincePath {', '  id: string;', '  fa: string;', '  d: string;', '}', '', 'export const IRAN_VIEWBOX = \'0 0 1200 1070.6\';', '', 'export const IRAN_PROVINCES: IranProvincePath[] = [']
for pid, fa, d in entries:
    lines.append(f'  {{ id: \'{pid}\', fa: \'{fa}\', d: \'{d}\' }},')
lines.append('];')
lines.append('')

# ——— مسیرهای تزئینی دریاها (بدون تعامل) ———
seas = {pid: round_d(d) for pid, d in paths if pid not in FA_NAMES}
lines += [
    '/** پیکره‌های دریای خزر و خلیج فارس — تزئینی، بدون تعامل */',
    'export const IRAN_SEAS: IranProvincePath[] = [',
    f"  {{ id: 'caspian-sea', fa: 'دریای خزر', d: '{seas.get('caspian-sea', '')}' }},",
    f"  {{ id: 'persian-gulf', fa: 'خلیج فارس', d: '{seas.get('persian-gulf_3_', '')}' }},",
    '];',
]
lines.append('')

out = '\n'.join(lines)
open(OUT, 'w', encoding='utf-8').write(out)
print(f'provinces: {len(entries)}')
print(f'file size: {len(out) / 1024:.1f} KB')
