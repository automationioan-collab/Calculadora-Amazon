import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  alertSettings,
  competitors,
  plannerScenarios,
  storeSkus,
  subscribers,
  supplierBatches,
  trialRegistry,
  users,
} from './schema.ts';
import {
  addDaysIso,
  ensureSeeded,
  normalizeAmazonId,
  normalizeEmail,
  normalizePhone,
  todayIso,
  type DbUserRow,
} from './users.ts';
import {
  createDefaultAlertConfig,
  FREE_TRIAL_DAYS,
} from '../../server/seedData.ts';
import type {
  AdminFullRecord,
  AlertNotificationConfig,
  CompetitorWatch,
  FreeEligibilityResult,
  FulfillmentMode,
  PaymentMethod,
  PlannerInputs,
  StoreSku,
  SubscriberPlan,
  SubscriberRecord,
  SubscriberStatus,
  SubscriptionAccessInfo,
  SupplierBatch,
  UserProfile,
  UserRole,
} from '../types.ts';

function formatDateBr(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : isoDate;
}

export function calculateRemainingTrialDays(trialEndsAtIso: string): number {
  const endMs = new Date(`${trialEndsAtIso.slice(0, 10)}T23:59:59.999Z`).getTime();
  if (Number.isNaN(endMs)) return 0;
  const diff = endMs - Date.now();
  if (diff <= 0) return 0;
  return Math.min(FREE_TRIAL_DAYS, Math.ceil(diff / 86400000));
}

export async function listSubscribers(): Promise<SubscriberRecord[]> {
  try {
    await ensureSeeded();
    const rows = await db.select().from(subscribers);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      amazonAccountId: r.amazonAccountId,
      companyName: r.companyName,
      plan: r.plan as SubscriberPlan,
      monthlyPrice: r.monthlyPrice,
      status: r.status as SubscriberStatus,
      accessGranted: r.accessGranted,
      isPaidAdmin: r.isPaidAdmin,
      trialStartedAt: r.trialStartedAt,
      trialEndsAt: r.trialEndsAt,
      skusLimit: r.skusLimit,
      skusUsed: r.skusUsed,
      paymentMethod: r.paymentMethod as PaymentMethod,
      nextBillingDate: r.nextBillingDate,
      createdAt: r.createdAt,
    }));
  } catch (error) {
    console.error('Database query failed in listSubscribers:', error);
    throw new Error('Falha ao listar assinantes no banco de dados.', {
      cause: error,
    });
  }
}

export async function evaluateTrialEligibilityDb(input: {
  email?: string;
  phone?: string;
  amazonAccountId?: string;
}): Promise<FreeEligibilityResult> {
  try {
    await ensureSeeded();
    const emailNorm = input.email ? normalizeEmail(input.email) : '';
    const phoneNorm = input.phone ? normalizePhone(input.phone) : '';
    const amazonNorm = input.amazonAccountId
      ? normalizeAmazonId(input.amazonAccountId)
      : '';

    const [trials, subs, allUsers] = await Promise.all([
      db.select().from(trialRegistry),
      db.select().from(subscribers),
      db.select().from(users),
    ]);

    const matchedFieldsSet = new Set<'email' | 'telefone' | 'conta_amazon'>();
    let matchedEndsAt: string | null = null;
    let hasActivePaid = false;

    const inspectRecord = (rec: {
      email?: string;
      phone?: string;
      phoneDigits?: string;
      amazonAccountId?: string;
      trialEndsAt?: string;
      status?: string;
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
            matchedEndsAt = rec.trialEndsAt;
          }
        }
      }
    };

    for (const t of trials) inspectRecord(t);
    for (const s of subs) inspectRecord(s);
    for (const u of allUsers) {
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
  } catch (error) {
    console.error('Database query failed in evaluateTrialEligibilityDb:', error);
    throw new Error('Falha ao validar elegibilidade gratuita.', {
      cause: error,
    });
  }
}

export async function registerTrialIdentityDb(entry: {
  email: string;
  phone: string;
  amazonAccountId: string;
  trialStartedAt: string;
  trialEndsAt: string;
}): Promise<void> {
  try {
    const emailNorm = normalizeEmail(entry.email);
    const phoneDigits = normalizePhone(entry.phone);
    const amazonNorm = normalizeAmazonId(entry.amazonAccountId);

    const existing = await db
      .select()
      .from(trialRegistry)
      .where(eq(trialRegistry.email, emailNorm));

    const alreadyExact = existing.some(
      (t) =>
        t.email === emailNorm &&
        t.phoneDigits === phoneDigits &&
        t.amazonAccountId === amazonNorm
    );

    if (!alreadyExact) {
      await db.insert(trialRegistry).values({
        id: `trial-${crypto.randomUUID().slice(0, 8)}`,
        email: emailNorm,
        phoneDigits,
        amazonAccountId: amazonNorm,
        trialStartedAt: entry.trialStartedAt,
        trialEndsAt: entry.trialEndsAt,
        createdAt: todayIso(),
      });
    }
  } catch (error) {
    console.error('Database query failed in registerTrialIdentityDb:', error);
    throw new Error('Falha ao registrar identidade de teste gratuito.', {
      cause: error,
    });
  }
}

export async function computeUserSubscriptionInfoDb(
  user: DbUserRow
): Promise<SubscriptionAccessInfo> {
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

  try {
    const subs = await listSubscribers();
    const emailNorm = normalizeEmail(user.email);
    const phoneNorm = user.phone ? normalizePhone(user.phone) : '';
    const amazonNorm = user.amazonAccountId
      ? normalizeAmazonId(user.amazonAccountId)
      : '';

    const sub = subs.find(
      (s) =>
        normalizeEmail(s.email) === emailNorm ||
        (phoneNorm.length >= 10 && normalizePhone(s.phone || '') === phoneNorm) ||
        (amazonNorm.length >= 4 &&
          normalizeAmazonId(s.amazonAccountId || '') === amazonNorm)
    );

    const eligibility = await evaluateTrialEligibilityDb({
      email: user.email,
      phone: user.phone,
      amazonAccountId: user.amazonAccountId,
    });

    const startedAt = sub?.trialStartedAt || todayIso();
    const endsAt =
      sub?.trialEndsAt ||
      eligibility.trialEndsAt ||
      addDaysIso(startedAt, FREE_TRIAL_DAYS);
    const daysRemaining = calculateRemainingTrialDays(endsAt);
    const status: SubscriberStatus =
      sub?.status || (daysRemaining > 0 ? 'Trial' : 'Inadimplente');
    const accessGranted = sub ? sub.accessGranted : daysRemaining > 0;

    const hasPaidSubscription = status === 'Ativo' && accessGranted;
    const isFreeTrialActive =
      status === 'Trial' && accessGranted && daysRemaining > 0;
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
  } catch (error) {
    console.error('Database query failed in computeUserSubscriptionInfoDb:', error);
    throw new Error('Falha ao verificar status da assinatura.', {
      cause: error,
    });
  }
}

export async function sanitizeDbUser(u: DbUserRow): Promise<UserProfile> {
  const subscriptionInfo = await computeUserSubscriptionInfoDb(u);
  return {
    id: u.uid,
    name: u.name,
    email: u.email,
    phone: u.phone,
    amazonAccountId: u.amazonAccountId,
    companyName: u.companyName,
    taxRegime: u.taxRegime as UserProfile['taxRegime'],
    defaultTaxRate: u.defaultTaxRate,
    avatarUrl: u.avatarUrl,
    role: u.role as UserRole,
    subscriptionInfo,
  };
}

export async function getStoreSkus(userUid: string): Promise<StoreSku[]> {
  try {
    const rows = await db
      .select()
      .from(storeSkus)
      .where(eq(storeSkus.userUid, userUid));
    return rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      asin: r.asin,
      title: r.title,
      category: r.category,
      fulfillment: r.fulfillment as FulfillmentMode,
      salePrice: r.salePrice,
      unitCost: r.unitCost,
      inboundShipping: r.inboundShipping,
      packagingCost: r.packagingCost,
      taxPercent: r.taxPercent,
      acosPercent: r.acosPercent,
      weightGrams: r.weightGrams,
      stockUnits: r.stockUnits,
      dailySalesVelocity: r.dailySalesVelocity,
      buyBoxOwner: r.buyBoxOwner as StoreSku['buyBoxOwner'],
      updatedAt: r.updatedAt,
    }));
  } catch (error) {
    console.error('Database query failed in getStoreSkus:', error);
    throw new Error('Falha ao carregar SKUs da loja.', { cause: error });
  }
}

export async function getCompetitors(userUid: string): Promise<CompetitorWatch[]> {
  try {
    const rows = await db
      .select()
      .from(competitors)
      .where(eq(competitors.userUid, userUid));
    return rows.map((r) => ({
      id: r.id,
      sellerName: r.sellerName,
      sellerId: r.sellerId,
      primaryAsin: r.primaryAsin,
      productTitle: r.productTitle,
      category: r.category,
      fulfillment: r.fulfillment as FulfillmentMode,
      currentPrice: r.currentPrice,
      buyBoxSharePercent: r.buyBoxSharePercent,
      activeSkus: r.activeSkus,
      estimatedMonthlyRevenue: r.estimatedMonthlyRevenue,
      priceChange7d: r.priceChange7d,
      lastCheckedAt: r.lastCheckedAt,
    }));
  } catch (error) {
    console.error('Database query failed in getCompetitors:', error);
    throw new Error('Falha ao carregar concorrentes monitorados.', {
      cause: error,
    });
  }
}

export async function getSupplierBatches(
  userUid: string
): Promise<SupplierBatch[]> {
  try {
    const rows = await db
      .select()
      .from(supplierBatches)
      .where(eq(supplierBatches.userUid, userUid))
      .orderBy(desc(supplierBatches.createdAt))
      .limit(10);
    return rows.map((r) => ({
      id: r.id,
      batchName: r.batchName,
      createdAt: r.createdAt,
      taxRate: r.taxRate,
      items: r.items,
    }));
  } catch (error) {
    console.error('Database query failed in getSupplierBatches:', error);
    throw new Error('Falha ao carregar listas de fornecedores.', {
      cause: error,
    });
  }
}

export async function getPlannerScenarios(
  userUid: string
): Promise<PlannerInputs[]> {
  try {
    const rows = await db
      .select()
      .from(plannerScenarios)
      .where(eq(plannerScenarios.userUid, userUid));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      initialCapital: r.initialCapital,
      averageTicket: r.averageTicket,
      targetNetMarginPercent: r.targetNetMarginPercent,
      reinvestmentPercent: r.reinvestmentPercent,
      taxPercent: r.taxPercent,
      restockCycleDays: r.restockCycleDays,
      monthlyGrowthPercent: r.monthlyGrowthPercent,
    }));
  } catch (error) {
    console.error('Database query failed in getPlannerScenarios:', error);
    throw new Error('Falha ao carregar cenários de planejamento.', {
      cause: error,
    });
  }
}

export async function getOrInitAlertConfigDb(
  userUid: string,
  email: string
): Promise<AlertNotificationConfig> {
  try {
    const rows = await db
      .select()
      .from(alertSettings)
      .where(eq(alertSettings.userUid, userUid))
      .limit(1);

    if (rows.length > 0) {
      const r = rows[0];
      return {
        emailEnabled: r.emailEnabled,
        notificationEmail: r.notificationEmail,
        pushEnabled: r.pushEnabled,
        quietHoursStart: r.quietHoursStart,
        quietHoursEnd: r.quietHoursEnd,
        rules: r.rules,
      };
    }

    const def = createDefaultAlertConfig(email);
    await db
      .insert(alertSettings)
      .values({
        userUid,
        emailEnabled: def.emailEnabled,
        notificationEmail: def.notificationEmail,
        pushEnabled: def.pushEnabled,
        quietHoursStart: def.quietHoursStart,
        quietHoursEnd: def.quietHoursEnd,
        rules: def.rules,
      })
      .onConflictDoNothing();
    return def;
  } catch (error) {
    console.error('Database query failed in getOrInitAlertConfigDb:', error);
    throw new Error('Falha ao carregar configurações de alertas.', {
      cause: error,
    });
  }
}

export async function listFullAdminsDb(
  currentUserUid: string
): Promise<AdminFullRecord[]> {
  try {
    await ensureSeeded();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.role, 'ADMIN_FULL'));
    return rows.map((u) => ({
      id: u.uid,
      name: u.name,
      email: u.email,
      phone: u.phone || '',
      companyName: u.companyName,
      isCurrentUser: u.uid === currentUserUid,
    }));
  } catch (error) {
    console.error('Database query failed in listFullAdminsDb:', error);
    throw new Error('Falha ao listar Administradores FULL.', { cause: error });
  }
}
