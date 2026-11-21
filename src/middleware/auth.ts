import type { NextFunction, Request, Response } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import type { UserRole } from '../types/index.ts';
import {
  parseCookieHeader,
  verifySessionToken,
  type PublicUser,
} from '../server/auth.ts';
import { SERVER_TEAM_USERS } from '../server/teamUsers.ts';

export const SESSION_COOKIE_NAME = 'runbd_session';

export interface AuthRequest extends Request {
  authUser?: PublicUser;
}

function isMutatingMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

function passesOriginOrHeaderCheck(req: Request): boolean {
  if (!isMutatingMethod(req.method)) return true;
  if (req.headers['x-requested-with'] === 'RunBD-Client') return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    return Boolean(hostHeader) && originHost === hostHeader;
  } catch {
    return false;
  }
}

function resolveUserFromFirebaseEmail(uid: string, email: string, name?: string): PublicUser {
  const matched = SERVER_TEAM_USERS.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (matched) {
    return {
      id: matched.id,
      name: matched.name,
      email: matched.email,
      role: matched.role,
      title: matched.title,
      avatarInitials: matched.avatarInitials,
    };
  }
  const fallbackName = name?.trim() || email.split('@')[0] || 'Team Member';
  return {
    id: uid,
    name: fallbackName,
    email,
    role: 'collector' as UserRole,
    title: 'Data Collector',
    avatarInitials: fallbackName.slice(0, 2).toUpperCase(),
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    const session = verifySessionToken(token);
    if (session) {
      req.authUser = {
        id: session.uid,
        name: session.name,
        email: session.email,
        role: session.role,
        title: session.title,
        avatarInitials: session.avatarInitials,
      };
      next();
      return;
    }

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      req.authUser = resolveUserFromFirebaseEmail(
        decoded.uid,
        decoded.email ?? `${decoded.uid}@firebase`,
        typeof decoded.name === 'string' ? decoded.name : undefined
      );
      next();
      return;
    } catch {
      res.status(401).json({ error: 'Unauthorized: Invalid bearer token.' });
      return;
    }
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken) {
    if (!passesOriginOrHeaderCheck(req)) {
      res.status(403).json({ error: 'Forbidden: Cross-origin cookie mutation rejected.' });
      return;
    }
    const session = verifySessionToken(cookieToken);
    if (session) {
      req.authUser = {
        id: session.uid,
        name: session.name,
        email: session.email,
        role: session.role,
        title: session.title,
        avatarInitials: session.avatarInitials,
      };
      next();
      return;
    }
  }

  res.status(401).json({ error: 'Unauthorized: Please sign in to access RunBD data.' });
};
