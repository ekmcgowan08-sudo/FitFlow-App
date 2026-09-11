// tests/redis-client.test.ts
// lib/redis-client.ts reads process.env.REDIS_URL once, at module load
// time, so each branch needs its own fresh module instance
// (jest.resetModules) with the env var set beforehand — importing it
// normally only ever exercises whichever state REDIS_URL happens to be
// in when this file first loads.

describe("redis-client", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  afterEach(() => {
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
    jest.resetModules();
  });

  it("is undefined when REDIS_URL is unset — every rate limiter falls back to its in-memory store", () => {
    delete process.env.REDIS_URL;
    jest.resetModules();
    const { redisClient } = require("../src/lib/redis-client");
    expect(redisClient).toBeUndefined();
  });

  it("constructs a client when REDIS_URL is set", () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    jest.resetModules();
    const { redisClient } = require("../src/lib/redis-client");
    expect(redisClient).toBeDefined();
    // Never actually connects in this test (no real Redis needed to
    // prove the client gets constructed) — .disconnect() cancels ioredis's
    // own connection attempt so it doesn't leave an open handle behind
    // for Jest to complain about after the test finishes.
    redisClient?.disconnect();
  });
});
