// Optional shared store backing rate-limit.middleware.ts across
// multiple API replicas. Entirely opt-in: with REDIS_URL unset (the
// default — see .env.example), redisClient is undefined and every
// rate limiter falls back to express-rate-limit's own in-memory store,
// exactly as before this file existed. That's the right default for
// local dev and a single-instance deployment; only a horizontally
// scaled deployment (more than one API process sharing a rate-limit
// window) needs this to actually mean anything, since separate
// in-memory stores per process can't coordinate at all.
import Redis from "ioredis";

export const redisClient = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      // Bounds retries per command so a sustained Redis outage can't
      // make a rate-limit check hang indefinitely — but the *offline
      // queue* (ioredis's default: buffer commands issued before the
      // connection finishes, or during a brief reconnect, then flush
      // them once it's ready) stays on. Disabling it outright rejects
      // every command issued before the initial connection completes,
      // which is exactly what happens at startup: rate-limit.middleware
      // ts's RedisStore.init() sends its first command as soon as this
      // module loads, well before the TCP handshake above can finish.
      maxRetriesPerRequest: 1,
    })
  : undefined;

redisClient?.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});
