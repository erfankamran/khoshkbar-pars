"""حذف UserDetailDialog محلی از users/page.tsx — منتقل شد به components/admin"""
import pathlib

P = pathlib.Path('/home/z/my-project/src/app/admin/users/page.tsx')
c = P.read_text(encoding='utf-8')

# انکر ASCII امن (بدون ZWNJ)
anchor = 'interface UserDetailData'
idx = c.find(anchor)
assert idx > 0, 'anchor not found'

# ابتدای بلوک کامنت خط‌چین پیش از انکر
dash = c.rfind('—', 0, idx)
line_start = c.rfind('\n', 0, c.rfind('// ', 0, idx))
# امن‌تر: برو عقب تا ابتدای خطی که با «// ————» شروع می‌شود
probe = c.rfind('// —', 0, idx)
assert probe > 0
line_start = c.rfind('\n', 0, probe) + 1

comment = (
    '// جزئیات کاربر به کامپوننت مشترک منتقل شد:\n'
    '// src/components/admin/UserDetailDialog.tsx — هم داشبورد هم این صفحه از آن استفاده می‌کنند\n'
)

c = c[:line_start].rstrip() + '\n\n' + comment
P.write_text(c, encoding='utf-8')
print('OK — new length:', len(c))
