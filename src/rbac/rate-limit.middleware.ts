// Rate limiting for the authentication endpoints most attractive to
// credential stuffing and refresh-token replay: login and refresh.

import rateLimit, { Options, ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { Request, Response, NextFunction } from "express";
import { TooManyRequestsError } from "../lib/errors";
import { redisClient } from "../lib/redis-client";

// Shared handler: every limiter forwards to the central error handler
// instead of writing its own response, so 429s have the same JSON shape
// as every other error in the API (see lib/errors.ts).
function forwardAsAppError(retryAfterSeconds: number, message: string) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    next(new TooManyRequestsError(message, retryAfterSeconds));
  };
}

// With REDIS_URL unset, buildStore() returns undefined and each limiter
// falls back to express-rate-limit's own in-memory Store, exactly as
// before this option existed. That default only breaks down once more
// than one API process needs to share a window (see lib/redis-client.ts),
// so it's the right choice until a deployment actually scales
// horizontally.
//
// A fresh RedisStore instance per limiter, not one shared instance,
// because express-rate-limit forbids reusing a single Store across
// multiple limiters (ERR_ERL_STORE_REUSE) — each instance tracks its
// own hit-count cache internally, so sharing one would corrupt all of
// them. `prefix` keeps each limiter's keys visibly separated in Redis
// on top of that (e.g. `redis-cli KEYS 'rl:login:*'`).
function buildStore(prefix: string) {
  const client = redisClient;
  if (!client) return undefined;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args: string[]) => client.call(...(args as [string, ...string[]])) as Promise<never>,
  });
}

const baseOptions: Partial<Options> = {
  standardHeaders: true, // sends RateLimit-* headers
  legacyHeaders: false,
};

/**
 * loginRateLimiter — keyed by IP + the email in the request body, so one
 * attacker can't lock out a victim's account by hammering it from many
 * IPs, and one IP can't be used to spray-guess many different accounts
 * without also tripping the per-IP window.
 *
 * 10 attempts per 15 minutes per (ip, email) pair.
 */
export const loginRateLimiter = rateLimit({
  ...baseOptions,
  store: buildStore("login"),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req: Request) => {
    const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
    // ipKeyGenerator normalizes IPv6 addresses (collapsing to a /64 subnet)
    // so an attacker can't dodge the limit by cycling through addresses
    // within their own /64 allocation.
    return `login:${ipKeyGenerator(req.ip ?? "")}:${email}`;
  },
  handler: forwardAsAppError(15 * 60, "Too many login attempts. Please try again in 15 minutes."),
});

/**
 * refreshRateLimiter — keyed by IP only (a refresh token, not an email, is
 * the credential here, and it's already opaque/high-entropy). A tighter
 * per-IP window blunts automated replay of a stolen refresh token.
 *
 * 30 attempts per 15 minutes per IP.
 */
export const refreshRateLimiter = rateLimit({
  ...baseOptions,
  store: buildStore("refresh"),
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: (req: Request) => `refresh:${ipKeyGenerator(req.ip ?? "")}`,
  handler: forwardAsAppError(15 * 60, "Too many token refresh attempts. Please try again in 15 minutes."),
});

/**
 * registerRateLimiter — cheaper safeguard against automated bulk account
 * creation. 5 attempts per hour per IP.
 */
export const registerRateLimiter = rateLimit({
  ...baseOptions,
  store: buildStore("register"),
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req: Request) => `register:${ipKeyGenerator(req.ip ?? "")}`,
  handler: forwardAsAppError(60 * 60, "Too many registration attempts. Please try again later."),
});
