import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type AuthRole = 'member' | 'coach' | 'admin';

export type AuthClaims = {
  memberId: string;
  role?: AuthRole;
};

declare global {
  namespace Express {
    interface Request {
      auth?: { memberId: string; role: AuthRole };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as AuthClaims;
    req.auth = { memberId: payload.memberId, role: payload.role || 'member' };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles: AuthRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
