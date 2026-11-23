/**
 * بررسی وضعیت فعلی دسته‌بندی‌ها، هدایای سازمانی و آجیل ترکیبی
 */
import { Database } from 'bun:sqlite';

const db = new Database('db/custom.db', { readonly: true });

console.log('=== دسته‌بندی‌ها ===');
const cats = db
  .query(
    `SELECT id, slug, title, isActive, sortOrder FROM Category ORDER BY sortOrder`
  )
  .all();
for (const c of cats) {
  console.log(
    `  ${c.slug} | ${c.title} | active=${c.isActive} | sort=${c.sortOrder} | id=${c.id}`
  );
}

console.log('\n=== محصولات دسته corporate-gifts ===');
const gifts = db
  .query(
    `SELECT p.slug, p.title, p.isActive FROM Product p JOIN Category c ON p.categoryId=c.id WHERE c.slug='corporate-gifts'`
  )
  .all();
if (gifts.length === 0) console.log('  (خالی — محصولی ندارد)');
for (const g of gifts) console.log(`  ${g.slug} | ${g.title} | active=${g.isActive}`);

console.log('\n=== محصولات آجیل ترکیبی ===');
const mixed = db
  .query(
    `SELECT slug, title, isActive FROM Product WHERE title LIKE '%ترکیبی%' OR slug LIKE '%mixed%'`
  )
  .all();
if (mixed.length === 0) console.log('  (چیزی یافت نشد)');
for (const m of mixed) console.log(`  ${m.slug} | ${m.title} | active=${m.isActive}`);

console.log('\n=== نمونه واریانت‌های ۱۰۰۰ گرمی موجود ===');
const v1000 = db
  .query(
    `SELECT p.slug, p.title, v.weightGrams, v.priceToman, v.stock FROM ProductVariant v JOIN Product p ON v.productId=p.id WHERE v.weightGrams=1000 LIMIT 10`
  )
  .all();
if (v1000.length === 0) console.log('  (هیچ واریانت ۱۰۰۰ گرمی وجود ندارد)');
for (const v of v1000)
  console.log(`  ${v.slug} | ${v.title} | ${v.weightGrams}g | ${v.priceToman} تومان | stock=${v.stock}`);

console.log('\n=== نمونه ساختار attributes یک محصول ===');
const sample = db
  .query(`SELECT slug, attributes, shortDescription, description FROM Product LIMIT 2`)
  .all();
for (const s of sample) {
  console.log(`  ${s.slug}:`);
  console.log(`    attributes: ${s.attributes?.slice(0, 200) ?? 'null'}`);
  console.log(`    shortDescription: ${s.shortDescription?.slice(0, 120) ?? 'null'}`);
}

console.log('\n=== نمونه تصاویر محصولات (الگوی URL) ===');
const imgs = db
  .query(`SELECT pi.url, pi.alt FROM ProductImage pi LIMIT 8`)
  .all();
for (const i of imgs) console.log(`  ${i.url} | alt=${i.alt ?? '—'}`);

db.close();
