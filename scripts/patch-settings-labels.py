# یک‌بار مصرف — افزودن برچسب‌های اسکرین اسپلش به LABELS صفحه تنظیمات
# (متن فارسی دارای ZWNJ است؛ جایگذاری با شماره خط مطمئن‌تر است)
from pathlib import Path

PAGE = Path('/home/z/my-project/src/app/admin/settings/page.tsx')
text = PAGE.read_text(encoding='utf-8')

if "'splash.durationMs': 'مدت نمایش صفحه آغازین (میلی‌ثانیه)'" in text:
    print('already patched')
else:
    anchor = "  'sms.melipayamak.sender':"
    idx = text.find(anchor)
    assert idx != -1, 'sender label not found'
    end = text.find('};', idx)
    assert end != -1
    block = """  // اسکرین اسپلش (صفحه آغازین) — درخواست کاربر
  'splash.enabled': 'نمایش صفحه آغازین (اسپلش)',
  'splash.logoUrl': 'لوگوی صفحه آغازین',
  'splash.backgroundColor': 'رنگ پس‌زمینه صفحه آغازین',
  'splash.title': 'عنوان روی صفحه آغازین',
  'splash.slogan': 'شعار روی صفحه آغازین',
  'splash.durationMs': 'مدت نمایش صفحه آغازین (میلی‌ثانیه)',
"""
    text = text[:end] + block + text[end:]
    PAGE.write_text(text, encoding='utf-8')
    print('labels inserted')
