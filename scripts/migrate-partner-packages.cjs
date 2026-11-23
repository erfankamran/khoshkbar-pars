/* eslint-disable @typescript-eslint/no-require-imports */
// Node.js 24+; run against an explicitly named SQLite database. No rows are replaced.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');

async function migrate(databasePath, backupPath) {
  if (!fs.existsSync(databasePath)) throw Error('Database does not exist: ' + databasePath);
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON;');
  if (backupPath) { fs.mkdirSync(path.dirname(backupPath), { recursive: true }); await backup(database, backupPath); }
  const counts = () => Object.fromEntries(['User', 'Order', 'OrderItem', 'ProductVariant'].map(table => [table, database.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n]));
  const before = counts();
  const existingForeignKeys = new Set(database.prepare('PRAGMA foreign_key_check').all().map(row => JSON.stringify(row)));
  try {
    database.exec('BEGIN IMMEDIATE');
    for (const table of ['ProductVariant', 'OrderItem']) {
      if (!database.prepare(`PRAGMA table_info("${table}")`).all().some(column => column.name === 'isWholesale')) {
        database.exec(`ALTER TABLE "${table}" ADD COLUMN "isWholesale" BOOLEAN NOT NULL DEFAULT false;`);
      }
    }
    if (!database.prepare('PRAGMA table_info("ProductVariant")').all().some(column => column.name === 'pricePerKgToman')) database.exec('ALTER TABLE "ProductVariant" ADD COLUMN "pricePerKgToman" INTEGER;');
    if (!database.prepare('PRAGMA table_info("OrderItem")').all().some(column => column.name === 'pricePerKgToman')) database.exec('ALTER TABLE "OrderItem" ADD COLUMN "pricePerKgToman" INTEGER;');
    if (!database.prepare('PRAGMA table_info("CartItem")').all().some(column => column.name === 'requestedWeightGrams')) database.exec('ALTER TABLE "CartItem" ADD COLUMN "requestedWeightGrams" INTEGER;');
    if (!database.prepare('PRAGMA table_info("Order")').all().some(column => column.name === 'discountCode')) database.exec('ALTER TABLE "Order" ADD COLUMN "discountCode" TEXT;');
    database.exec(`
      CREATE TABLE IF NOT EXISTS "PartnerRequest" (
        "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
        "businessName" TEXT NOT NULL, "message" TEXT, "reviewNote" TEXT, "reviewedById" TEXT, "reviewedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
        FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "PartnerRequest_userId_key" ON "PartnerRequest"("userId");
      CREATE INDEX IF NOT EXISTS "PartnerRequest_status_updatedAt_idx" ON "PartnerRequest"("status", "updatedAt");
      DROP INDEX IF EXISTS "ProductVariant_productId_weightGrams_key";
      CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_productId_weightGrams_isWholesale_key" ON "ProductVariant"("productId", "weightGrams", "isWholesale");
    `);
    if (database.prepare('PRAGMA foreign_key_check').all().some(row => !existingForeignKeys.has(JSON.stringify(row)))) throw Error('New foreign-key violation');
    if (JSON.stringify(before) !== JSON.stringify(counts())) throw Error('Existing row count changed');
    database.exec('COMMIT');
    return { preserved: before, preexistingForeignKeyViolations: existingForeignKeys.size };
  } catch (error) { database.exec('ROLLBACK'); throw error; }
  finally { database.close(); }
}
module.exports = { migrate };
if (require.main === module) {
  if (!process.argv[2]) { console.error('Usage: node scripts/migrate-partner-packages.cjs <database> [backup]'); process.exit(1); }
  migrate(path.resolve(process.argv[2]), process.argv[3] ? path.resolve(process.argv[3]) : undefined)
    .then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
