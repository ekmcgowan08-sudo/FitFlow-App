// Process entrypoint: boots the Express app from app.ts and listens on
// PORT (default 3000). Used by `npm start` and the Docker image.

import 'reflect-metadata'; // required by rbac/rbac.decorator.ts's @Roles decorator
import { createApp } from './app';
import { prisma } from './lib/prisma-client';

const PORT = Number(process.env.PORT ?? 3000);

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`FitFlow Suite API listening on port ${PORT}`);
});

// Without this, a container orchestrator's SIGTERM (a redeploy, a scale-
// down, `docker stop`) gets no response and falls through to SIGKILL
// after its grace period — cutting off in-flight requests mid-response
// and leaving Prisma's connection pool torn down uncleanly rather than
// closed. `server.close()` stops accepting new connections but lets
// already-accepted ones finish before its callback fires, so Prisma
// only disconnects once nothing is using it.
let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully...`);

  server.close(async (err) => {
    if (err) {
      console.error('Error while closing HTTP server:', err);
    }
    await prisma.$disconnect();
    process.exit(err ? 1 : 0);
  });

  // Belt-and-suspenders: if some connection never finishes (a stuck
  // request, a keep-alive socket Express's close() alone won't force
  // shut), don't let the process hang forever past the orchestrator's
  // own grace period — exit anyway once ours runs out.
  setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
