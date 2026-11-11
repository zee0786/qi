import { HttpError } from './errors.js';

export const ROLES = {
  QUALITY_ENGINEER: 'quality_engineer',
  PRODUCTION_SUPERVISOR: 'production_supervisor',
};

/** Lightweight identity: the X-User-Id header must name a seeded user. No passwords by design. */
export function authenticate(repo) {
  return async (req, _res, next) => {
    const id = Number.parseInt(req.get('x-user-id') ?? '', 10);
    const user = Number.isInteger(id) ? await repo.getUser(id) : null;
    if (!user) throw new HttpError(401, 'Select a user (X-User-Id header) to continue');
    req.user = user;
    next();
  };
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new HttpError(403, 'Your role is not allowed to perform this action');
    }
    next();
  };
}
