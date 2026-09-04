// tests/validate.middleware.test.ts
// Dedicated tests for middleware/validate.ts's formatZodError, mounted on
// a tiny throwaway Express app the same way rate-limit.middleware.test.ts
// does for its middleware.

import express from "express";
import request from "supertest";
import { z } from "zod";
import { validate } from "../src/middleware/validate";
import { errorHandler } from "../src/lib/errors";

function buildProbeApp() {
  const app = express();
  app.use(express.json());
  app.post(
    "/probe",
    validate({ body: z.object({ name: z.string().min(1) }).strict() }),
    (_req, res) => res.status(200).json({ ok: true }),
  );
  app.use(errorHandler);
  return app;
}

describe("validate middleware — formatZodError shape", () => {
  it("shapes a validation failure the same way as every other error response", async () => {
    // Regression test: this 400 used to look like
    // { error: "ValidationError", message, fieldErrors, formErrors } —
    // a bare STRING `error` field, unlike every other error response in
    // the API (`{ error: { code, message, details? } }`, an OBJECT —
    // see lib/errors.ts's errorHandler), and unlike what
    // openapi.yaml's `Error` schema has always documented for this exact
    // response. A client had to special-case this one endpoint family
    // to tell errors apart.
    const app = buildProbeApp();

    const res = await request(app).post("/probe").send({ name: "" });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("object");
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("One or more fields failed validation.");
    expect(res.body.error.details.fieldErrors).toHaveProperty("name");
    expect(res.body.error.details.formErrors).toEqual([]);
  });
});
