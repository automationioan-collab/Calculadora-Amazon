import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  calculateUnitEconomics,
} from './src/utils/amazonBr';
import type {
  AdminFullRecord,
  AlertNotificationConfig,
  AlertRule,
  CompetitorWatch,
  FreeEligibilityResult,
  MarketProduct,
  PaymentMethod,
  PlannerInputs,
  StoreSku,
  SubscriberPlan,
  SubscriberRecord,
  SubscriberStatus,
  SubscriptionAccessInfo,
  SupplierAnalyzedItem,
  SupplierBatch,
  SupplierRowInput,
  TrialIdentityRecord,
  TriggeredAlert,
  UserProfile,
} from './src/types';
import {
  createDefaultAlertConfig,
  FREE_TRIAL_DAYS,
  PLAN_DEFAULTS,
  SEED_COMPETITORS,
  SEED_MARKET_PRODUCTS,
  SEED_PLANNER_SCENARIOS,
  SEED_STORE_SKUS,
  SEED_SUBSCRIBERS,
} from './server/seedData';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'workspace-db.json');
const TOKEN_SECRET = process.env.SESSION_SECRET || 'amzhub-br-local-workspace-secret-2026';

interface StoredUser extends UserProfile {
  passwordHash: string;
}

interface WorkspaceState {
  users: StoredUser[];
  competitors: Record<string, CompetitorWatch[]>;
  storeSkus: Record<string, StoreSku[]>;
  supplierBatches: Record<string, SupplierBatch[]>;
  plannerScenarios: Record<string, PlannerInputs[]>;
  alertSettings?: Record<string, AlertNotificationConfig>;
  subscribers?: SubscriberRecord[];
  trialRegistry?: TrialIdentityRecord[];
}

const DEMO_USER_ID = 'user-demo-br';
const ADMIN_USER_ID = 'user-admin-full';
const AVATAR_URL = '/src/assets/images/seller_profile_avatar_1794711815395.jpg';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits;
}

function normalizeAmazonId(amazonAccountId: string): string {
  return amazonAccountId.trim().toUpperCase().replace(/\s+/g, '');
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(baseIso: string, days: number): string {
  const dt = new Date(`${baseIso.slice(0, 10)}T12:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function formatDateBr(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : isoDate;
}

function calculateRemainingTrialDays(trialEndsAtIso: string): number {
  const endMs = new Date(`${trialEndsAtIso.slice(0, 10)}T23:59:59.999Z`).getTime();
  if (Number.isNaN(endMs)) return 0;
  const diff = endMs - Date.now();
  if (diff <= 0) return 0;
  return Math.min(FREE_TRIAL_DAYS, Math.ceil(diff / 86400000));
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function signToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, iat: Date.now() }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string | undefined): string | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
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

async function ensureDb(): Promise<WorkspaceState> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as WorkspaceState;
    let dirty = false;

    // Ensure phone, amazonAccountId and 25-day trial dates on legacy users & subscribers
    for (const u of parsed.users) {
      if (!u.role) {
        u.role = u.id === ADMIN_USER_ID ? 'ADMIN_FULL' : 'SUBSCRIBER';
        dirty = true;
      }
      if (u.id === DEMO_USER_ID && (!u.phone || !u.amazonAccountId)) {
        u.phone = u.phone || '(11) 98412-3310';
        u.amazonAccountId = u.amazonAccountId || 'A2DEMO8412BR';
        dirty = true;
      }
    }

    // Ensure ADMIN_FULL account exists
    if (!parsed.users.some((u) => u.id === ADMIN_USER_ID || u.role === 'ADMIN_FULL')) {
      parsed.users.unshift({
        id: ADMIN_USER_ID,
        name: 'Administrador FULL',
        email: 'admin@amzhub.com.br',
        phone: '(11) 90000-0000',
        amazonAccountId: 'ADMINMATRIZBR',
        companyName: 'AmzHub BR Matriz',
        taxRegime: 'Lucro Presumido',
        defaultTaxRate: 6.5,
        avatarUrl: AVATAR_URL,
        role: 'ADMIN_FULL',
        passwordHash: hashPassword('admin1234'),
      });
      parsed.competitors[ADMIN_USER_ID] = [...SEED_COMPETITORS];
      parsed.storeSkus[ADMIN_USER_ID] = [...SEED_STORE_SKUS];
      parsed.supplierBatches[ADMIN_USER_ID] = [];
      parsed.plannerScenarios[ADMIN_USER_ID] = [...SEED_PLANNER_SCENARIOS];
      parsed.alertSettings = parsed.alertSettings || {};
      parsed.alertSettings[ADMIN_USER_ID] = createDefaultAlertConfig('admin@amzhub.com.br');
      dirty = true;
    }

    if (parsed.subscribers) {
      for (const s of parsed.subscribers) {
        const seedMatch = SEED_SUBSCRIBERS.find((seed) => seed.email === s.email);
        if (typeof s.accessGranted !== 'boolean') {
          s.accessGranted = s.status !== 'Suspenso' && s.status !== 'Inadimplente';
          dirty = true;
        }
        if (!s.phone) {
          s.phone = seedMatch?.phone || '(11) 99000-0000';
          dirty = true;
        }
        if (!s.amazonAccountId) {
          s.amazonAccountId = seedMatch?.amazonAccountId || `AMZ${s.id.toUpperCase()}`;
          dirty = true;
        }
        if (!s.trialStartedAt) {
          s.trialStartedAt = s.createdAt || todayIso();
          dirty = true;
        }
        if (!s.trialEndsAt) {
          s.trialEndsAt = addDaysIso(s.trialStartedAt, FREE_TRIAL_DAYS);
          dirty = true;
        }
        if (typeof s.isPaidAdmin !== 'boolean') {
          s.isPaidAdmin = false;
          dirty = true;
        }
        const matchedUser = parsed.users.find(
          (u) => normalizeEmail(u.email) === normalizeEmail(s.email) && u.role !== 'ADMIN_FULL'
        );
        if (matchedUser) {
          const expectedRole = s.isPaidAdmin ? 'ADMIN_PAID' : 'SUBSCRIBER';
          if (matchedUser.role !== expectedRole) {
            matchedUser.role = expectedRole;
            dirty = true;
          }
        }
      }
    }

    if (!parsed.trialRegistry) {
      parsed.trialRegistry = (parsed.subscribers || SEED_SUBSCRIBERS).map((s) => ({
        id: `trial-${s.id}`,
        email: normalizeEmail(s.email),
        phoneDigits: normalizePhone(s.phone || ''),
        amazonAccountId: normalizeAmazonId(s.amazonAccountId || ''),
        trialStartedAt: s.trialStartedAt || s.createdAt || todayIso(),
        trialEndsAt:
          s.trialEndsAt || addDaysIso(s.createdAt || todayIso(), FREE_TRIAL_DAYS),
        createdAt: s.createdAt || todayIso(),
      }));
      dirty = true;
    }

    if (dirty) {
      await fs.writeFile(DB_FILE, JSON.stringify(parsed, null, 2), 'utf8');
    }
    return parsed;
  } catch {
    const initial: WorkspaceState = {
      users: [
        {
          id: ADMIN_USER_ID,
          name: 'Administrador FULL',
          email: 'admin@amzhub.com.br',
          phone: '(11) 90000-0000',
          amazonAccountId: 'ADMINMATRIZBR',
          companyName: 'AmzHub BR Matriz',
          taxRegime: 'Lucro Presumido',
          defaultTaxRate: 6.5,
          avatarUrl: AVATAR_URL,
          role: 'ADMIN_FULL',
          passwordHash: hashPassword('admin1234'),
        },
        {
          id: DEMO_USER_ID,
          name: 'Rafael Mendes',
          email: 'demo@amzhub.com.br',
          phone: '(11) 98412-3310',
          amazonAccountId: 'A2DEMO8412BR',
          companyName: 'Mendes Comércio Digital Ltda',
          taxRegime: 'Simples Nacional',
          defaultTaxRate: 6.5,
          avatarUrl: AVATAR_URL,
          role: 'SUBSCRIBER',
          passwordHash: hashPassword('demo1234'),
        },
      ],
      competitors: {
        [ADMIN_USER_ID]: [...SEED_COMPETITORS],
        [DEMO_USER_ID]: [...SEED_COMPETITORS],
      },
      storeSkus: {
        [ADMIN_USER_ID]: [...SEED_STORE_SKUS],
        [DEMO_USER_ID]: [...SEED_STORE_SKUS],
      },
      supplierBatches: {
        [ADMIN_USER_ID]: [],
        [DEMO_USER_ID]: [],
      },
      plannerScenarios: {
        [ADMIN_USER_ID]: [...SEED_PLANNER_SCENARIOS],
        [DEMO_USER_ID]: [...SEED_PLANNER_SCENARIOS],
      },
      alertSettings: {
        [ADMIN_USER_ID]: createDefaultAlertConfig('admin@amzhub.com.br'),
        [DEMO_USER_ID]: createDefaultAlertConfig('demo@amzhub.com.br'),
      },
      subscribers: [...SEED_SUBSCRIBERS],
      trialRegistry: SEED_SUBSCRIBERS.map((s) => ({
        id: `trial-${s.id}`,
        email: normalizeEmail(s.email),
        phoneDigits: normalizePhone(s.phone),
        amazonAccountId: normalizeAmazonId(s.amazonAccountId),
        trialStartedAt: s.trialStartedAt,
        trialEndsAt: s.trialEndsAt,
        createdAt: s.createdAt,
      })),
    };
    await fs.writeFile(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

async function saveDb(state: WorkspaceState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function evaluateTrialEligibility(
  db: WorkspaceState,
  input: { email?: string; phone?: string; amazonAccountId?: string }
): FreeEligibilityResult {
  const emailNorm = input.email ? normalizeEmail(input.email) : '';
  const phoneNorm = input.phone ? normalizePhone(input.phone) : '';
  const amazonNorm = input.amazonAccountId
    ? normalizeAmazonId(input.amazonAccountId)
    : '';

  const matchedFieldsSet = new Set<'email' | 'telefone' | 'conta_amazon'>();
  let matchedStartedAt: string | null = null;
  let matchedEndsAt: string | null = null;
  let hasActivePaid = false;

  const inspectRecord = (rec: {
    email?: string;
    phone?: string;
    phoneDigits?: string;
    amazonAccountId?: string;
    trialStartedAt?: string;
    trialEndsAt?: string;
    status?: SubscriberStatus;
    accessGranted?: boolean;
  }) => {
    const recEmail = rec.email ? normalizeEmail(rec.email) : '';
    const recPhone = rec.phoneDigits || (rec.phone ? normalizePhone(rec.phone) : '');
    const recAmazon = rec.amazonAccountId
      ? normalizeAmazonId(rec.amazonAccountId)
      : '';

    let hit = false;
    if (emailNorm && recEmail && emailNorm === recEmail) {
      matchedFieldsSet.add('email');
      hit = true;
    }
    if (phoneNorm.length >= 10 && recPhone && phoneNorm === recPhone) {
      matchedFieldsSet.add('telefone');
      hit = true;
    }
    if (amazonNorm.length >= 4 && recAmazon && amazonNorm === recAmazon) {
      matchedFieldsSet.add('conta_amazon');
      hit = true;
    }
    if (hit) {
      if (rec.status === 'Ativo' && rec.accessGranted) {
        hasActivePaid = true;
      }
      if (rec.trialEndsAt) {
        if (!matchedEndsAt || rec.trialEndsAt < matchedEndsAt) {
          matchedStartedAt = rec.trialStartedAt || matchedStartedAt;
          matchedEndsAt = rec.trialEndsAt;
        }
      }
    }
  };

  for (const t of db.trialRegistry || []) inspectRecord(t);
  for (const s of db.subscribers || []) inspectRecord(s);
  for (const u of db.users) {
    if (u.role !== 'ADMIN_FULL') inspectRecord(u);
  }

  const matchedFields = Array.from(matchedFieldsSet);
  const labelsMap: Record<'email' | 'telefone' | 'conta_amazon', string> = {
    email: 'E-mail',
    telefone: 'Telefone',
    conta_amazon: 'Conta da Amazon',
  };
  const matchedLabels = matchedFields.map((f) => labelsMap[f]).join(', ');

  if (matchedFields.length === 0) {
    return {
      eligibleForFree: true,
      daysRemaining: FREE_TRIAL_DAYS,
      trialDaysTotal: FREE_TRIAL_DAYS,
      trialEndsAt: addDaysIso(todayIso(), FREE_TRIAL_DAYS),
      matchedFields: [],
      requiresSubscriptionNow: false,
      message: `Elegível para ${FREE_TRIAL_DAYS} dias de acesso FREE! E-mail, telefone e conta da Amazon disponíveis.`,
    };
  }

  if (hasActivePaid) {
    return {
      eligibleForFree: false,
      daysRemaining: 0,
      trialDaysTotal: FREE_TRIAL_DAYS,
      trialEndsAt: matchedEndsAt,
      matchedFields,
      requiresSubscriptionNow: false,
      message: `Identificamos conta com assinatura ativa vinculada (${matchedLabels}). Faça login para acessar.`,
    };
  }

  const endsAt = matchedEndsAt || todayIso();
  const remaining = calculateRemainingTrialDays(endsAt);
  if (remaining > 0) {
    return {
      eligibleForFree: true,
      daysRemaining: remaining,
      trialDaysTotal: FREE_TRIAL_DAYS,
      trialEndsAt: endsAt,
      matchedFields,
      requiresSubscriptionNow: false,
      message: `Identificamos cadastro prévio (${matchedLabels}). Restam ${remaining} dias do prazo FREE até ${formatDateBr(endsAt)}.`,
    };
  }

  return {
    eligibleForFree: false,
    daysRemaining: 0,
    trialDaysTotal: FREE_TRIAL_DAYS,
    trialEndsAt: endsAt,
    matchedFields,
    requiresSubscriptionNow: true,
    message: `Prazo de ${FREE_TRIAL_DAYS} dias FREE já utilizado (${matchedLabels}). Somente com assinatura ativa para continuar.`,
  };
}

function registerTrialIdentity(
  db: WorkspaceState,
  entry: {
    email: string;
    phone: string;
    amazonAccountId: string;
    trialStartedAt: string;
    trialEndsAt: string;
  }
): void {
  db.trialRegistry = db.trialRegistry || [];
  const emailNorm = normalizeEmail(entry.email);
  const phoneDigits = normalizePhone(entry.phone);
  const amazonNorm = normalizeAmazonId(entry.amazonAccountId);
  const alreadyExact = db.trialRegistry.some(
    (t) =>
      t.email === emailNorm &&
      t.phoneDigits === phoneDigits &&
      t.amazonAccountId === amazonNorm
  );
  if (!alreadyExact) {
    db.trialRegistry.unshift({
      id: `trial-${crypto.randomUUID().slice(0, 8)}`,
      email: emailNorm,
      phoneDigits,
      amazonAccountId: amazonNorm,
      trialStartedAt: entry.trialStartedAt,
      trialEndsAt: entry.trialEndsAt,
      createdAt: todayIso(),
    });
  }
}

function computeUserSubscriptionInfo(
  user: StoredUser,
  db: WorkspaceState
): SubscriptionAccessInfo {
  if (user.role === 'ADMIN_FULL') {
    const today = todayIso();
    return {
      status: 'Ativo',
      plan: 'Enterprise',
      trialStartedAt: today,
      trialEndsAt: today,
      trialDaysTotal: FREE_TRIAL_DAYS,
      trialDaysRemaining: 0,
      isFreeTrialActive: false,
      isTrialExpired: false,
      hasPaidSubscription: true,
      canAccessApp: true,
    };
  }

  const emailNorm = normalizeEmail(user.email);
  const phoneNorm = user.phone ? normalizePhone(user.phone) : '';
  const amazonNorm = user.amazonAccountId
    ? normalizeAmazonId(user.amazonAccountId)
    : '';

  const sub = (db.subscribers || []).find(
    (s) =>
      normalizeEmail(s.email) === emailNorm ||
      (phoneNorm.length >= 10 && normalizePhone(s.phone || '') === phoneNorm) ||
      (amazonNorm.length >= 4 &&
        normalizeAmazonId(s.amazonAccountId || '') === amazonNorm)
  );

  const eligibility = evaluateTrialEligibility(db, {
    email: user.email,
    phone: user.phone,
    amazonAccountId: user.amazonAccountId,
  });

  const startedAt = sub?.trialStartedAt || todayIso();
  const endsAt =
    sub?.trialEndsAt || eligibility.trialEndsAt || addDaysIso(startedAt, FREE_TRIAL_DAYS);
  const daysRemaining = calculateRemainingTrialDays(endsAt);
  const status: SubscriberStatus = sub?.status || (daysRemaining > 0 ? 'Trial' : 'Inadimplente');
  const accessGranted = sub ? sub.accessGranted : daysRemaining > 0;

  const hasPaidSubscription = status === 'Ativo' && accessGranted;
  const isFreeTrialActive = status === 'Trial' && accessGranted && daysRemaining > 0;
  const isTrialExpired = !hasPaidSubscription && !isFreeTrialActive;
  const canAccessApp = hasPaidSubscription || isFreeTrialActive;

  return {
    status,
    plan: sub?.plan || 'Starter',
    trialStartedAt: startedAt,
    trialEndsAt: endsAt,
    trialDaysTotal: FREE_TRIAL_DAYS,
    trialDaysRemaining: daysRemaining,
    isFreeTrialActive,
    isTrialExpired,
    hasPaidSubscription,
    canAccessApp,
    recognizedBy: eligibility.matchedFields,
  };
}

function sanitizeUser(u: StoredUser, db?: WorkspaceState): UserProfile {
  const { passwordHash: _ignored, ...rest } = u;
  if (db) {
    return {
      ...rest,
      subscriptionInfo: computeUserSubscriptionInfo(u, db),
    };
  }
  return rest;
}

function extractToken(req: express.Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader
      .split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith('amzhub_token='));
    if (match) return decodeURIComponent(match.split('=')[1]);
  }
  return undefined;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Auth middleware helper
  const requireUser = async (
    req: express.Request,
    res: express.Response
  ): Promise<{ db: WorkspaceState; user: StoredUser } | null> => {
    const token = extractToken(req);
    const uid = verifyToken(token);
    if (!uid) {
      res.status(401).json({ error: 'Sessão expirada ou não autenticada.' });
      return null;
    }
    const db = await ensureDb();
    const user = db.users.find((u) => u.id === uid);
    if (!user) {
      res.status(401).json({ error: 'Usuário não encontrado.' });
      return null;
    }
    return { db, user };
  };

  // Workspace guard: requires ADMIN_FULL, active paid subscription, or active 25-day FREE trial
  const requireActiveWorkspaceUser = async (
    req: express.Request,
    res: express.Response
  ): Promise<{ db: WorkspaceState; user: StoredUser } | null> => {
    const auth = await requireUser(req, res);
    if (!auth) return null;
    const subInfo = computeUserSubscriptionInfo(auth.user, auth.db);
    if (!subInfo.canAccessApp) {
      res.status(402).json({
        error:
          'Seu prazo de 25 dias FREE terminou ou sua assinatura está pendente. Ative um plano para continuar.',
        code: 'SUBSCRIPTION_REQUIRED',
      });
      return null;
    }
    return auth;
  };

  // Strict ADMIN_FULL authorization guard
  const requireAdminFull = async (
    req: express.Request,
    res: express.Response
  ): Promise<{ db: WorkspaceState; user: StoredUser } | null> => {
    const auth = await requireUser(req, res);
    if (!auth) return null;
    if (auth.user.role !== 'ADMIN_FULL') {
      res.status(403).json({
        error: 'Acesso restrito. Somente o Administrador FULL pode executar esta ação.',
      });
      return null;
    }
    return auth;
  };

  // Subscriber Admin guard: allows ADMIN_FULL or selected ADMIN_PAID accounts
  const requireSubscriberAdmin = async (
    req: express.Request,
    res: express.Response
  ): Promise<{ db: WorkspaceState; user: StoredUser } | null> => {
    const auth = await requireUser(req, res);
    if (!auth) return null;
    if (auth.user.role === 'ADMIN_FULL') return auth;
    if (auth.user.role === 'ADMIN_PAID') {
      const subInfo = computeUserSubscriptionInfo(auth.user, auth.db);
      if (!subInfo.canAccessApp) {
        res.status(403).json({
          error: 'Sua assinatura está suspensa ou sem acesso liberado.',
        });
        return null;
      }
      return auth;
    }
    res.status(403).json({
      error:
        'Acesso restrito. Apenas o Administrador FULL ou cadastros selecionados para administrar assinantes pagos têm acesso.',
    });
    return null;
  };

  // --- AUTH & FREE TRIAL RECOGNITION ROUTES ---
  app.post('/api/auth/check-free-eligibility', async (req, res) => {
    const { email, phone, amazonAccountId } = req.body as {
      email?: string;
      phone?: string;
      amazonAccountId?: string;
    };
    const db = await ensureDb();
    const result = evaluateTrialEligibility(db, { email, phone, amazonAccountId });
    res.json(result);
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha para entrar.' });
    }
    const db = await ensureDb();
    const user = db.users.find(
      (u) => normalizeEmail(u.email) === normalizeEmail(email)
    );
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    if (user.role !== 'ADMIN_FULL') {
      const subRecord = (db.subscribers || []).find(
        (s) => normalizeEmail(s.email) === normalizeEmail(user.email)
      );
      if (subRecord && subRecord.status === 'Suspenso' && !subRecord.accessGranted) {
        return res.status(403).json({
          error: 'Acesso suspenso pelo Administrador FULL.',
        });
      }
    }

    const token = signToken(user.id);
    res.json({ token, user: sanitizeUser(user, db) });
  });

  app.post('/api/auth/demo', async (_req, res) => {
    const db = await ensureDb();
    const demoUser =
      db.users.find((u) => u.id === DEMO_USER_ID) ||
      db.users.find((u) => u.role === 'SUBSCRIBER') ||
      db.users[0];
    const token = signToken(demoUser.id);
    res.json({ token, user: sanitizeUser(demoUser, db) });
  });

  app.post('/api/auth/admin-demo', async (_req, res) => {
    const db = await ensureDb();
    const adminUser = db.users.find((u) => u.role === 'ADMIN_FULL') || db.users[0];
    const token = signToken(adminUser.id);
    res.json({ token, user: sanitizeUser(adminUser, db) });
  });

  app.post('/api/auth/register', async (req, res) => {
    const { name, email, phone, amazonAccountId, password, companyName } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      amazonAccountId?: string;
      password?: string;
      companyName?: string;
    };
    const cleanPhoneDigits = normalizePhone(phone || '');
    const cleanAmazonId = normalizeAmazonId(amazonAccountId || '');

    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({
        error: 'Preencha nome, e-mail válido e senha com pelo menos 6 caracteres.',
      });
    }
    if (cleanPhoneDigits.length < 10) {
      return res.status(400).json({
        error: 'Informe um telefone/WhatsApp válido com DDD para validar os 25 dias FREE.',
      });
    }
    if (cleanAmazonId.length < 4) {
      return res.status(400).json({
        error: 'Informe sua Conta da Amazon (Seller ID ou código da loja) para validar os 25 dias FREE.',
      });
    }

    const db = await ensureDb();
    const emailNorm = normalizeEmail(email);
    const exists = db.users.some((u) => normalizeEmail(u.email) === emailNorm);
    if (exists) {
      return res.status(409).json({
        error: 'Este e-mail já está cadastrado. Faça login para verificar seu status.',
      });
    }

    // Check email, phone, and Amazon account against registry to calculate 25-day FREE eligibility
    const eligibility = evaluateTrialEligibility(db, {
      email: emailNorm,
      phone: cleanPhoneDigits,
      amazonAccountId: cleanAmazonId,
    });

    const today = todayIso();
    const trialStartedAt = eligibility.matchedFields.length > 0 && eligibility.trialEndsAt
      ? addDaysIso(eligibility.trialEndsAt, -FREE_TRIAL_DAYS)
      : today;
    const trialEndsAt =
      eligibility.matchedFields.length > 0 && eligibility.trialEndsAt
        ? eligibility.trialEndsAt
        : addDaysIso(today, FREE_TRIAL_DAYS);
    const daysLeft = calculateRemainingTrialDays(trialEndsAt);
    const initialStatus: SubscriberStatus = daysLeft > 0 ? 'Trial' : 'Inadimplente';
    const initialAccess = daysLeft > 0;

    const newId = `user-${crypto.randomUUID().slice(0, 8)}`;
    const newUser: StoredUser = {
      id: newId,
      name: name.trim(),
      email: emailNorm,
      phone: (phone || '').trim(),
      amazonAccountId: cleanAmazonId,
      companyName: (companyName || `${name.trim()} Store`).trim(),
      taxRegime: 'Simples Nacional',
      defaultTaxRate: 6.5,
      avatarUrl: AVATAR_URL,
      role: 'SUBSCRIBER',
      passwordHash: hashPassword(password),
    };
    db.users.push(newUser);
    db.competitors[newId] = [...SEED_COMPETITORS];
    db.storeSkus[newId] = [...SEED_STORE_SKUS];
    db.supplierBatches[newId] = [];
    db.plannerScenarios[newId] = [...SEED_PLANNER_SCENARIOS];
    db.alertSettings = db.alertSettings || {};
    db.alertSettings[newId] = createDefaultAlertConfig(newUser.email);
    db.subscribers = db.subscribers || [...SEED_SUBSCRIBERS];
    db.subscribers.unshift({
      id: `sub-${newId}`,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone || '',
      amazonAccountId: cleanAmazonId,
      companyName: newUser.companyName,
      plan: 'Starter',
      monthlyPrice: PLAN_DEFAULTS.Starter.monthlyPrice,
      status: initialStatus,
      accessGranted: initialAccess,
      trialStartedAt,
      trialEndsAt,
      skusLimit: PLAN_DEFAULTS.Starter.skusLimit,
      skusUsed: SEED_STORE_SKUS.length,
      paymentMethod: 'PIX',
      nextBillingDate: trialEndsAt,
      createdAt: today,
    });

    registerTrialIdentity(db, {
      email: newUser.email,
      phone: newUser.phone || cleanPhoneDigits,
      amazonAccountId: cleanAmazonId,
      trialStartedAt,
      trialEndsAt,
    });

    await saveDb(db);

    const token = signToken(newId);
    res.status(201).json({ token, user: sanitizeUser(newUser, db), eligibility });
  });

  app.post('/api/subscription/activate', async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { plan, paymentMethod } = req.body as {
      plan?: SubscriberPlan;
      paymentMethod?: PaymentMethod;
    };
    const chosenPlan: SubscriberPlan = plan && PLAN_DEFAULTS[plan] ? plan : 'Pro';
    const chosenMethod: PaymentMethod = paymentMethod || 'PIX';
    const defaults = PLAN_DEFAULTS[chosenPlan];
    const nextBilling = addDaysIso(todayIso(), 30);

    auth.db.subscribers = auth.db.subscribers || [...SEED_SUBSCRIBERS];
    const idx = auth.db.subscribers.findIndex(
      (s) => normalizeEmail(s.email) === normalizeEmail(auth.user.email)
    );

    if (idx !== -1) {
      auth.db.subscribers[idx] = {
        ...auth.db.subscribers[idx],
        plan: chosenPlan,
        monthlyPrice: defaults.monthlyPrice,
        skusLimit: defaults.skusLimit,
        status: 'Ativo',
        accessGranted: true,
        paymentMethod: chosenMethod,
        nextBillingDate: nextBilling,
      };
    } else {
      const today = todayIso();
      auth.db.subscribers.unshift({
        id: `sub-${auth.user.id}`,
        name: auth.user.name,
        email: auth.user.email,
        phone: auth.user.phone || '',
        amazonAccountId: auth.user.amazonAccountId || '',
        companyName: auth.user.companyName,
        plan: chosenPlan,
        monthlyPrice: defaults.monthlyPrice,
        status: 'Ativo',
        accessGranted: true,
        trialStartedAt: today,
        trialEndsAt: addDaysIso(today, FREE_TRIAL_DAYS),
        skusLimit: defaults.skusLimit,
        skusUsed: (auth.db.storeSkus[auth.user.id] || []).length,
        paymentMethod: chosenMethod,
        nextBillingDate: nextBilling,
        createdAt: today,
      });
    }

    await saveDb(auth.db);
    res.json({ user: sanitizeUser(auth.user, auth.db) });
  });

  app.get('/api/auth/me', async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    res.json({ user: sanitizeUser(auth.user, auth.db) });
  });

  // --- MARKET EXPLORER (MZMarket style) ---
  app.get('/api/market/products', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;

    const q = String(req.query.q || '').trim().toLowerCase();
    const category = String(req.query.category || 'Todas');
    const mode = String(req.query.mode || 'Todos');
    const maxBsr = Number(req.query.maxBsr || 999999);
    const maxSellers = Number(req.query.maxSellers || 999);
    const minPrice = Number(req.query.minPrice || 0);
    const maxPrice = Number(req.query.maxPrice || 999999);

    const filtered: MarketProduct[] = SEED_MARKET_PRODUCTS.filter((p) => {
      if (q && !p.title.toLowerCase().includes(q) && !p.asin.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q)) {
        return false;
      }
      if (category !== 'Todas' && p.category !== category) return false;
      if (mode !== 'Todos' && p.buyBoxMode !== mode) return false;
      if (p.bsr > maxBsr) return false;
      if (p.sellersCount > maxSellers) return false;
      if (p.price < minPrice || p.price > maxPrice) return false;
      return true;
    });

    res.json({ products: filtered });
  });

  // --- SUPPLIER BULK ANALYZER (MZMagic style) ---
  app.get('/api/supplier/batches', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    const batches = auth.db.supplierBatches[auth.user.id] || [];
    res.json({ batches });
  });

  app.post('/api/supplier/analyze', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;

    const { batchName, taxRate, rows } = req.body as {
      batchName?: string;
      taxRate?: number;
      rows?: SupplierRowInput[];
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Envie ao menos um item na lista do fornecedor.' });
    }

    const effectiveTax = typeof taxRate === 'number' ? taxRate : auth.user.defaultTaxRate;
    const analyzed: SupplierAnalyzedItem[] = rows.map((row, idx) => {
      const key = row.eanOrAsin.trim().toLowerCase();
      const matched = SEED_MARKET_PRODUCTS.find(
        (m) =>
          m.asin.toLowerCase() === key ||
          m.ean.toLowerCase() === key ||
          m.title.toLowerCase().includes(row.productName.toLowerCase().slice(0, 14))
      );

      const category = matched?.category ?? 'Casa e Cozinha';
      const amazonPrice = matched?.price ?? Number((row.supplierCost * 2.15).toFixed(2));
      const weightGrams = matched?.weightGrams ?? 750;
      const mode = row.mode ?? matched?.buyBoxMode ?? 'FBA';
      const effectiveCost = Number(
        (row.supplierCost * (1 + (row.icmsStPercent || 0) / 100)).toFixed(2)
      );

      const econ = calculateUnitEconomics({
        salePrice: amazonPrice,
        unitCost: effectiveCost,
        inboundShipping: row.freightPerUnit || 4.5,
        packagingCost: 2.0,
        category,
        fulfillment: mode,
        weightGrams,
        taxPercent: effectiveTax,
        acosPercent: 3.0,
      });

      const verdict: SupplierAnalyzedItem['verdict'] =
        econ.marginPercent >= 14 && econ.netProfit >= 12
          ? 'Lucrativo'
          : econ.marginPercent >= 6 && econ.netProfit > 0
            ? 'Margem Baixa'
            : 'Inviável';

      return {
        ...row,
        id: `sup-${idx}-${Date.now()}`,
        matchedAsin: matched?.asin ?? null,
        amazonTitle: matched?.title ?? row.productName,
        category,
        amazonPrice,
        monthlySales: matched?.monthlySales ?? 140,
        sellersCount: matched?.sellersCount ?? 5,
        referralFee: econ.referralFee,
        fulfillmentFee: econ.fulfillmentFee,
        taxes: econ.taxAmount,
        netProfit: econ.netProfit,
        marginPercent: econ.marginPercent,
        roiPercent: econ.roiPercent,
        verdict,
      };
    });

    const batch: SupplierBatch = {
      id: `batch-${crypto.randomUUID().slice(0, 8)}`,
      batchName: (batchName || 'Lista de Fornecedor').trim(),
      createdAt: new Date().toISOString(),
      taxRate: effectiveTax,
      items: analyzed,
    };

    const userBatches = auth.db.supplierBatches[auth.user.id] || [];
    auth.db.supplierBatches[auth.user.id] = [batch, ...userBatches].slice(0, 10);
    await saveDb(auth.db);

    res.status(201).json({ batch });
  });

  // --- COMPETITOR SPY (MZSpy style) ---
  app.get('/api/competitors', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    res.json({ competitors: auth.db.competitors[auth.user.id] || [] });
  });

  app.post('/api/competitors', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;

    const { sellerName, sellerId, primaryAsin } = req.body as {
      sellerName?: string;
      sellerId?: string;
      primaryAsin?: string;
    };

    if (!sellerName || !primaryAsin) {
      return res.status(400).json({ error: 'Informe o nome da loja e o ASIN principal.' });
    }

    const catalogMatch = SEED_MARKET_PRODUCTS.find(
      (p) => p.asin.toLowerCase() === primaryAsin.trim().toLowerCase()
    );

    const entry: CompetitorWatch = {
      id: `comp-${crypto.randomUUID().slice(0, 8)}`,
      sellerName: sellerName.trim(),
      sellerId: (sellerId || `A${Math.random().toString(36).substring(2, 11).toUpperCase()}BR`).trim(),
      primaryAsin: primaryAsin.trim().toUpperCase(),
      productTitle: catalogMatch?.title ?? `Oferta Amazon BR (${primaryAsin.trim().toUpperCase()})`,
      category: catalogMatch?.category ?? 'Casa e Cozinha',
      fulfillment: catalogMatch?.buyBoxMode ?? 'FBA',
      currentPrice: catalogMatch?.price ?? 149.9,
      buyBoxSharePercent: 48,
      activeSkus: 24,
      estimatedMonthlyRevenue: catalogMatch
        ? Math.round(catalogMatch.price * catalogMatch.monthlySales * 0.45)
        : 42500,
      priceChange7d: 0,
      lastCheckedAt: new Date().toISOString(),
    };

    const current = auth.db.competitors[auth.user.id] || [];
    auth.db.competitors[auth.user.id] = [entry, ...current];
    await saveDb(auth.db);
    res.status(201).json({ competitor: entry });
  });

  app.delete('/api/competitors/:id', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    const current = auth.db.competitors[auth.user.id] || [];
    auth.db.competitors[auth.user.id] = current.filter((c) => c.id !== req.params.id);
    await saveDb(auth.db);
    res.json({ ok: true });
  });

  // --- STORE SKUS (Gestão de Loja) ---
  app.get('/api/store/skus', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    res.json({ skus: auth.db.storeSkus[auth.user.id] || [] });
  });

  app.post('/api/store/skus', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;

    const payload = req.body as Partial<StoreSku>;
    if (!payload.title || !payload.asin || !payload.salePrice || !payload.unitCost) {
      return res.status(400).json({
        error: 'Preencha título, ASIN, preço de venda e custo unitário.',
      });
    }

    const newSku: StoreSku = {
      id: `sku-${crypto.randomUUID().slice(0, 8)}`,
      sku: (payload.sku || `AMZ-${Math.floor(100 + Math.random() * 900)}`).trim(),
      asin: payload.asin.trim().toUpperCase(),
      title: payload.title.trim(),
      category: payload.category || 'Casa e Cozinha',
      fulfillment: payload.fulfillment || 'FBA',
      salePrice: Number(payload.salePrice),
      unitCost: Number(payload.unitCost),
      inboundShipping: Number(payload.inboundShipping ?? 4.5),
      packagingCost: Number(payload.packagingCost ?? 2.0),
      taxPercent: Number(payload.taxPercent ?? auth.user.defaultTaxRate),
      acosPercent: Number(payload.acosPercent ?? 4.0),
      weightGrams: Number(payload.weightGrams ?? 750),
      stockUnits: Number(payload.stockUnits ?? 30),
      dailySalesVelocity: Number(payload.dailySalesVelocity ?? 2.0),
      buyBoxOwner: payload.buyBoxOwner || 'Sua Loja',
      updatedAt: new Date().toISOString(),
    };

    const current = auth.db.storeSkus[auth.user.id] || [];
    auth.db.storeSkus[auth.user.id] = [newSku, ...current];
    await saveDb(auth.db);
    res.status(201).json({ sku: newSku });
  });

  app.patch('/api/store/skus/:id', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    const current = auth.db.storeSkus[auth.user.id] || [];
    const idx = current.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'SKU não encontrado.' });

    const updated: StoreSku = {
      ...current[idx],
      ...req.body,
      id: current[idx].id,
      updatedAt: new Date().toISOString(),
    };
    current[idx] = updated;
    auth.db.storeSkus[auth.user.id] = current;
    await saveDb(auth.db);
    res.json({ sku: updated });
  });

  app.delete('/api/store/skus/:id', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    const current = auth.db.storeSkus[auth.user.id] || [];
    auth.db.storeSkus[auth.user.id] = current.filter((s) => s.id !== req.params.id);
    await saveDb(auth.db);
    res.json({ ok: true });
  });

  // --- PLANNER SCENARIOS (MZPlanner style) ---
  app.get('/api/planner/scenarios', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    res.json({ scenarios: auth.db.plannerScenarios[auth.user.id] || [] });
  });

  app.post('/api/planner/scenarios', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    const body = req.body as PlannerInputs;
    if (!body.name) {
      return res.status(400).json({ error: 'Informe um nome para o cenário.' });
    }
    const scenario: PlannerInputs = {
      ...body,
      id: `plan-${crypto.randomUUID().slice(0, 8)}`,
    };
    const current = auth.db.plannerScenarios[auth.user.id] || [];
    auth.db.plannerScenarios[auth.user.id] = [scenario, ...current];
    await saveDb(auth.db);
    res.status(201).json({ scenario });
  });

  app.delete('/api/planner/scenarios/:id', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    const current = auth.db.plannerScenarios[auth.user.id] || [];
    auth.db.plannerScenarios[auth.user.id] = current.filter((p) => p.id !== req.params.id);
    await saveDb(auth.db);
    res.json({ ok: true });
  });

  // --- ALERT SETTINGS & NOTIFICATION RULES ---
  const getOrInitAlertConfig = async (
    db: WorkspaceState,
    user: StoredUser
  ): Promise<AlertNotificationConfig> => {
    db.alertSettings = db.alertSettings || {};
    if (!db.alertSettings[user.id]) {
      db.alertSettings[user.id] = createDefaultAlertConfig(user.email);
      await saveDb(db);
    }
    return db.alertSettings[user.id];
  };

  app.get('/api/alerts', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    const config = await getOrInitAlertConfig(auth.db, auth.user);
    res.json({ config });
  });

  app.put('/api/alerts/channels', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    const config = await getOrInitAlertConfig(auth.db, auth.user);
    const {
      emailEnabled,
      notificationEmail,
      pushEnabled,
      quietHoursStart,
      quietHoursEnd,
    } = req.body as Partial<AlertNotificationConfig>;

    const updated: AlertNotificationConfig = {
      ...config,
      emailEnabled: typeof emailEnabled === 'boolean' ? emailEnabled : config.emailEnabled,
      notificationEmail:
        typeof notificationEmail === 'string' && notificationEmail.trim()
          ? notificationEmail.trim()
          : config.notificationEmail,
      pushEnabled: typeof pushEnabled === 'boolean' ? pushEnabled : config.pushEnabled,
      quietHoursStart: quietHoursStart || config.quietHoursStart,
      quietHoursEnd: quietHoursEnd || config.quietHoursEnd,
    };

    auth.db.alertSettings![auth.user.id] = updated;
    await saveDb(auth.db);
    res.json({ config: updated });
  });

  app.post('/api/alerts/rules', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    const config = await getOrInitAlertConfig(auth.db, auth.user);
    const body = req.body as Partial<AlertRule>;
    if (!body.name || !body.type) {
      return res.status(400).json({ error: 'Informe o nome e o tipo da regra de alerta.' });
    }

    const newRule: AlertRule = {
      id: `alert-${crypto.randomUUID().slice(0, 8)}`,
      name: body.name.trim(),
      type: body.type,
      targetAsinOrSku: (body.targetAsinOrSku || 'Todos').trim(),
      thresholdValue: Number(body.thresholdValue ?? 0),
      thresholdUnit: body.thresholdUnit || 'BRL',
      channel: body.channel || 'ambos',
      enabled: body.enabled ?? true,
      updatedAt: new Date().toISOString(),
    };

    config.rules = [newRule, ...config.rules];
    auth.db.alertSettings![auth.user.id] = config;
    await saveDb(auth.db);
    res.status(201).json({ config, rule: newRule });
  });

  app.patch('/api/alerts/rules/:id', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    const config = await getOrInitAlertConfig(auth.db, auth.user);
    const idx = config.rules.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Regra de alerta não encontrada.' });
    }
    config.rules[idx] = {
      ...config.rules[idx],
      ...req.body,
      id: config.rules[idx].id,
      updatedAt: new Date().toISOString(),
    };
    auth.db.alertSettings![auth.user.id] = config;
    await saveDb(auth.db);
    res.json({ config });
  });

  app.delete('/api/alerts/rules/:id', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    const config = await getOrInitAlertConfig(auth.db, auth.user);
    config.rules = config.rules.filter((r) => r.id !== req.params.id);
    auth.db.alertSettings![auth.user.id] = config;
    await saveDb(auth.db);
    res.json({ config });
  });

  app.post('/api/alerts/evaluate', async (req, res) => {
    const auth = await requireActiveWorkspaceUser(req, res);
    if (!auth) return;
    const config = await getOrInitAlertConfig(auth.db, auth.user);
    const skus = auth.db.storeSkus[auth.user.id] || [];
    const competitors = auth.db.competitors[auth.user.id] || [];
    const triggered: TriggeredAlert[] = [];

    for (const rule of config.rules) {
      if (!rule.enabled) continue;
      const target = rule.targetAsinOrSku.toLowerCase();

      if (rule.type === 'competitor_price_below') {
        for (const comp of competitors) {
          if (
            target !== 'todos' &&
            comp.primaryAsin.toLowerCase() !== target &&
            !comp.sellerName.toLowerCase().includes(target)
          ) {
            continue;
          }
          if (comp.currentPrice <= rule.thresholdValue) {
            triggered.push({
              id: `trig-${rule.id}-${comp.id}`,
              ruleId: rule.id,
              ruleName: rule.name,
              targetLabel: `${comp.sellerName} (${comp.primaryAsin})`,
              currentValueText: `R$ ${comp.currentPrice.toFixed(2).replace('.', ',')}`,
              thresholdText: `abaixo de R$ ${rule.thresholdValue.toFixed(2).replace('.', ',')}`,
              channel: rule.channel,
              severity: 'alta',
            });
          }
        }
      } else if (rule.type === 'low_stock_days') {
        for (const sku of skus) {
          if (
            target !== 'todos' &&
            sku.asin.toLowerCase() !== target &&
            sku.sku.toLowerCase() !== target
          ) {
            continue;
          }
          const days =
            sku.dailySalesVelocity > 0
              ? Math.round(sku.stockUnits / sku.dailySalesVelocity)
              : 999;
          if (days <= rule.thresholdValue) {
            triggered.push({
              id: `trig-${rule.id}-${sku.id}`,
              ruleId: rule.id,
              ruleName: rule.name,
              targetLabel: `${sku.title} (${sku.asin})`,
              currentValueText: `${days} dias (${sku.stockUnits} un)`,
              thresholdText: `mínimo ${rule.thresholdValue} dias`,
              channel: rule.channel,
              severity: days <= 7 ? 'alta' : 'media',
            });
          }
        }
      } else if (rule.type === 'low_stock_units') {
        for (const sku of skus) {
          if (
            target !== 'todos' &&
            sku.asin.toLowerCase() !== target &&
            sku.sku.toLowerCase() !== target
          ) {
            continue;
          }
          if (sku.stockUnits <= rule.thresholdValue) {
            triggered.push({
              id: `trig-${rule.id}-${sku.id}`,
              ruleId: rule.id,
              ruleName: rule.name,
              targetLabel: `${sku.title} (${sku.asin})`,
              currentValueText: `${sku.stockUnits} unidades`,
              thresholdText: `mínimo ${rule.thresholdValue} un`,
              channel: rule.channel,
              severity: 'alta',
            });
          }
        }
      } else if (rule.type === 'buybox_lost') {
        for (const sku of skus) {
          if (
            target !== 'todos' &&
            sku.asin.toLowerCase() !== target &&
            sku.sku.toLowerCase() !== target
          ) {
            continue;
          }
          if (sku.buyBoxOwner !== 'Sua Loja') {
            triggered.push({
              id: `trig-${rule.id}-${sku.id}`,
              ruleId: rule.id,
              ruleName: rule.name,
              targetLabel: `${sku.title} (${sku.asin})`,
              currentValueText: 'Buy Box com Concorrente',
              thresholdText: 'Posse imediata',
              channel: rule.channel,
              severity: 'alta',
            });
          }
        }
      } else if (rule.type === 'margin_below') {
        for (const sku of skus) {
          if (
            target !== 'todos' &&
            sku.asin.toLowerCase() !== target &&
            sku.sku.toLowerCase() !== target
          ) {
            continue;
          }
          const econ = calculateUnitEconomics({
            salePrice: sku.salePrice,
            unitCost: sku.unitCost,
            inboundShipping: sku.inboundShipping,
            packagingCost: sku.packagingCost,
            category: sku.category,
            fulfillment: sku.fulfillment,
            weightGrams: sku.weightGrams,
            taxPercent: sku.taxPercent,
            acosPercent: sku.acosPercent,
          });
          if (econ.marginPercent <= rule.thresholdValue) {
            triggered.push({
              id: `trig-${rule.id}-${sku.id}`,
              ruleId: rule.id,
              ruleName: rule.name,
              targetLabel: `${sku.title} (${sku.asin})`,
              currentValueText: `${econ.marginPercent.toFixed(1)}%`,
              thresholdText: `abaixo de ${rule.thresholdValue}%`,
              channel: rule.channel,
              severity: 'media',
            });
          }
        }
      }
    }

    res.json({ triggered });
  });

  // --- ADMIN SUBSCRIBER MANAGEMENT (ADMIN_FULL ONLY) ---
  const getOrInitSubscribers = async (
    db: WorkspaceState
  ): Promise<SubscriberRecord[]> => {
    if (!db.subscribers) {
      db.subscribers = [...SEED_SUBSCRIBERS];
      await saveDb(db);
    }
    return db.subscribers;
  };

  app.get('/api/admin/subscribers', async (req, res) => {
    const auth = await requireSubscriberAdmin(req, res);
    if (!auth) return;
    const subscribers = await getOrInitSubscribers(auth.db);
    if (auth.user.role === 'ADMIN_PAID') {
      return res.json({
        subscribers: subscribers.filter((s) => s.status !== 'Trial'),
      });
    }
    res.json({ subscribers });
  });

  app.post('/api/admin/subscribers', async (req, res) => {
    const auth = await requireAdminFull(req, res);
    if (!auth) return;
    const subscribers = await getOrInitSubscribers(auth.db);
    const body = req.body as Partial<SubscriberRecord> & { initialPassword?: string };

    if (!body.name || !body.email) {
      return res.status(400).json({ error: 'Informe nome e e-mail do assinante.' });
    }

    const emailLower = body.email.trim().toLowerCase();
    if (subscribers.some((s) => s.email.toLowerCase() === emailLower)) {
      return res.status(409).json({ error: 'Já existe um assinante cadastrado com este e-mail.' });
    }

    const plan: SubscriberPlan = body.plan || 'Pro';
    const status: SubscriberStatus = (body.status as SubscriberStatus) || 'Trial';
    const phone = (body.phone || '').trim();
    const amazonAccountId = normalizeAmazonId(body.amazonAccountId || '');
    const today = todayIso();
    const trialStartedAt = body.trialStartedAt || today;
    const trialEndsAt = body.trialEndsAt || addDaysIso(trialStartedAt, FREE_TRIAL_DAYS);
    const accessGranted =
      typeof body.accessGranted === 'boolean'
        ? body.accessGranted
        : status !== 'Suspenso';
    const isPaidAdmin = Boolean(body.isPaidAdmin);
    const defaults = PLAN_DEFAULTS[plan];

    const entry: SubscriberRecord = {
      id: `sub-${crypto.randomUUID().slice(0, 8)}`,
      name: body.name.trim(),
      email: emailLower,
      phone,
      amazonAccountId,
      companyName: (body.companyName || `${body.name.trim()} Store`).trim(),
      plan,
      monthlyPrice: Number(body.monthlyPrice ?? defaults.monthlyPrice),
      status,
      accessGranted,
      isPaidAdmin,
      trialStartedAt,
      trialEndsAt,
      skusLimit: Number(body.skusLimit ?? defaults.skusLimit),
      skusUsed: Number(body.skusUsed ?? 0),
      paymentMethod: (body.paymentMethod as PaymentMethod) || 'Cartão',
      nextBillingDate:
        body.nextBillingDate ||
        (status === 'Trial' ? trialEndsAt : addDaysIso(today, 30)),
      createdAt: today,
    };

    // Provision login account for the subscriber if not already in db.users
    if (!auth.db.users.some((u) => normalizeEmail(u.email) === emailLower)) {
      const uid = `user-${crypto.randomUUID().slice(0, 8)}`;
      auth.db.users.push({
        id: uid,
        name: entry.name,
        email: entry.email,
        phone: entry.phone,
        amazonAccountId: entry.amazonAccountId,
        companyName: entry.companyName,
        taxRegime: 'Simples Nacional',
        defaultTaxRate: 6.5,
        avatarUrl: AVATAR_URL,
        role: isPaidAdmin ? 'ADMIN_PAID' : 'SUBSCRIBER',
        passwordHash: hashPassword(body.initialPassword || '123456'),
      });
      auth.db.competitors[uid] = [...SEED_COMPETITORS];
      auth.db.storeSkus[uid] = [...SEED_STORE_SKUS];
      auth.db.supplierBatches[uid] = [];
      auth.db.plannerScenarios[uid] = [...SEED_PLANNER_SCENARIOS];
      auth.db.alertSettings = auth.db.alertSettings || {};
      auth.db.alertSettings[uid] = createDefaultAlertConfig(entry.email);
    }

    registerTrialIdentity(auth.db, {
      email: entry.email,
      phone: entry.phone,
      amazonAccountId: entry.amazonAccountId,
      trialStartedAt: entry.trialStartedAt,
      trialEndsAt: entry.trialEndsAt,
    });

    auth.db.subscribers = [entry, ...subscribers];
    await saveDb(auth.db);
    res.status(201).json({ subscriber: entry, subscribers: auth.db.subscribers });
  });

  app.patch('/api/admin/subscribers/:id', async (req, res) => {
    const auth = await requireSubscriberAdmin(req, res);
    if (!auth) return;
    const subscribers = await getOrInitSubscribers(auth.db);
    const idx = subscribers.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Assinante não encontrado.' });
    }

    const rawPatch = req.body as Partial<SubscriberRecord>;
    const current = subscribers[idx];
    const isFullAdmin = auth.user.role === 'ADMIN_FULL';

    if (!isFullAdmin) {
      if (current.status === 'Trial') {
        return res.status(403).json({
          error:
            'Administradores selecionados só podem gerenciar assinantes pagos e suas assinaturas.',
        });
      }
      if (
        rawPatch.isPaidAdmin !== undefined &&
        Boolean(rawPatch.isPaidAdmin) !== Boolean(current.isPaidAdmin)
      ) {
        return res.status(403).json({
          error:
            'Somente o Administrador FULL pode selecionar ou remover administradores.',
        });
      }
      if (rawPatch.status === 'Trial') {
        return res.status(403).json({
          error: 'Não é permitido converter assinante pago para Trial por este perfil.',
        });
      }
    }

    // Limit patch fields for ADMIN_PAID strictly to subscription access & plan management
    const patch: Partial<SubscriberRecord> = isFullAdmin
      ? rawPatch
      : {
          accessGranted: rawPatch.accessGranted,
          status: rawPatch.status,
          plan: rawPatch.plan,
          nextBillingDate: rawPatch.nextBillingDate,
        };

    const prevEmail = current.email.toLowerCase();
    const nextPlan = patch.plan || current.plan;
    const planChanged = Boolean(patch.plan && patch.plan !== current.plan);
    const defaults = PLAN_DEFAULTS[nextPlan];
    const nextStatus = patch.status || current.status;
    const nextAccess =
      typeof patch.accessGranted === 'boolean'
        ? patch.accessGranted
        : patch.status
          ? nextStatus !== 'Suspenso'
          : current.accessGranted;
    const nextIsPaidAdmin = isFullAdmin
      ? patch.isPaidAdmin !== undefined
        ? Boolean(patch.isPaidAdmin)
        : Boolean(current.isPaidAdmin)
      : Boolean(current.isPaidAdmin);

    const updated: SubscriberRecord = {
      ...current,
      ...patch,
      id: current.id,
      email: (patch.email || current.email).trim().toLowerCase(),
      phone: (patch.phone !== undefined ? patch.phone : current.phone || '').trim(),
      amazonAccountId: normalizeAmazonId(
        patch.amazonAccountId !== undefined
          ? patch.amazonAccountId
          : current.amazonAccountId || ''
      ),
      name: (patch.name || current.name).trim(),
      companyName: (patch.companyName || current.companyName).trim(),
      plan: nextPlan,
      status: nextStatus,
      accessGranted: nextAccess,
      isPaidAdmin: nextIsPaidAdmin,
      trialStartedAt: patch.trialStartedAt || current.trialStartedAt || current.createdAt,
      trialEndsAt:
        patch.trialEndsAt ||
        current.trialEndsAt ||
        addDaysIso(current.createdAt || todayIso(), FREE_TRIAL_DAYS),
      monthlyPrice:
        patch.monthlyPrice !== undefined
          ? Number(patch.monthlyPrice)
          : planChanged
            ? defaults.monthlyPrice
            : current.monthlyPrice,
      skusLimit:
        patch.skusLimit !== undefined
          ? Number(patch.skusLimit)
          : planChanged
            ? defaults.skusLimit
            : current.skusLimit,
    };

    // Sync corresponding subscriber user account (or create on grant access / admin selection)
    const userIdx = auth.db.users.findIndex(
      (u) => normalizeEmail(u.email) === prevEmail && u.role !== 'ADMIN_FULL'
    );
    const nextRole = updated.isPaidAdmin ? 'ADMIN_PAID' : 'SUBSCRIBER';
    if (userIdx !== -1) {
      auth.db.users[userIdx] = {
        ...auth.db.users[userIdx],
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        amazonAccountId: updated.amazonAccountId,
        companyName: updated.companyName,
        role: nextRole,
      };
    } else if (
      (updated.accessGranted || updated.isPaidAdmin) &&
      !auth.db.users.some((u) => normalizeEmail(u.email) === updated.email)
    ) {
      const uid = `user-${crypto.randomUUID().slice(0, 8)}`;
      auth.db.users.push({
        id: uid,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        amazonAccountId: updated.amazonAccountId,
        companyName: updated.companyName,
        taxRegime: 'Simples Nacional',
        defaultTaxRate: 6.5,
        avatarUrl: AVATAR_URL,
        role: nextRole,
        passwordHash: hashPassword('123456'),
      });
      auth.db.competitors[uid] = [...SEED_COMPETITORS];
      auth.db.storeSkus[uid] = [...SEED_STORE_SKUS];
      auth.db.supplierBatches[uid] = [];
      auth.db.plannerScenarios[uid] = [...SEED_PLANNER_SCENARIOS];
      auth.db.alertSettings = auth.db.alertSettings || {};
      auth.db.alertSettings[uid] = createDefaultAlertConfig(updated.email);
    }

    registerTrialIdentity(auth.db, {
      email: updated.email,
      phone: updated.phone,
      amazonAccountId: updated.amazonAccountId,
      trialStartedAt: updated.trialStartedAt,
      trialEndsAt: updated.trialEndsAt,
    });

    subscribers[idx] = updated;
    auth.db.subscribers = subscribers;
    await saveDb(auth.db);

    const responseList = isFullAdmin
      ? subscribers
      : subscribers.filter((s) => s.status !== 'Trial');
    res.json({ subscriber: updated, subscribers: responseList });
  });

  app.delete('/api/admin/subscribers/:id', async (req, res) => {
    const auth = await requireAdminFull(req, res);
    if (!auth) return;
    const subscribers = await getOrInitSubscribers(auth.db);
    const target = subscribers.find((s) => s.id === req.params.id);
    if (target) {
      auth.db.users = auth.db.users.filter(
        (u) => u.role === 'ADMIN_FULL' || u.email.toLowerCase() !== target.email.toLowerCase()
      );
    }
    auth.db.subscribers = subscribers.filter((s) => s.id !== req.params.id);
    await saveDb(auth.db);
    res.json({ subscribers: auth.db.subscribers });
  });

  // --- ADMIN FULL ACCOUNT MANAGEMENT (ADMIN_FULL ONLY) ---
  const listFullAdmins = (
    db: WorkspaceState,
    currentUserId: string
  ): AdminFullRecord[] =>
    db.users
      .filter((u) => u.role === 'ADMIN_FULL')
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone || '',
        companyName: u.companyName,
        isCurrentUser: u.id === currentUserId,
      }));

  app.get('/api/admin/full-admins', async (req, res) => {
    const auth = await requireAdminFull(req, res);
    if (!auth) return;
    res.json({ admins: listFullAdmins(auth.db, auth.user.id) });
  });

  app.post('/api/admin/full-admins', async (req, res) => {
    const auth = await requireAdminFull(req, res);
    if (!auth) return;
    const { name, email, phone, companyName, password } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      companyName?: string;
      password?: string;
    };

    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({
        error: 'Informe nome e e-mail do Administrador FULL.',
      });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({
        error: 'Informe uma senha com pelo menos 6 caracteres.',
      });
    }

    const emailNorm = normalizeEmail(email);
    const existing = auth.db.users.find((u) => normalizeEmail(u.email) === emailNorm);
    if (existing) {
      return res.status(409).json({
        error:
          existing.role === 'ADMIN_FULL'
            ? 'Já existe um Administrador FULL com este e-mail.'
            : 'Este e-mail já pertence a um assinante cadastrado. Use outro e-mail para o Administrador FULL.',
      });
    }

    const newId = `admin-${crypto.randomUUID().slice(0, 8)}`;
    const created: StoredUser = {
      id: newId,
      name: name.trim(),
      email: emailNorm,
      phone: (phone || '').trim(),
      amazonAccountId: `ADMIN-${newId.slice(-4).toUpperCase()}`,
      companyName: (companyName || 'AmzHub BR Administração').trim(),
      taxRegime: 'Lucro Presumido',
      defaultTaxRate: 6.5,
      avatarUrl: AVATAR_URL,
      role: 'ADMIN_FULL',
      passwordHash: hashPassword(password),
    };

    auth.db.users.unshift(created);
    auth.db.competitors[newId] = [...SEED_COMPETITORS];
    auth.db.storeSkus[newId] = [...SEED_STORE_SKUS];
    auth.db.supplierBatches[newId] = [];
    auth.db.plannerScenarios[newId] = [...SEED_PLANNER_SCENARIOS];
    auth.db.alertSettings = auth.db.alertSettings || {};
    auth.db.alertSettings[newId] = createDefaultAlertConfig(created.email);

    await saveDb(auth.db);
    res.status(201).json({
      admin: {
        id: created.id,
        name: created.name,
        email: created.email,
        phone: created.phone || '',
        companyName: created.companyName,
        isCurrentUser: false,
      },
      admins: listFullAdmins(auth.db, auth.user.id),
    });
  });

  app.patch('/api/admin/full-admins/:id', async (req, res) => {
    const auth = await requireAdminFull(req, res);
    if (!auth) return;
    const idx = auth.db.users.findIndex(
      (u) => u.id === req.params.id && u.role === 'ADMIN_FULL'
    );
    if (idx === -1) {
      return res.status(404).json({ error: 'Administrador FULL não encontrado.' });
    }

    const { name, email, phone, companyName, password } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      companyName?: string;
      password?: string;
    };

    const current = auth.db.users[idx];
    const nextEmail = email ? normalizeEmail(email) : current.email;
    if (
      nextEmail !== normalizeEmail(current.email) &&
      auth.db.users.some((u) => u.id !== current.id && normalizeEmail(u.email) === nextEmail)
    ) {
      return res.status(409).json({
        error: 'Este e-mail já está em uso por outra conta.',
      });
    }

    if (password && password.length > 0 && password.length < 6) {
      return res.status(400).json({
        error: 'A nova senha deve ter pelo menos 6 caracteres.',
      });
    }

    auth.db.users[idx] = {
      ...current,
      name: name !== undefined ? name.trim() || current.name : current.name,
      email: nextEmail,
      phone: phone !== undefined ? phone.trim() : current.phone,
      companyName:
        companyName !== undefined
          ? companyName.trim() || current.companyName
          : current.companyName,
      passwordHash:
        password && password.length >= 6 ? hashPassword(password) : current.passwordHash,
    };

    await saveDb(auth.db);
    const updatedUser = auth.db.users[idx];
    res.json({
      admin: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone || '',
        companyName: updatedUser.companyName,
        isCurrentUser: updatedUser.id === auth.user.id,
      },
      admins: listFullAdmins(auth.db, auth.user.id),
      updatedCurrentUser:
        updatedUser.id === auth.user.id ? sanitizeUser(updatedUser, auth.db) : undefined,
    });
  });

  app.delete('/api/admin/full-admins/:id', async (req, res) => {
    const auth = await requireAdminFull(req, res);
    if (!auth) return;
    const fullAdmins = auth.db.users.filter((u) => u.role === 'ADMIN_FULL');
    const target = fullAdmins.find((u) => u.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Administrador FULL não encontrado.' });
    }
    if (fullAdmins.length <= 1) {
      return res.status(400).json({
        error: 'Não é possível excluir o único Administrador FULL ativo no sistema.',
      });
    }
    if (target.id === auth.user.id) {
      return res.status(400).json({
        error:
          'Você não pode excluir sua própria conta enquanto estiver logado nela. Entre com outro Administrador FULL para excluí-la.',
      });
    }

    auth.db.users = auth.db.users.filter((u) => u.id !== target.id);
    delete auth.db.competitors[target.id];
    delete auth.db.storeSkus[target.id];
    delete auth.db.supplierBatches[target.id];
    delete auth.db.plannerScenarios[target.id];
    if (auth.db.alertSettings) delete auth.db.alertSettings[target.id];

    await saveDb(auth.db);
    res.json({ admins: listFullAdmins(auth.db, auth.user.id) });
  });

  // Vite middleware in dev, static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AmzHub BR server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
