// tests/cors.test.ts
// Unit tests for src/lib/cors.ts: the browser-origin allowlist backing
// the web dashboard (web/). Driven through the real Express app so the
// actual response headers a browser would see are exercised, not just
// the allowlist function in isolation.

import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

describe("CORS", () => {
  it("allows a listed origin and echoes it back", async () => {
    const res = await request(app).get("/healthz").set("Origin", "http://localhost:5173");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("rejects an unlisted origin with a clean 403, not a raw 500", async () => {
    const res = await request(app).get("/healthz").set("Origin", "https://evil.example.com");

    // Node itself doesn't enforce CORS — only a browser does, by
    // refusing to expose the response to script when this header is
    // absent — but this server's own `cors()` origin callback (see
    // src/lib/cors.ts) actively rejects the request server-side with a
    // ForbiddenError, so both the status and the missing header matter
    // here, not just the header.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows requests with no Origin header (non-browser clients)", async () => {
    const res = await request(app).get("/healthz");

    expect(res.status).toBe(200);
  });
});

describe("security headers (helmet)", () => {
  it("sets baseline security headers on every response", async () => {
    const res = await request(app).get("/healthz");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-dns-prefetch-control"]).toBe("off");
  });
});
