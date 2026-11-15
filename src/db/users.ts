import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  alertSettings,
  competitors,
  plannerScenarios,
  storeSkus,
  subscribers,
  trialRegistry,
  users,
} from './schema.ts';
import {
  createDefaultAlertConfig,
  FREE_TRIAL_DAYS,
  PLAN_DEFAULTS,
  SEED_COMPETITORS,
  SEED_PLANNER_SCENARIOS,
  SEED_STORE_SKUS,
  SEED_SUBSCRIBERS,
} from '../../server/seedData.ts';
import type {
  AlertNotificationConfig,
  CompetitorWatch,
  PlannerInputs,
  StoreSku,
  SubscriberRecord,
  SupplierBatch,
  TrialIdentityRecord,
  UserProfile,
} from '../types.ts';

export const ADMIN_USER_ID = 'user-admin-full';
export const DEMO_USER_ID = 'user-demo-br';
export const AVATAR_URL =
  '/src/assets/images/seller_profile_avatar_1794711815395.jpg';

export type DbUserRow = typeof users.$inferSelect;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits;
}

export function normalizeAmazonId(amazonAccountId: string): string {
  return amazonAccountId.trim().toUpperCase().replace(/\s+/g, '');
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(baseIso: string, days: number): string {
  const dt = new Date(`${baseIso.slice(0, 10)}T12:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function seedWorkspaceForUser(
  userUid: string,
  email: string
): Promise<void> {
  try {
    const existingSkus = await db
      .select({ id: storeSkus.id })
      .from(storeSkus)
      .where(eq(storeSkus.userUid, userUid))
      .limit(1);

    if (existingSkus.length === 0) {
      await db.insert(storeSkus).values(
        SEED_STORE_SKUS.map((s) => ({
          ...s,
          id: `${userUid}-${s.id}`,
          userUid,
        }))
      );
    }

    const existingComps = await db
      .select({ id: competitors.id })
      .from(competitors)
      .where(eq(competitors.userUid, userUid))
      .limit(1);

    if (existingComps.length === 0) {
      await db.insert(competitors).values(
        SEED_COMPETITORS.map((c) => ({
          ...c,
          id: `${userUid}-${c.id}`,
          userUid,
        }))
      );
    }

    const existingPlans = await db
      .select({ id: plannerScenarios.id })
      .from(plannerScenarios)
      .where(eq(plannerScenarios.userUid, userUid))
      .limit(1);

    if (existingPlans.length === 0) {
      await db.insert(plannerScenarios).values(
        SEED_PLANNER_SCENARIOS.map((p) => ({
          ...p,
          id: `${userUid}-${p.id}`,
          userUid,
        }))
      );
    }

    const alertDefault = createDefaultAlertConfig(email);
    await db
      .insert(alertSettings)
      .values({
        userUid,
        emailEnabled: alertDefault.emailEnabled,
        notificationEmail: alertDefault.notificationEmail,
        pushEnabled: alertDefault.pushEnabled,
        quietHoursStart: alertDefault.quietHoursStart,
        quietHoursEnd: alertDefault.quietHoursEnd,
        rules: alertDefault.rules,
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error('Failed to seed workspace for user:', error);
    throw new Error('Falha ao inicializar dados da conta no banco.', {
      cause: error,
    });
  }
}

let seedPromise: Promise<void> | null = null;

async function runLazySeed(): Promise<void> {
  try {
    const existing = await db.select({ uid: users.uid }).from(users).limit(1);
    if (existing.length > 0) return;

    // Attempt to migrate any existing JSON workspace data if present
    const dbFile = path.resolve(process.cwd(), 'data', 'workspace-db.json');
    let jsonState: {
      users?: Array<UserProfile & { passwordHash?: string }>;
      competitors?: Record<string, CompetitorWatch[]>;
      storeSkus?: Record<string, StoreSku[]>;
      supplierBatches?: Record<string, SupplierBatch[]>;
      plannerScenarios?: Record<string, PlannerInputs[]>;
      alertSettings?: Record<string, AlertNotificationConfig>;
      subscribers?: SubscriberRecord[];
      trialRegistry?: TrialIdentityRecord[];
    } | null = null;

    try {
      const raw = await fs.readFile(dbFile, 'utf8');
      jsonState = JSON.parse(raw);
    } catch {
      jsonState = null;
    }

    if (jsonState?.users && jsonState.users.length > 0) {
      for (const u of jsonState.users) {
        const uid = u.id || `user-${crypto.randomUUID().slice(0, 8)}`;
        await db
          .insert(users)
          .values({
            uid,
            name: u.name,
            email: normalizeEmail(u.email),
            phone: u.phone || '',
            amazonAccountId: u.amazonAccountId || '',
            companyName: u.companyName || 'AmzHub BR',
            taxRegime: u.taxRegime || 'Simples Nacional',
            defaultTaxRate: Number(u.defaultTaxRate ?? 6.5),
            avatarUrl: u.avatarUrl || AVATAR_URL,
            role: u.role || 'SUBSCRIBER',
            passwordHash: u.passwordHash || hashPassword('123456'),
          })
          .onConflictDoNothing();

        const userSkus = jsonState.storeSkus?.[uid] || SEED_STORE_SKUS;
        if (userSkus.length > 0) {
          await db
            .insert(storeSkus)
            .values(
              userSkus.map((s) => ({
                ...s,
                id: `${uid}-${s.id}`,
                userUid: uid,
              }))
            )
            .onConflictDoNothing();
        }

        const userComps = jsonState.competitors?.[uid] || SEED_COMPETITORS;
        if (userComps.length > 0) {
          await db
            .insert(competitors)
            .values(
              userComps.map((c) => ({
                ...c,
                id: `${uid}-${c.id}`,
                userUid: uid,
              }))
            )
            .onConflictDoNothing();
        }

        const userPlans = jsonState.plannerScenarios?.[uid] || SEED_PLANNER_SCENARIOS;
        if (userPlans.length > 0) {
          await db
            .insert(plannerScenarios)
            .values(
              userPlans.map((p) => ({
                ...p,
                id: `${uid}-${p.id}`,
                userUid: uid,
              }))
            )
            .onConflictDoNothing();
        }

        const userAlert =
          jsonState.alertSettings?.[uid] || createDefaultAlertConfig(u.email);
        await db
          .insert(alertSettings)
          .values({
            userUid: uid,
            emailEnabled: userAlert.emailEnabled,
            notificationEmail: userAlert.notificationEmail,
            pushEnabled: userAlert.pushEnabled,
            quietHoursStart: userAlert.quietHoursStart,
            quietHoursEnd: userAlert.quietHoursEnd,
            rules: userAlert.rules,
          })
          .onConflictDoNothing();
      }

      for (const s of jsonState.subscribers || SEED_SUBSCRIBERS) {
        await db
          .insert(subscribers)
          .values({
            ...s,
            email: normalizeEmail(s.email),
            isPaidAdmin: Boolean(s.isPaidAdmin),
          })
          .onConflictDoNothing();
      }

      for (const t of jsonState.trialRegistry || []) {
        await db
          .insert(trialRegistry)
          .values(t)
          .onConflictDoNothing();
      }
      return;
    }

    // Fresh database seed
    await db
      .insert(users)
      .values([
        {
          uid: ADMIN_USER_ID,
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
          uid: DEMO_USER_ID,
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
      ])
      .onConflictDoNothing();

    await seedWorkspaceForUser(ADMIN_USER_ID, 'admin@amzhub.com.br');
    await seedWorkspaceForUser(DEMO_USER_ID, 'demo@amzhub.com.br');

    await db
      .insert(subscribers)
      .values(
        SEED_SUBSCRIBERS.map((s) => ({
          ...s,
          email: normalizeEmail(s.email),
          isPaidAdmin: Boolean(s.isPaidAdmin),
        }))
      )
      .onConflictDoNothing();

    await db
      .insert(trialRegistry)
      .values(
        SEED_SUBSCRIBERS.map((s) => ({
          id: `trial-${s.id}`,
          email: normalizeEmail(s.email),
          phoneDigits: normalizePhone(s.phone),
          amazonAccountId: normalizeAmazonId(s.amazonAccountId),
          trialStartedAt: s.trialStartedAt,
          trialEndsAt: s.trialEndsAt,
          createdAt: s.createdAt,
        }))
      )
      .onConflictDoNothing();
  } catch (error) {
    console.error('Database seed error:', error);
    throw new Error('Falha ao inicializar dados no banco PostgreSQL.', {
      cause: error,
    });
  }
}

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runLazySeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  await seedPromise;
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string
): Promise<DbUserRow> {
  try {
    await ensureSeeded();
    const emailNorm = normalizeEmail(email);

    // Check if an existing local/pre-seeded user owns this email
    const existingByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, emailNorm))
      .limit(1);

    if (existingByEmail.length > 0 && existingByEmail[0].uid !== uid) {
      return existingByEmail[0];
    }

    const existingSub = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, emailNorm))
      .limit(1);

    const role =
      emailNorm === 'admin@amzhub.com.br'
        ? 'ADMIN_FULL'
        : existingSub[0]?.isPaidAdmin
          ? 'ADMIN_PAID'
          : 'SUBSCRIBER';

    const cleanName = (displayName || emailNorm.split('@')[0] || 'Vendedor').trim();

    const [upserted] = await db
      .insert(users)
      .values({
        uid,
        name: cleanName,
        email: emailNorm,
        phone: existingSub[0]?.phone || '',
        amazonAccountId: existingSub[0]?.amazonAccountId || '',
        companyName: existingSub[0]?.companyName || `${cleanName} Store`,
        taxRegime: 'Simples Nacional',
        defaultTaxRate: 6.5,
        avatarUrl: AVATAR_URL,
        role,
        passwordHash: '',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: emailNorm,
          name: cleanName,
        },
      })
      .returning();

    // Ensure Google user gets a 25-day Trial subscriber record if not ADMIN_FULL and not yet listed
    if (upserted.role !== 'ADMIN_FULL' && existingSub.length === 0) {
      const today = todayIso();
      const trialEndsAt = addDaysIso(today, FREE_TRIAL_DAYS);
      await db
        .insert(subscribers)
        .values({
          id: `sub-${upserted.uid.slice(0, 12)}`,
          name: upserted.name,
          email: emailNorm,
          phone: upserted.phone,
          amazonAccountId: upserted.amazonAccountId,
          companyName: upserted.companyName,
          plan: 'Starter',
          monthlyPrice: PLAN_DEFAULTS.Starter.monthlyPrice,
          status: 'Trial',
          accessGranted: true,
          isPaidAdmin: false,
          trialStartedAt: today,
          trialEndsAt,
          skusLimit: PLAN_DEFAULTS.Starter.skusLimit,
          skusUsed: SEED_STORE_SKUS.length,
          paymentMethod: 'PIX',
          nextBillingDate: trialEndsAt,
          createdAt: today,
        })
        .onConflictDoNothing();

      await db
        .insert(trialRegistry)
        .values({
          id: `trial-${crypto.randomUUID().slice(0, 8)}`,
          email: emailNorm,
          phoneDigits: normalizePhone(upserted.phone),
          amazonAccountId: normalizeAmazonId(upserted.amazonAccountId),
          trialStartedAt: today,
          trialEndsAt,
          createdAt: today,
        })
        .onConflictDoNothing();
    }

    await seedWorkspaceForUser(upserted.uid, upserted.email);
    return upserted;
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Não foi possível sincronizar o usuário no banco de dados.', {
      cause: error,
    });
  }
}

export async function getUserByUid(uid: string): Promise<DbUserRow | null> {
  try {
    await ensureSeeded();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed in getUserByUid:', error);
    throw new Error('Falha ao consultar usuário no banco de dados.', {
      cause: error,
    });
  }
}

export async function getUserByEmail(email: string): Promise<DbUserRow | null> {
  try {
    await ensureSeeded();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizeEmail(email)))
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed in getUserByEmail:', error);
    throw new Error('Falha ao consultar usuário por e-mail.', {
      cause: error,
    });
  }
}
