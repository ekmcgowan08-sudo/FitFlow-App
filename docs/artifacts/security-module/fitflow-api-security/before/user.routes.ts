// before/user.routes.ts
// Original route handlers found in the FitFlow Suite API.
// Flagged in the audit under "Prisma query scoping" and
// "HTTP status code consistency".

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "./auth.middleware";

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

// GET /v1/workout-sessions/:id
router.get("/workout-sessions/:id", async (req: Request, res: Response) => {
  // VULNERABLE (Prisma query scoping — BOLA/IDOR, OWASP API1:2023):
  // the query is scoped only by the session id from the URL, never by the
  // authenticated user. Any logged-in user can read any other user's
  // workout session — including trainees who never consented to sharing
  // data with each other — by guessing or enumerating UUIDs.
  const session = await prisma.workoutSession.findUnique({
    where: { id: req.params.id as string },
  });

  if (!session) {
    // VULNERABLE (status code consistency): 200 with a null body instead
    // of 404, so clients cannot distinguish "empty" from "not found"
    // without inspecting the payload.
    return res.status(200).json(null);
  }

  return res.status(200).json(session);
});

// GET /v1/workout-sessions
router.get("/workout-sessions", async (req: Request, res: Response) => {
  // VULNERABLE (Prisma query scoping): no `where` clause at all. This
  // returns every workout session for every user in the system to
  // whichever caller happens to hit this endpoint.
  const sessions = await prisma.workoutSession.findMany();
  return res.json(sessions);
});

// PATCH /v1/workout-sessions/:id
router.patch("/workout-sessions/:id", async (req: Request, res: Response) => {
  // VULNERABLE (Prisma query scoping — mass assignment + IDOR):
  // `userId` is taken from the request body instead of `req.user.id`, and
  // the update targets the record by id alone. A malicious client can
  // reassign someone else's session to their own account, or edit another
  // user's in-progress session outright.
  const { userId, status } = req.body;

  const updated = await prisma.workoutSession.update({
    where: { id: req.params.id as string },
    data: { userId, status },
  });

  return res.json(updated);
});

// DELETE /v1/admin/users/:id  (intended to be admin-only)
router.delete("/admin/users/:id", async (req: Request, res: Response) => {
  // VULNERABLE: this route has no role check at all — `authenticate`
  // only confirms *some* valid session exists, not that the caller is an
  // admin. Any authenticated trainee can delete any other account.
  await prisma.user.delete({ where: { id: req.params.id as string } });

  // VULNERABLE (status code consistency): 200 with no body on a
  // successful delete, where the rest of the API uses 204 for
  // no-content responses elsewhere — inconsistent contracts make client
  // error handling unreliable.
  return res.status(200).send();
});

export default router;
