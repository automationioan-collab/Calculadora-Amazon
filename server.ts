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
  AlertNotificationConfig,
  AlertRule,
  CompetitorWatch,
  MarketProduct,
  PlannerInputs,
  StoreSku,
  SupplierAnalyzedItem,
  SupplierBatch,
  SupplierRowInput,
  TriggeredAlert,
  UserProfile,
} from './src/types';
import {
  createDefaultAlertConfig,
  SEED_COMPETITORS,
  SEED_MARKET_PRODUCTS,
  SEED_PLANNER_SCENARIOS,
  SEED_STORE_SKUS,
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
}

const DEMO_USER_ID = 'user-demo-br';
const AVATAR_URL = '/src/assets/images/seller_profile_avatar_1794711815395.jpg';

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
    return JSON.parse(raw) as WorkspaceState;
  } catch {
    const initial: WorkspaceState = {
      users: [
        {
          id: DEMO_USER_ID,
          name: 'Rafael Mendes',
          email: 'demo@amzhub.com.br',
          companyName: 'Mendes Comércio Digital Ltda',
          taxRegime: 'Simples Nacional',
          defaultTaxRate: 6.5,
          avatarUrl: AVATAR_URL,
          passwordHash: hashPassword('demo1234'),
        },
      ],
      competitors: {
        [DEMO_USER_ID]: SEED_COMPETITORS,
      },
      storeSkus: {
        [DEMO_USER_ID]: SEED_STORE_SKUS,
      },
      supplierBatches: {
        [DEMO_USER_ID]: [],
      },
      plannerScenarios: {
        [DEMO_USER_ID]: SEED_PLANNER_SCENARIOS,
      },
      alertSettings: {
        [DEMO_USER_ID]: createDefaultAlertConfig('demo@amzhub.com.br'),
      },
    };
    await fs.writeFile(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

async function saveDb(state: WorkspaceState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function sanitizeUser(u: StoredUser): UserProfile {
  const { passwordHash: _ignored, ...rest } = u;
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

  // --- AUTH ROUTES ---
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha para entrar.' });
    }
    const db = await ensureDb();
    const user = db.users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }
    const token = signToken(user.id);
    res.json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/demo', async (_req, res) => {
    const db = await ensureDb();
    const demoUser = db.users.find((u) => u.id === DEMO_USER_ID) || db.users[0];
    const token = signToken(demoUser.id);
    res.json({ token, user: sanitizeUser(demoUser) });
  });

  app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, companyName } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      companyName?: string;
    };
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({
        error: 'Preencha nome, e-mail válido e senha com pelo menos 6 caracteres.',
      });
    }
    const db = await ensureDb();
    const exists = db.users.some(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (exists) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }
    const newId = `user-${crypto.randomUUID().slice(0, 8)}`;
    const newUser: StoredUser = {
      id: newId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      companyName: (companyName || `${name.trim()} Store`).trim(),
      taxRegime: 'Simples Nacional',
      defaultTaxRate: 6.5,
      avatarUrl: AVATAR_URL,
      passwordHash: hashPassword(password),
    };
    db.users.push(newUser);
    db.competitors[newId] = [...SEED_COMPETITORS];
    db.storeSkus[newId] = [...SEED_STORE_SKUS];
    db.supplierBatches[newId] = [];
    db.plannerScenarios[newId] = [...SEED_PLANNER_SCENARIOS];
    db.alertSettings = db.alertSettings || {};
    db.alertSettings[newId] = createDefaultAlertConfig(newUser.email);
    await saveDb(db);

    const token = signToken(newId);
    res.status(201).json({ token, user: sanitizeUser(newUser) });
  });

  app.get('/api/auth/me', async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    res.json({ user: sanitizeUser(auth.user) });
  });

  // --- MARKET EXPLORER (MZMarket style) ---
  app.get('/api/market/products', async (req, res) => {
    const auth = await requireUser(req, res);
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
    const auth = await requireUser(req, res);
    if (!auth) return;
    const batches = auth.db.supplierBatches[auth.user.id] || [];
    res.json({ batches });
  });

  app.post('/api/supplier/analyze', async (req, res) => {
    const auth = await requireUser(req, res);
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
    const auth = await requireUser(req, res);
    if (!auth) return;
    res.json({ competitors: auth.db.competitors[auth.user.id] || [] });
  });

  app.post('/api/competitors', async (req, res) => {
    const auth = await requireUser(req, res);
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
    const auth = await requireUser(req, res);
    if (!auth) return;
    const current = auth.db.competitors[auth.user.id] || [];
    auth.db.competitors[auth.user.id] = current.filter((c) => c.id !== req.params.id);
    await saveDb(auth.db);
    res.json({ ok: true });
  });

  // --- STORE SKUS (Gestão de Loja) ---
  app.get('/api/store/skus', async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    res.json({ skus: auth.db.storeSkus[auth.user.id] || [] });
  });

  app.post('/api/store/skus', async (req, res) => {
    const auth = await requireUser(req, res);
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
    const auth = await requireUser(req, res);
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
    const auth = await requireUser(req, res);
    if (!auth) return;
    const current = auth.db.storeSkus[auth.user.id] || [];
    auth.db.storeSkus[auth.user.id] = current.filter((s) => s.id !== req.params.id);
    await saveDb(auth.db);
    res.json({ ok: true });
  });

  // --- PLANNER SCENARIOS (MZPlanner style) ---
  app.get('/api/planner/scenarios', async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    res.json({ scenarios: auth.db.plannerScenarios[auth.user.id] || [] });
  });

  app.post('/api/planner/scenarios', async (req, res) => {
    const auth = await requireUser(req, res);
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
    const auth = await requireUser(req, res);
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
    const auth = await requireUser(req, res);
    if (!auth) return;
    const config = await getOrInitAlertConfig(auth.db, auth.user);
    res.json({ config });
  });

  app.put('/api/alerts/channels', async (req, res) => {
    const auth = await requireUser(req, res);
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
    const auth = await requireUser(req, res);
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
    const auth = await requireUser(req, res);
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
    const auth = await requireUser(req, res);
    if (!auth) return;
    const config = await getOrInitAlertConfig(auth.db, auth.user);
    config.rules = config.rules.filter((r) => r.id !== req.params.id);
    auth.db.alertSettings![auth.user.id] = config;
    await saveDb(auth.db);
    res.json({ config });
  });

  app.post('/api/alerts/evaluate', async (req, res) => {
    const auth = await requireUser(req, res);
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

  // Vite middleware in dev, static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
