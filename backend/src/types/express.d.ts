import type { AuthUser } from '../modules/auth/auth.js';

// Usuário autenticado, preenchido por optionalAuth/requireAuth.
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
