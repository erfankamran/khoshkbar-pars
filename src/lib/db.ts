import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // لاگ کوئری فقط در توسعه یا با PRISMA_LOG_QUERIES=1 (روش اندازه‌گیری
    // scripts/measure-queries.sh). در تولید خاموش تا stdout تحت فشار نماند.
    log:
      process.env.NODE_ENV === 'production' && process.env.PRISMA_LOG_QUERIES !== '1'
        ? []
        : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
