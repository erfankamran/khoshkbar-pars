/**
 * تست منطق فلگ DEV سمت سرور — handleError با/بدون NEXT_PUBLIC_DEV_MODE
 * هر بار به‌صورت پروسهٔ جدا اجرا می‌شود تا const ماژول تازه خوانده شود:
 *   EXPECT_TECH=1 bunx tsx scripts/test-dev-flag.ts   → باید technical برگرداند
 *   EXPECT_TECH=0 bunx tsx scripts/test-dev-flag.ts   → نباید technical برگرداند
 */
const expectTech = process.env.EXPECT_TECH === '1';
// قبل از import ماژول ست می‌شود (const در سطح ماژول خوانده می‌شود)
process.env.NEXT_PUBLIC_DEV_MODE = expectTech ? 'true' : 'false';

async function main() {
  const { handleError } = await import('../src/server/lib/api');
  const res = handleError(new Error('BOOM_CAUSE_TEST'));
  const body = (await res.json()) as {
    ok: boolean;
    error: { code: string; message: string; details?: { technical?: string; stack?: string } };
  };

  const hasTech = !!body.error.details?.technical && body.error.details.technical.includes('BOOM_CAUSE_TEST');
  const hasStack = !!body.error.details?.stack;

  console.log(JSON.stringify({ expectTech, hasTech, hasStack, code: body.error.code }, null, 0));

  if (expectTech) {
    if (!hasTech || !hasStack) {
      console.error('DEV_FLAG_FAIL: expected technical details');
      process.exit(1);
    }
    console.log('DEV_FLAG_ON_PASS');
  } else {
    if (hasTech || hasStack) {
      console.error('DEV_FLAG_FAIL: technical leaked in production mode');
      process.exit(1);
    }
    console.log('DEV_FLAG_OFF_PASS');
  }
}

main().catch((e) => {
  console.error('DEV_FLAG_ERROR', e);
  process.exit(1);
});
