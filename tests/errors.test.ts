// tests/errors.test.ts
// Covers src/lib/errors.ts's errorHandler directly against the real app
// (src/app.ts), not a hand-rolled Express instance - the malformed-JSON
// path in particular depends on exactly how express.json() is wired up
// in app.ts, so a minimal reproduction risks testing a different
// middleware order than production actually runs.
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

describe("errorHandler", () => {
  it("returns 400 VALIDATION_ERROR for a malformed JSON body, not a 500", async () => {
    const res = await request(app)
      .post("/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{not valid json");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("still processes a well-formed JSON body normally", async () => {
    const res = await request(app)
      .post("/v1/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: "nobody@example.com", password: "wrong-password" });

    // Reaches real route logic (a DB lookup that finds no such user) and
    // returns the route's own 401 - not the malformed-JSON 400 path,
    // and not a raw 500 from the JSON parser.
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
