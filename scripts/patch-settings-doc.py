# یک‌بار مصرف — به‌روزرسانی کامنت بالای صفحه تنظیمات (پنج بخش → شش بخش)
from pathlib import Path

PAGE = Path('/home/z/my-project/src/app/admin/settings/page.tsx')
text = PAGE.read_text(encoding='utf-8')

old = 'تنظیمات فروشگاه (فاز ۱۴ و ۱۵ + فاز ۲) — پنج بخش:'
new = 'تنظیمات فروشگاه (فاز ۱۴ و ۱۵ + فاز ۲ + اسپلش) — شش بخش:'
if old in text:
    text = text.replace(old, new, 1)
    # افزودن یک خط توضیح اسپلش به فهرست بخش‌ها
    anchor = ' *  ۴) درگاه پرداخت: فعال/غیرفعال کردن پرداخت آنلاین و در محل، انتخاب درگاه و مرچنت کد\n'
    if anchor in text and 'اسکرین اسپلش (صفحه آغازین):' not in text:
        text = text.replace(
            anchor,
            anchor + ' *  ۵) اسکرین اسپلش: فعال/غیرفعال، لوگو، رنگ پس‌زمینه، متن و مدت نمایش صفحه آغازین (با پیش‌نمایش زنده)\n',
            1,
        )
    PAGE.write_text(text, encoding='utf-8')
    print('doc comment updated')
else:
    print('anchor not found — skip')
