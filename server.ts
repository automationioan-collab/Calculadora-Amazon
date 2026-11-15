import crypto from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import { and, eq } from 'drizzle-orm';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { db } from './src/db/index.ts';
import {
  alertSettings,
  competitors,
  plannerScenarios,
  storeSkus,
  subscribers,
  supplierBatches,
  users,
} from './src/db/schema.ts';
import {
  addDaysIso,
  AVATAR_URL,
  ensureSeeded,
  getUserByEmail,
  hashPassword,
  normalizeAmazonId,
  normalizeEmail,
  normalizePhone,
  seedWorkspaceForUser,
  todayIso,
} from './src/db/users.ts';
import {
  calculateRemainingTrialDays,
  computeUserSubscriptionInfoDb,
  evaluateTrialEligibilityDb,
  getCompetitors,
  getOrInitAlertConfigDb,
  getPlannerScenarios,
  getStoreSkus,
  getSupplierBatches,
  listFullAdminsDb,
  listSubscribers,
  registerTrialIdentityDb,
  sanitizeDbUser,
} from './src/db/repository.ts';
import {
  requireActiveWorkspace,
  requireAdminFull,
  requireAuth,
  requireSubscriberAdmin,
  signSessionToken,
  type AuthRequest,
} from './src/middleware/auth.ts';
import { calculateUnitEconomics } from './src/utils/amazonBr.ts';
import type {
  AlertNotificationConfig,
  AlertRule,
  CompetitorWatch,
  MarketProduct,
  PaymentMethod,
  PlannerInputs,
  StoreSku,
  SubscriberPlan,
  SubscriberRecord,
  SubscriberStatus,
  SupplierAnalyzedItem,
  SupplierBatch,
  SupplierRowInput,
  TriggeredAlert,
} from './src/types.ts';
import {
  FREE_TRIAL_DAYS,
  PLAN_DEFAULTS,
  SEED_MARKET_PRODUCTS,
  SEED_STORE_SKUS,
} from './server/seedData.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // --- AUTH & FREE TRIAL RECOGNITION ROUTES ---
  app.post('/api/auth/check-free-eligibility', async (req, res) => {
    try {
      const { email, phone, amazonAccountId } = req.body as {
        email?: string;
        phone?: string;
        amazonAccountId?: string;
      };
      const result = await evaluateTrialEligibilityDb({
        email,
        phone,
        amazonAccountId,
      });
      res.json(result);
    } catch (error) {
      console.error('Eligibility check failed:', error);
      res.status(500).json({ error: 'Erro ao verificar elegibilidade gratuita.' });
    }
  });

  app.post('/api/auth/google', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.authUser!;
      if (user.role !== 'ADMIN_FULL') {
        const subs = await listSubscribers();
        const subRecord = subs.find(
          (s) => normalizeEmail(s.email) === normalizeEmail(user.email)
        );
        if (
          subRecord &&
          subRecord.status === 'Suspenso' &&
          !subRecord.accessGranted
        ) {
          return res.status(403).json({
            error: 'Acesso suspenso pelo Administrador FULL.',
          });
        }
      }
      const sanitized = await sanitizeDbUser(user);
      res.json({ user: sanitized });
    } catch (error) {
      console.error('Google auth sync failed:', error);
      res.status(500).json({ error: 'Falha ao autenticar conta Google.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body as {
        email?: string;
        password?: string;
      };
      if (!email || !password) {
        return res
          .status(400)
          .json({ error: 'Informe e-mail e senha para entrar.' });
      }
      const user = await getUserByEmail(email);
      if (!user || !user.passwordHash || user.passwordHash !== hashPassword(password)) {
        return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      }

      if (user.role !== 'ADMIN_FULL') {
        const subs = await listSubscribers();
        const subRecord = subs.find(
          (s) => normalizeEmail(s.email) === normalizeEmail(user.email)
        );
        if (
          subRecord &&
          subRecord.status === 'Suspenso' &&
          !subRecord.accessGranted
        ) {
          return res.status(403).json({
            error: 'Acesso suspenso pelo Administrador FULL.',
          });
        }
      }

      const token = signSessionToken(user.uid);
      const sanitized = await sanitizeDbUser(user);
      res.json({ token, user: sanitized });
    } catch (error) {
      console.error('Login failed:', error);
      res.status(500).json({ error: 'Erro interno ao autenticar.' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, phone, amazonAccountId, password, companyName } =
        req.body as {
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
          error:
            'Preencha nome, e-mail válido e senha com pelo menos 6 caracteres.',
        });
      }
      if (cleanPhoneDigits.length < 10) {
        return res.status(400).json({
          error:
            'Informe um telefone/WhatsApp válido com DDD para validar os 25 dias FREE.',
        });
      }
      if (cleanAmazonId.length < 4) {
        return res.status(400).json({
          error:
            'Informe sua Conta da Amazon (Seller ID ou código da loja) para validar os 25 dias FREE.',
        });
      }

      await ensureSeeded();
      const emailNorm = normalizeEmail(email);
      const existing = await getUserByEmail(emailNorm);
      if (existing) {
        return res.status(409).json({
          error:
            'Este e-mail já está cadastrado. Faça login para verificar seu status.',
        });
      }

      const eligibility = await evaluateTrialEligibilityDb({
        email: emailNorm,
        phone: cleanPhoneDigits,
        amazonAccountId: cleanAmazonId,
      });

      const today = todayIso();
      const trialStartedAt =
        eligibility.matchedFields.length > 0 && eligibility.trialEndsAt
          ? addDaysIso(eligibility.trialEndsAt, -FREE_TRIAL_DAYS)
          : today;
      const trialEndsAt =
        eligibility.matchedFields.length > 0 && eligibility.trialEndsAt
          ? eligibility.trialEndsAt
          : addDaysIso(today, FREE_TRIAL_DAYS);
      const daysLeft = calculateRemainingTrialDays(trialEndsAt);
      const initialStatus: SubscriberStatus =
        daysLeft > 0 ? 'Trial' : 'Inadimplente';
      const initialAccess = daysLeft > 0;

      const newUid = `user-${crypto.randomUUID().slice(0, 8)}`;
      const [createdUser] = await db
        .insert(users)
        .values({
          uid: newUid,
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
        })
        .returning();

      await seedWorkspaceForUser(newUid, emailNorm);

      await db.insert(subscribers).values({
        id: `sub-${newUid}`,
        name: createdUser.name,
        email: createdUser.email,
        phone: createdUser.phone,
        amazonAccountId: cleanAmazonId,
        companyName: createdUser.companyName,
        plan: 'Starter',
        monthlyPrice: PLAN_DEFAULTS.Starter.monthlyPrice,
        status: initialStatus,
        accessGranted: initialAccess,
        isPaidAdmin: false,
        trialStartedAt,
        trialEndsAt,
        skusLimit: PLAN_DEFAULTS.Starter.skusLimit,
        skusUsed: SEED_STORE_SKUS.length,
        paymentMethod: 'PIX',
        nextBillingDate: trialEndsAt,
        createdAt: today,
      });

      await registerTrialIdentityDb({
        email: createdUser.email,
        phone: createdUser.phone || cleanPhoneDigits,
        amazonAccountId: cleanAmazonId,
        trialStartedAt,
        trialEndsAt,
      });

      const token = signSessionToken(newUid);
      const sanitized = await sanitizeDbUser(createdUser);
      res.status(201).json({ token, user: sanitized, eligibility });
    } catch (error) {
      console.error('Register failed:', error);
      res.status(500).json({ error: 'Erro ao criar conta no banco de dados.' });
    }
  });

  app.post('/api/subscription/activate', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.authUser!;
      const { plan, paymentMethod } = req.body as {
        plan?: SubscriberPlan;
        paymentMethod?: PaymentMethod;
      };
      const chosenPlan: SubscriberPlan =
        plan && PLAN_DEFAULTS[plan] ? plan : 'Pro';
      const chosenMethod: PaymentMethod = paymentMethod || 'PIX';
      const defaults = PLAN_DEFAULTS[chosenPlan];
      const nextBilling = addDaysIso(todayIso(), 30);
      const emailNorm = normalizeEmail(user.email);

      const existing = await db
        .select()
        .from(subscribers)
        .where(eq(subscribers.email, emailNorm))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(subscribers)
          .set({
            plan: chosenPlan,
            monthlyPrice: defaults.monthlyPrice,
            skusLimit: defaults.skusLimit,
            status: 'Ativo',
            accessGranted: true,
            paymentMethod: chosenMethod,
            nextBillingDate: nextBilling,
          })
          .where(eq(subscribers.id, existing[0].id));
      } else {
        const today = todayIso();
        const userSkus = await getStoreSkus(user.uid);
        await db.insert(subscribers).values({
          id: `sub-${user.uid.slice(0, 12)}`,
          name: user.name,
          email: emailNorm,
          phone: user.phone || '',
          amazonAccountId: user.amazonAccountId || '',
          companyName: user.companyName,
          plan: chosenPlan,
          monthlyPrice: defaults.monthlyPrice,
          status: 'Ativo',
          accessGranted: true,
          isPaidAdmin: false,
          trialStartedAt: today,
          trialEndsAt: addDaysIso(today, FREE_TRIAL_DAYS),
          skusLimit: defaults.skusLimit,
          skusUsed: userSkus.length,
          paymentMethod: chosenMethod,
          nextBillingDate: nextBilling,
          createdAt: today,
        });
      }

      const sanitized = await sanitizeDbUser(user);
      res.json({ user: sanitized });
    } catch (error) {
      console.error('Subscription activation failed:', error);
      res.status(500).json({ error: 'Erro ao ativar assinatura.' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const sanitized = await sanitizeDbUser(req.authUser!);
      res.json({ user: sanitized });
    } catch (error) {
      console.error('Get me failed:', error);
      res.status(500).json({ error: 'Erro ao carregar perfil.' });
    }
  });

  // --- MARKET EXPLORER ---
  app.get(
    '/api/market/products',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      const q = String(req.query.q || '').trim().toLowerCase();
      const category = String(req.query.category || 'Todas');
      const mode = String(req.query.mode || 'Todos');
      const maxBsr = Number(req.query.maxBsr || 999999);
      const maxSellers = Number(req.query.maxSellers || 999);
      const minPrice = Number(req.query.minPrice || 0);
      const maxPrice = Number(req.query.maxPrice || 999999);

      const filtered: MarketProduct[] = SEED_MARKET_PRODUCTS.filter((p) => {
        if (
          q &&
          !p.title.toLowerCase().includes(q) &&
          !p.asin.toLowerCase().includes(q) &&
          !p.brand.toLowerCase().includes(q)
        ) {
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
    }
  );

  // --- SUPPLIER BULK ANALYZER ---
  app.get(
    '/api/supplier/batches',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const batches = await getSupplierBatches(req.authUser!.uid);
        res.json({ batches });
      } catch (error) {
        console.error('Failed to fetch supplier batches:', error);
        res.status(500).json({ error: 'Erro ao buscar lotes de fornecedores.' });
      }
    }
  );

  app.post(
    '/api/supplier/analyze',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const user = req.authUser!;
        const { batchName, taxRate, rows } = req.body as {
          batchName?: string;
          taxRate?: number;
          rows?: SupplierRowInput[];
        };

        if (!Array.isArray(rows) || rows.length === 0) {
          return res
            .status(400)
            .json({ error: 'Envie ao menos um item na lista do fornecedor.' });
        }

        const effectiveTax =
          typeof taxRate === 'number' ? taxRate : user.defaultTaxRate;
        const analyzed: SupplierAnalyzedItem[] = rows.map((row, idx) => {
          const key = row.eanOrAsin.trim().toLowerCase();
          const matched = SEED_MARKET_PRODUCTS.find(
            (m) =>
              m.asin.toLowerCase() === key ||
              m.ean.toLowerCase() === key ||
              m.title
                .toLowerCase()
                .includes(row.productName.toLowerCase().slice(0, 14))
          );

          const category = matched?.category ?? 'Casa e Cozinha';
          const amazonPrice =
            matched?.price ?? Number((row.supplierCost * 2.15).toFixed(2));
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

        await db.insert(supplierBatches).values({
          id: batch.id,
          userUid: user.uid,
          batchName: batch.batchName,
          createdAt: batch.createdAt,
          taxRate: batch.taxRate,
          items: batch.items,
        });

        res.status(201).json({ batch });
      } catch (error) {
        console.error('Supplier analysis failed:', error);
        res.status(500).json({ error: 'Erro ao salvar análise de fornecedor.' });
      }
    }
  );

  // --- COMPETITOR SPY ---
  app.get(
    '/api/competitors',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const list = await getCompetitors(req.authUser!.uid);
        res.json({ competitors: list });
      } catch (error) {
        console.error('Failed to fetch competitors:', error);
        res.status(500).json({ error: 'Erro ao carregar concorrentes.' });
      }
    }
  );

  app.post(
    '/api/competitors',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const { sellerName, sellerId, primaryAsin } = req.body as {
          sellerName?: string;
          sellerId?: string;
          primaryAsin?: string;
        };

        if (!sellerName || !primaryAsin) {
          return res
            .status(400)
            .json({ error: 'Informe o nome da loja e o ASIN principal.' });
        }

        const catalogMatch = SEED_MARKET_PRODUCTS.find(
          (p) => p.asin.toLowerCase() === primaryAsin.trim().toLowerCase()
        );

        const entry: CompetitorWatch = {
          id: `comp-${crypto.randomUUID().slice(0, 8)}`,
          sellerName: sellerName.trim(),
          sellerId: (
            sellerId ||
            `A${Math.random().toString(36).substring(2, 11).toUpperCase()}BR`
          ).trim(),
          primaryAsin: primaryAsin.trim().toUpperCase(),
          productTitle:
            catalogMatch?.title ??
            `Oferta Amazon BR (${primaryAsin.trim().toUpperCase()})`,
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

        await db.insert(competitors).values({
          ...entry,
          userUid: req.authUser!.uid,
        });

        res.status(201).json({ competitor: entry });
      } catch (error) {
        console.error('Failed to create competitor:', error);
        res.status(500).json({ error: 'Erro ao adicionar concorrente.' });
      }
    }
  );

  app.delete(
    '/api/competitors/:id',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        await db
          .delete(competitors)
          .where(
            and(
              eq(competitors.id, req.params.id),
              eq(competitors.userUid, req.authUser!.uid)
            )
          );
        res.json({ ok: true });
      } catch (error) {
        console.error('Failed to delete competitor:', error);
        res.status(500).json({ error: 'Erro ao remover concorrente.' });
      }
    }
  );

  // --- STORE SKUS ---
  app.get(
    '/api/store/skus',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const list = await getStoreSkus(req.authUser!.uid);
        res.json({ skus: list });
      } catch (error) {
        console.error('Failed to fetch SKUs:', error);
        res.status(500).json({ error: 'Erro ao carregar SKUs da loja.' });
      }
    }
  );

  app.post(
    '/api/store/skus',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const user = req.authUser!;
        const payload = req.body as Partial<StoreSku>;
        if (
          !payload.title ||
          !payload.asin ||
          !payload.salePrice ||
          !payload.unitCost
        ) {
          return res.status(400).json({
            error: 'Preencha título, ASIN, preço de venda e custo unitário.',
          });
        }

        const newSku: StoreSku = {
          id: `sku-${crypto.randomUUID().slice(0, 8)}`,
          sku: (
            payload.sku || `AMZ-${Math.floor(100 + Math.random() * 900)}`
          ).trim(),
          asin: payload.asin.trim().toUpperCase(),
          title: payload.title.trim(),
          category: payload.category || 'Casa e Cozinha',
          fulfillment: payload.fulfillment || 'FBA',
          salePrice: Number(payload.salePrice),
          unitCost: Number(payload.unitCost),
          inboundShipping: Number(payload.inboundShipping ?? 4.5),
          packagingCost: Number(payload.packagingCost ?? 2.0),
          taxPercent: Number(payload.taxPercent ?? user.defaultTaxRate),
          acosPercent: Number(payload.acosPercent ?? 4.0),
          weightGrams: Number(payload.weightGrams ?? 750),
          stockUnits: Number(payload.stockUnits ?? 30),
          dailySalesVelocity: Number(payload.dailySalesVelocity ?? 2.0),
          buyBoxOwner: payload.buyBoxOwner || 'Sua Loja',
          updatedAt: new Date().toISOString(),
        };

        await db.insert(storeSkus).values({
          ...newSku,
          userUid: user.uid,
        });

        res.status(201).json({ sku: newSku });
      } catch (error) {
        console.error('Failed to create SKU:', error);
        res.status(500).json({ error: 'Erro ao criar SKU.' });
      }
    }
  );

  app.patch(
    '/api/store/skus/:id',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const user = req.authUser!;
        const existing = await db
          .select()
          .from(storeSkus)
          .where(
            and(
              eq(storeSkus.id, req.params.id),
              eq(storeSkus.userUid, user.uid)
            )
          )
          .limit(1);

        if (existing.length === 0) {
          return res.status(404).json({ error: 'SKU não encontrado.' });
        }

        const cur = existing[0];
        const patch = req.body as Partial<StoreSku>;
        const updatedAt = new Date().toISOString();

        const [updated] = await db
          .update(storeSkus)
          .set({
            sku: patch.sku ?? cur.sku,
            asin: patch.asin ?? cur.asin,
            title: patch.title ?? cur.title,
            category: patch.category ?? cur.category,
            fulfillment: patch.fulfillment ?? cur.fulfillment,
            salePrice:
              patch.salePrice !== undefined ? Number(patch.salePrice) : cur.salePrice,
            unitCost:
              patch.unitCost !== undefined ? Number(patch.unitCost) : cur.unitCost,
            inboundShipping:
              patch.inboundShipping !== undefined
                ? Number(patch.inboundShipping)
                : cur.inboundShipping,
            packagingCost:
              patch.packagingCost !== undefined
                ? Number(patch.packagingCost)
                : cur.packagingCost,
            taxPercent:
              patch.taxPercent !== undefined ? Number(patch.taxPercent) : cur.taxPercent,
            acosPercent:
              patch.acosPercent !== undefined
                ? Number(patch.acosPercent)
                : cur.acosPercent,
            weightGrams:
              patch.weightGrams !== undefined
                ? Number(patch.weightGrams)
                : cur.weightGrams,
            stockUnits:
              patch.stockUnits !== undefined ? Number(patch.stockUnits) : cur.stockUnits,
            dailySalesVelocity:
              patch.dailySalesVelocity !== undefined
                ? Number(patch.dailySalesVelocity)
                : cur.dailySalesVelocity,
            buyBoxOwner: patch.buyBoxOwner ?? cur.buyBoxOwner,
            updatedAt,
          })
          .where(
            and(
              eq(storeSkus.id, req.params.id),
              eq(storeSkus.userUid, user.uid)
            )
          )
          .returning();

        res.json({ sku: updated });
      } catch (error) {
        console.error('Failed to update SKU:', error);
        res.status(500).json({ error: 'Erro ao atualizar SKU.' });
      }
    }
  );

  app.delete(
    '/api/store/skus/:id',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        await db
          .delete(storeSkus)
          .where(
            and(
              eq(storeSkus.id, req.params.id),
              eq(storeSkus.userUid, req.authUser!.uid)
            )
          );
        res.json({ ok: true });
      } catch (error) {
        console.error('Failed to delete SKU:', error);
        res.status(500).json({ error: 'Erro ao remover SKU.' });
      }
    }
  );

  // --- PLANNER SCENARIOS ---
  app.get(
    '/api/planner/scenarios',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const list = await getPlannerScenarios(req.authUser!.uid);
        res.json({ scenarios: list });
      } catch (error) {
        console.error('Failed to fetch scenarios:', error);
        res.status(500).json({ error: 'Erro ao carregar cenários.' });
      }
    }
  );

  app.post(
    '/api/planner/scenarios',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const body = req.body as PlannerInputs;
        if (!body.name) {
          return res
            .status(400)
            .json({ error: 'Informe um nome para o cenário.' });
        }
        const scenario: PlannerInputs & { id: string } = {
          id: `plan-${crypto.randomUUID().slice(0, 8)}`,
          name: body.name,
          initialCapital: Number(body.initialCapital),
          averageTicket: Number(body.averageTicket),
          targetNetMarginPercent: Number(body.targetNetMarginPercent),
          reinvestmentPercent: Number(body.reinvestmentPercent),
          taxPercent: Number(body.taxPercent),
          restockCycleDays: Number(body.restockCycleDays),
          monthlyGrowthPercent: Number(body.monthlyGrowthPercent),
        };
        await db.insert(plannerScenarios).values({
          ...scenario,
          userUid: req.authUser!.uid,
        });
        res.status(201).json({ scenario });
      } catch (error) {
        console.error('Failed to create scenario:', error);
        res.status(500).json({ error: 'Erro ao salvar cenário.' });
      }
    }
  );

  app.delete(
    '/api/planner/scenarios/:id',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        await db
          .delete(plannerScenarios)
          .where(
            and(
              eq(plannerScenarios.id, req.params.id),
              eq(plannerScenarios.userUid, req.authUser!.uid)
            )
          );
        res.json({ ok: true });
      } catch (error) {
        console.error('Failed to delete scenario:', error);
        res.status(500).json({ error: 'Erro ao remover cenário.' });
      }
    }
  );

  // --- ALERT SETTINGS & NOTIFICATION RULES ---
  app.get(
    '/api/alerts',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const config = await getOrInitAlertConfigDb(
          req.authUser!.uid,
          req.authUser!.email
        );
        res.json({ config });
      } catch (error) {
        console.error('Failed to load alerts config:', error);
        res.status(500).json({ error: 'Erro ao carregar alertas.' });
      }
    }
  );

  app.put(
    '/api/alerts/channels',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const user = req.authUser!;
        const config = await getOrInitAlertConfigDb(user.uid, user.email);
        const {
          emailEnabled,
          notificationEmail,
          pushEnabled,
          quietHoursStart,
          quietHoursEnd,
        } = req.body as Partial<AlertNotificationConfig>;

        const updated: AlertNotificationConfig = {
          ...config,
          emailEnabled:
            typeof emailEnabled === 'boolean' ? emailEnabled : config.emailEnabled,
          notificationEmail:
            typeof notificationEmail === 'string' && notificationEmail.trim()
              ? notificationEmail.trim()
              : config.notificationEmail,
          pushEnabled:
            typeof pushEnabled === 'boolean' ? pushEnabled : config.pushEnabled,
          quietHoursStart: quietHoursStart || config.quietHoursStart,
          quietHoursEnd: quietHoursEnd || config.quietHoursEnd,
        };

        await db
          .update(alertSettings)
          .set({
            emailEnabled: updated.emailEnabled,
            notificationEmail: updated.notificationEmail,
            pushEnabled: updated.pushEnabled,
            quietHoursStart: updated.quietHoursStart,
            quietHoursEnd: updated.quietHoursEnd,
          })
          .where(eq(alertSettings.userUid, user.uid));

        res.json({ config: updated });
      } catch (error) {
        console.error('Failed to update alert channels:', error);
        res.status(500).json({ error: 'Erro ao atualizar canais de alerta.' });
      }
    }
  );

  app.post(
    '/api/alerts/rules',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const user = req.authUser!;
        const config = await getOrInitAlertConfigDb(user.uid, user.email);
        const body = req.body as Partial<AlertRule>;
        if (!body.name || !body.type) {
          return res
            .status(400)
            .json({ error: 'Informe o nome e o tipo da regra de alerta.' });
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

        const updatedRules = [newRule, ...config.rules];
        await db
          .update(alertSettings)
          .set({ rules: updatedRules })
          .where(eq(alertSettings.userUid, user.uid));

        res.status(201).json({
          config: { ...config, rules: updatedRules },
          rule: newRule,
        });
      } catch (error) {
        console.error('Failed to create alert rule:', error);
        res.status(500).json({ error: 'Erro ao criar regra de alerta.' });
      }
    }
  );

  app.patch(
    '/api/alerts/rules/:id',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const user = req.authUser!;
        const config = await getOrInitAlertConfigDb(user.uid, user.email);
        const idx = config.rules.findIndex((r) => r.id === req.params.id);
        if (idx === -1) {
          return res.status(404).json({ error: 'Regra de alerta não encontrada.' });
        }
        const nextRules = [...config.rules];
        nextRules[idx] = {
          ...nextRules[idx],
          ...req.body,
          id: nextRules[idx].id,
          updatedAt: new Date().toISOString(),
        };
        await db
          .update(alertSettings)
          .set({ rules: nextRules })
          .where(eq(alertSettings.userUid, user.uid));

        res.json({ config: { ...config, rules: nextRules } });
      } catch (error) {
        console.error('Failed to update alert rule:', error);
        res.status(500).json({ error: 'Erro ao atualizar regra de alerta.' });
      }
    }
  );

  app.delete(
    '/api/alerts/rules/:id',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const user = req.authUser!;
        const config = await getOrInitAlertConfigDb(user.uid, user.email);
        const nextRules = config.rules.filter((r) => r.id !== req.params.id);
        await db
          .update(alertSettings)
          .set({ rules: nextRules })
          .where(eq(alertSettings.userUid, user.uid));
        res.json({ config: { ...config, rules: nextRules } });
      } catch (error) {
        console.error('Failed to delete alert rule:', error);
        res.status(500).json({ error: 'Erro ao excluir regra de alerta.' });
      }
    }
  );

  app.post(
    '/api/alerts/evaluate',
    requireAuth,
    requireActiveWorkspace,
    async (req: AuthRequest, res) => {
      try {
        const user = req.authUser!;
        const [config, skus, comps] = await Promise.all([
          getOrInitAlertConfigDb(user.uid, user.email),
          getStoreSkus(user.uid),
          getCompetitors(user.uid),
        ]);
        const triggered: TriggeredAlert[] = [];

        for (const rule of config.rules) {
          if (!rule.enabled) continue;
          const target = rule.targetAsinOrSku.toLowerCase();

          if (rule.type === 'competitor_price_below') {
            for (const comp of comps) {
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
      } catch (error) {
        console.error('Failed to evaluate alerts:', error);
        res.status(500).json({ error: 'Erro ao avaliar alertas.' });
      }
    }
  );

  // --- ADMIN SUBSCRIBER MANAGEMENT ---
  app.get(
    '/api/admin/subscribers',
    requireAuth,
    requireSubscriberAdmin,
    async (req: AuthRequest, res) => {
      try {
        const list = await listSubscribers();
        if (req.authUser!.role === 'ADMIN_PAID') {
          return res.json({
            subscribers: list.filter((s) => s.status !== 'Trial'),
          });
        }
        res.json({ subscribers: list });
      } catch (error) {
        console.error('Failed to list subscribers:', error);
        res.status(500).json({ error: 'Erro ao carregar assinantes.' });
      }
    }
  );

  app.post(
    '/api/admin/subscribers',
    requireAuth,
    requireAdminFull,
    async (req: AuthRequest, res) => {
      try {
        const body = req.body as Partial<SubscriberRecord> & {
          initialPassword?: string;
        };

        if (!body.name || !body.email) {
          return res
            .status(400)
            .json({ error: 'Informe nome e e-mail do assinante.' });
        }

        const emailLower = normalizeEmail(body.email);
        const existingSubs = await db
          .select({ id: subscribers.id })
          .from(subscribers)
          .where(eq(subscribers.email, emailLower))
          .limit(1);

        if (existingSubs.length > 0) {
          return res.status(409).json({
            error: 'Já existe um assinante cadastrado com este e-mail.',
          });
        }

        const plan: SubscriberPlan = body.plan || 'Pro';
        const status: SubscriberStatus =
          (body.status as SubscriberStatus) || 'Trial';
        const phone = (body.phone || '').trim();
        const amazonAccountId = normalizeAmazonId(body.amazonAccountId || '');
        const today = todayIso();
        const trialStartedAt = body.trialStartedAt || today;
        const trialEndsAt =
          body.trialEndsAt || addDaysIso(trialStartedAt, FREE_TRIAL_DAYS);
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

        await db.insert(subscribers).values(entry);

        const existingUser = await getUserByEmail(emailLower);
        if (!existingUser) {
          const uid = `user-${crypto.randomUUID().slice(0, 8)}`;
          await db.insert(users).values({
            uid,
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
          await seedWorkspaceForUser(uid, entry.email);
        }

        await registerTrialIdentityDb({
          email: entry.email,
          phone: entry.phone,
          amazonAccountId: entry.amazonAccountId,
          trialStartedAt: entry.trialStartedAt,
          trialEndsAt: entry.trialEndsAt,
        });

        const updatedList = await listSubscribers();
        res.status(201).json({ subscriber: entry, subscribers: updatedList });
      } catch (error) {
        console.error('Failed to create subscriber:', error);
        res.status(500).json({ error: 'Erro ao cadastrar assinante.' });
      }
    }
  );

  app.patch(
    '/api/admin/subscribers/:id',
    requireAuth,
    requireSubscriberAdmin,
    async (req: AuthRequest, res) => {
      try {
        const found = await db
          .select()
          .from(subscribers)
          .where(eq(subscribers.id, req.params.id))
          .limit(1);

        if (found.length === 0) {
          return res.status(404).json({ error: 'Assinante não encontrado.' });
        }

        const current = found[0];
        const rawPatch = req.body as Partial<SubscriberRecord>;
        const isFullAdmin = req.authUser!.role === 'ADMIN_FULL';

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
              error:
                'Não é permitido converter assinante pago para Trial por este perfil.',
            });
          }
        }

        const patch: Partial<SubscriberRecord> = isFullAdmin
          ? rawPatch
          : {
              accessGranted: rawPatch.accessGranted,
              status: rawPatch.status,
              plan: rawPatch.plan,
              nextBillingDate: rawPatch.nextBillingDate,
            };

        const prevEmail = normalizeEmail(current.email);
        const nextPlan = (patch.plan || current.plan) as SubscriberPlan;
        const planChanged = Boolean(patch.plan && patch.plan !== current.plan);
        const defaults = PLAN_DEFAULTS[nextPlan];
        const nextStatus = (patch.status || current.status) as SubscriberStatus;
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

        const nextEmail = normalizeEmail(patch.email || current.email);
        const nextPhone = (
          patch.phone !== undefined ? patch.phone : current.phone || ''
        ).trim();
        const nextAmazon = normalizeAmazonId(
          patch.amazonAccountId !== undefined
            ? patch.amazonAccountId
            : current.amazonAccountId || ''
        );
        const nextName = (patch.name || current.name).trim();
        const nextCompany = (patch.companyName || current.companyName).trim();
        const nextTrialStart =
          patch.trialStartedAt || current.trialStartedAt || current.createdAt;
        const nextTrialEnd =
          patch.trialEndsAt ||
          current.trialEndsAt ||
          addDaysIso(current.createdAt || todayIso(), FREE_TRIAL_DAYS);
        const nextMonthlyPrice =
          patch.monthlyPrice !== undefined
            ? Number(patch.monthlyPrice)
            : planChanged
              ? defaults.monthlyPrice
              : current.monthlyPrice;
        const nextSkusLimit =
          patch.skusLimit !== undefined
            ? Number(patch.skusLimit)
            : planChanged
              ? defaults.skusLimit
              : current.skusLimit;

        const [updatedSub] = await db
          .update(subscribers)
          .set({
            email: nextEmail,
            phone: nextPhone,
            amazonAccountId: nextAmazon,
            name: nextName,
            companyName: nextCompany,
            plan: nextPlan,
            status: nextStatus,
            accessGranted: nextAccess,
            isPaidAdmin: nextIsPaidAdmin,
            trialStartedAt: nextTrialStart,
            trialEndsAt: nextTrialEnd,
            monthlyPrice: nextMonthlyPrice,
            skusLimit: nextSkusLimit,
            paymentMethod: patch.paymentMethod || current.paymentMethod,
            nextBillingDate: patch.nextBillingDate || current.nextBillingDate,
          })
          .where(eq(subscribers.id, current.id))
          .returning();

        const linkedUser = await getUserByEmail(prevEmail);
        const nextRole = nextIsPaidAdmin ? 'ADMIN_PAID' : 'SUBSCRIBER';
        if (linkedUser && linkedUser.role !== 'ADMIN_FULL') {
          await db
            .update(users)
            .set({
              name: nextName,
              email: nextEmail,
              phone: nextPhone,
              amazonAccountId: nextAmazon,
              companyName: nextCompany,
              role: nextRole,
            })
            .where(eq(users.uid, linkedUser.uid));
        } else if ((nextAccess || nextIsPaidAdmin) && !linkedUser) {
          const emailCheck = await getUserByEmail(nextEmail);
          if (!emailCheck) {
            const uid = `user-${crypto.randomUUID().slice(0, 8)}`;
            await db.insert(users).values({
              uid,
              name: nextName,
              email: nextEmail,
              phone: nextPhone,
              amazonAccountId: nextAmazon,
              companyName: nextCompany,
              taxRegime: 'Simples Nacional',
              defaultTaxRate: 6.5,
              avatarUrl: AVATAR_URL,
              role: nextRole,
              passwordHash: hashPassword('123456'),
            });
            await seedWorkspaceForUser(uid, nextEmail);
          }
        }

        await registerTrialIdentityDb({
          email: nextEmail,
          phone: nextPhone,
          amazonAccountId: nextAmazon,
          trialStartedAt: nextTrialStart,
          trialEndsAt: nextTrialEnd,
        });

        const allSubs = await listSubscribers();
        const responseList = isFullAdmin
          ? allSubs
          : allSubs.filter((s) => s.status !== 'Trial');
        res.json({ subscriber: updatedSub, subscribers: responseList });
      } catch (error) {
        console.error('Failed to update subscriber:', error);
        res.status(500).json({ error: 'Erro ao atualizar assinante.' });
      }
    }
  );

  app.delete(
    '/api/admin/subscribers/:id',
    requireAuth,
    requireAdminFull,
    async (req: AuthRequest, res) => {
      try {
        const found = await db
          .select()
          .from(subscribers)
          .where(eq(subscribers.id, req.params.id))
          .limit(1);

        if (found.length > 0) {
          const targetEmail = normalizeEmail(found[0].email);
          const linked = await getUserByEmail(targetEmail);
          if (linked && linked.role !== 'ADMIN_FULL') {
            await db.delete(users).where(eq(users.uid, linked.uid));
          }
          await db.delete(subscribers).where(eq(subscribers.id, req.params.id));
        }

        const remaining = await listSubscribers();
        res.json({ subscribers: remaining });
      } catch (error) {
        console.error('Failed to delete subscriber:', error);
        res.status(500).json({ error: 'Erro ao remover assinante.' });
      }
    }
  );

  // --- ADMIN FULL ACCOUNT MANAGEMENT ---
  app.get(
    '/api/admin/full-admins',
    requireAuth,
    requireAdminFull,
    async (req: AuthRequest, res) => {
      try {
        const admins = await listFullAdminsDb(req.authUser!.uid);
        res.json({ admins });
      } catch (error) {
        console.error('Failed to list full admins:', error);
        res.status(500).json({ error: 'Erro ao carregar Administradores FULL.' });
      }
    }
  );

  app.post(
    '/api/admin/full-admins',
    requireAuth,
    requireAdminFull,
    async (req: AuthRequest, res) => {
      try {
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
        const existing = await getUserByEmail(emailNorm);
        if (existing) {
          return res.status(409).json({
            error:
              existing.role === 'ADMIN_FULL'
                ? 'Já existe um Administrador FULL com este e-mail.'
                : 'Este e-mail já pertence a um assinante cadastrado. Use outro e-mail para o Administrador FULL.',
          });
        }

        const newUid = `admin-${crypto.randomUUID().slice(0, 8)}`;
        const [created] = await db
          .insert(users)
          .values({
            uid: newUid,
            name: name.trim(),
            email: emailNorm,
            phone: (phone || '').trim(),
            amazonAccountId: `ADMIN-${newUid.slice(-4).toUpperCase()}`,
            companyName: (companyName || 'AmzHub BR Administração').trim(),
            taxRegime: 'Lucro Presumido',
            defaultTaxRate: 6.5,
            avatarUrl: AVATAR_URL,
            role: 'ADMIN_FULL',
            passwordHash: hashPassword(password),
          })
          .returning();

        await seedWorkspaceForUser(newUid, emailNorm);
        const admins = await listFullAdminsDb(req.authUser!.uid);

        res.status(201).json({
          admin: {
            id: created.uid,
            name: created.name,
            email: created.email,
            phone: created.phone || '',
            companyName: created.companyName,
            isCurrentUser: false,
          },
          admins,
        });
      } catch (error) {
        console.error('Failed to create full admin:', error);
        res.status(500).json({ error: 'Erro ao incluir Administrador FULL.' });
      }
    }
  );

  app.patch(
    '/api/admin/full-admins/:id',
    requireAuth,
    requireAdminFull,
    async (req: AuthRequest, res) => {
      try {
        const rows = await db
          .select()
          .from(users)
          .where(
            and(eq(users.uid, req.params.id), eq(users.role, 'ADMIN_FULL'))
          )
          .limit(1);

        if (rows.length === 0) {
          return res
            .status(404)
            .json({ error: 'Administrador FULL não encontrado.' });
        }

        const current = rows[0];
        const { name, email, phone, companyName, password } = req.body as {
          name?: string;
          email?: string;
          phone?: string;
          companyName?: string;
          password?: string;
        };

        const nextEmail = email ? normalizeEmail(email) : current.email;
        if (nextEmail !== normalizeEmail(current.email)) {
          const emailTaken = await getUserByEmail(nextEmail);
          if (emailTaken && emailTaken.uid !== current.uid) {
            return res.status(409).json({
              error: 'Este e-mail já está em uso por outra conta.',
            });
          }
        }

        if (password && password.length > 0 && password.length < 6) {
          return res.status(400).json({
            error: 'A nova senha deve ter pelo menos 6 caracteres.',
          });
        }

        const [updated] = await db
          .update(users)
          .set({
            name: name !== undefined ? name.trim() || current.name : current.name,
            email: nextEmail,
            phone: phone !== undefined ? phone.trim() : current.phone,
            companyName:
              companyName !== undefined
                ? companyName.trim() || current.companyName
                : current.companyName,
            passwordHash:
              password && password.length >= 6
                ? hashPassword(password)
                : current.passwordHash,
          })
          .where(eq(users.uid, current.uid))
          .returning();

        const admins = await listFullAdminsDb(req.authUser!.uid);
        const updatedCurrentUser =
          updated.uid === req.authUser!.uid
            ? await sanitizeDbUser(updated)
            : undefined;

        res.json({
          admin: {
            id: updated.uid,
            name: updated.name,
            email: updated.email,
            phone: updated.phone || '',
            companyName: updated.companyName,
            isCurrentUser: updated.uid === req.authUser!.uid,
          },
          admins,
          updatedCurrentUser,
        });
      } catch (error) {
        console.error('Failed to update full admin:', error);
        res.status(500).json({ error: 'Erro ao atualizar Administrador FULL.' });
      }
    }
  );

  app.delete(
    '/api/admin/full-admins/:id',
    requireAuth,
    requireAdminFull,
    async (req: AuthRequest, res) => {
      try {
        const fullAdmins = await db
          .select()
          .from(users)
          .where(eq(users.role, 'ADMIN_FULL'));
        const target = fullAdmins.find((u) => u.uid === req.params.id);

        if (!target) {
          return res
            .status(404)
            .json({ error: 'Administrador FULL não encontrado.' });
        }
        if (fullAdmins.length <= 1) {
          return res.status(400).json({
            error:
              'Não é possível excluir o único Administrador FULL ativo no sistema.',
          });
        }
        if (target.uid === req.authUser!.uid) {
          return res.status(400).json({
            error:
              'Você não pode excluir sua própria conta enquanto estiver logado nela. Entre com outro Administrador FULL para excluí-la.',
          });
        }

        await db.delete(users).where(eq(users.uid, target.uid));
        const admins = await listFullAdminsDb(req.authUser!.uid);
        res.json({ admins });
      } catch (error) {
        console.error('Failed to delete full admin:', error);
        res.status(500).json({ error: 'Erro ao excluir Administrador FULL.' });
      }
    }
  );

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
