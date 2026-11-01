import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { AppError, forbidden } from '../../lib/errors.js';

export type Role = 'auctioneer' | 'bidder';
export interface AuthUser {
  id: string;
  name: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const signToken = (user: AuthUser) =>
  jwt.sign({ name: user.name, role: user.role }, config.jwtSecret, { subject: user.id, expiresIn: '7d' });

export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    return { id: payload.sub!, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

/** Popula req.user quando há um Bearer token válido; nunca bloqueia (rotas públicas). */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) req.user = verifyToken(header.slice(7)) ?? undefined;
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
  next();
}

export const requireRole = (role: Role) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
  if (req.user.role !== role) {
    throw forbidden(
      role === 'auctioneer' ? 'Apenas leiloeiros podem fazer isso.' : 'Apenas licitantes podem fazer isso.',
    );
  }
  next();
};
