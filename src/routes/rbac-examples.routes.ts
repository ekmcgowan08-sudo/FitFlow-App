// Worked examples of applying the RBAC module to real FitFlow Suite
// endpoints, using the HOF style (recommended default) and the decorator
// style side by side. Kept as reference/demo routes, mounted under /v1.

import { Router } from 'express';
import {
  requireRole,
  requireAllRoles,
  requireSelfOrRole,
  requireCoachOfClient,
} from '../rbac/rbac.middleware';
import { withRoleGuard, Roles } from '../rbac/rbac.decorator';

const router = Router();

// `authenticate` runs once, centrally, in app.ts's protected sub-router
// before any request reaches here — RBAC guards assume a verified,
// database-confirmed req.user is already present.

// --- HOF style (default recommendation for Express route files) ---------

// Admin-only: manage the global exercise catalog.
router.post('/admin/exercises', requireRole('ADMIN'), (_req, res) => {
  res.status(201).json({ message: 'exercise created' });
});

// Coach or admin: author a training plan.
router.post('/coach/training-plans', requireRole('COACH', 'ADMIN'), (_req, res) => {
  res.status(201).json({ message: 'training plan created' });
});

// Coach or admin AND must be the assigned coach for this specific client.
router.post(
  '/coach/clients/:clientId/notes',
  requireRole('COACH', 'ADMIN'),
  requireCoachOfClient('clientId'),
  (_req, res) => {
    res.status(201).json({ message: 'note created' });
  },
);

// A premium feature that requires being both a coach and a subscriber.
router.get('/coach/analytics/advanced', requireAllRoles('COACH', 'SUBSCRIBER'), (_req, res) => {
  res.status(200).json({ message: 'advanced analytics' });
});

// Users manage their own profile; admins may manage anyone's.
router.get('/users/:userId/profile', requireSelfOrRole('userId', 'ADMIN'), (_req, res) => {
  res.status(200).json({ message: 'profile' });
});

// --- Decorator style (for class-based controllers) -----------------------

class GymPartnerController {
  @Roles('GYM_PARTNER', 'ADMIN')
  async verifyCheckin(_req: import('express').Request, res: import('express').Response) {
    res.status(200).json({ message: 'check-in verified' });
  }
}

const gymPartnerController = new GymPartnerController();

router.post(
  '/gyms/:gymId/checkins/:checkinId/verify',
  withRoleGuard(gymPartnerController, 'verifyCheckin'),
);

export default router;
