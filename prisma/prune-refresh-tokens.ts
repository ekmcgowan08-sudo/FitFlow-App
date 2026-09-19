// Deletes RefreshToken rows that expired more than
// REFRESH_TOKEN_PRUNE_GRACE_DAYS ago (default 7 - see
// src/lib/token.config.ts). Nothing in the request-serving app ever
// deletes a RefreshToken row itself: rotation and logout only ever set
// `revokedAt`, so the table otherwise grows by roughly one row per
// login/refresh forever. This script is meant to be run on a schedule
// (cron, a Kubernetes CronJob, etc.), not from application code -
// `npm run prune-refresh-tokens`, or `ts-node prisma/prune-refresh-
// tokens.ts` directly. See the root README's Operations section for a
// suggested schedule.
import { PrismaClient } from '@prisma/client';
import { REFRESH_TOKEN_PRUNE_GRACE_DAYS } from '../src/lib/token.config';

const prisma = new PrismaClient();

async function main() {
  const cutoff = new Date(Date.now() - REFRESH_TOKEN_PRUNE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  console.log(`Pruned ${count} refresh token row(s) expired before ${cutoff.toISOString()}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
