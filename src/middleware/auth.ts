import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import {
  getOrCreateUser,
  getUserByUid,
  type DbUserRow,
} from '../db/users.ts';
import { computeUserSubscriptionInfoDb } from '../db/repository.ts';

const TOKEN_SECRET =
  process.env.SESSION_SECRET || 'amzhub-br-local-workspace-secret-2026';

export interface AuthRequest extends Request {
  authUser?: DbUserRow;
}

export function signSessionToken(userUid: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userUid, iat: Date.now() }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('base64url');
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof parsed.uid === 'string' ? parsed.uid : null;
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return undefined;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res
      .status(401)
      .json({ error: 'Sessão expirada ou não autenticada.' });
  }

  try {
    // 1. Check local HMAC session token (used for email/password accounts)
    const localUid = verifySessionToken(token);
    if (localUid) {
      const user = await getUserByUid(localUid);
      if (!user) {
        return res.status(401).json({ error: 'Usuário não encontrado.' });
      }
      req.authUser = user;
      return next();
    }

    // 2. Verify Firebase ID token via Firebase Admin SDK
    const decoded = await adminAuth.verifyIdToken(token);
    const user = await getOrCreateUser(
      decoded.uid,
      decoded.email || `${decoded.uid}@firebase.local`,
      decoded.name
    );
    req.authUser = user;
    return next();
  } catch (error) {
    console.error('Error verifying authentication token:', error);
    return res
      .status(401)
      .json({ error: 'Sessão expirada ou token inválido.' });
  }
};

export const requireActiveWorkspace = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  try {
    const subInfo = await computeUserSubscriptionInfoDb(req.authUser);
    if (!subInfo.canAccessApp) {
      return res.status(402).json({
        error:
          'Seu prazo de 25 dias FREE terminou ou sua assinatura está pendente. Ative um plano para continuar.',
        code: 'SUBSCRIPTION_REQUIRED',
      });
    }
    return next();
  } catch (error) {
    console.error('Workspace subscription check failed:', error);
    return res
      .status(500)
      .json({ error: 'Erro ao validar acesso da assinatura.' });
  }
};

export const requireAdminFull = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.authUser || req.authUser.role !== 'ADMIN_FULL') {
    return res.status(403).json({
      error:
        'Acesso restrito. Somente o Administrador FULL pode executar esta ação.',
    });
  }
  return next();
};

export const requireSubscriberAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  if (req.authUser.role === 'ADMIN_FULL') return next();
  if (req.authUser.role === 'ADMIN_PAID') {
    try {
      const subInfo = await computeUserSubscriptionInfoDb(req.authUser);
      if (!subInfo.canAccessApp) {
        return res.status(403).json({
          error: 'Sua assinatura está suspensa ou sem acesso liberado.',
        });
      }
      return next();
    } catch (error) {
      console.error('AdminPaid subscription check failed:', error);
      return res
        .status(500)
        .json({ error: 'Erro ao validar permissão administrativa.' });
    }
  }
  return res.status(403).json({
    error:
      'Acesso restrito. Apenas o Administrador FULL ou cadastros selecionados para administrar assinantes pagos têm acesso.',
  });
};
