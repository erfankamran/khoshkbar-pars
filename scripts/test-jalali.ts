/**
 * تست رفت‌وبرگشت تقویم جلالی — g→j→g باید دقیقاً برابر ورودی باشد
 */
import { gregorianToJalali, jalaliToGregorian, startOfJalaliMonth, todayJalali, formatJalaliDayShort } from '../src/lib/jalali';

let fails = 0;
let checked = 0;
// پیمایش روزانه از ۲۰۲۴-۰۱-۰۱ تا ۲۰۲۸-۱۲-۳۱
const start = Date.UTC(2024, 0, 1);
const end = Date.UTC(2028, 11, 31);
for (let t = start; t <= end; t += 24 * 3600 * 1000) {
  const d = new Date(t);
  const gy = d.getUTCFullYear();
  const gm = d.getUTCMonth() + 1;
  const gd = d.getUTCDate();
  const j = gregorianToJalali(gy, gm, gd);
  const back = jalaliToGregorian(j.jy, j.jm, j.jd);
  checked++;
  if (back.gy !== gy || back.gm !== gm || back.gd !== gd) {
    fails++;
    if (fails <= 5) console.error('MISMATCH', `${gy}-${gm}-${gd}`, '→', j, '→', back);
  }
}
console.log(`checked=${checked} fails=${fails}`);
console.log('today jalali:', todayJalali());
console.log('start of jalali month (UTC):', startOfJalaliMonth().toISOString());
console.log('day short:', formatJalaliDayShort(new Date()));

if (fails > 0) process.exit(1);
