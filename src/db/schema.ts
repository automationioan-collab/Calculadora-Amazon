import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { AlertRule, SupplierAnalyzedItem } from '../types.ts';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull().default(''),
  amazonAccountId: text('amazon_account_id').notNull().default(''),
  companyName: text('company_name').notNull().default('Minha Loja Amazon'),
  taxRegime: text('tax_regime').notNull().default('Simples Nacional'),
  defaultTaxRate: doublePrecision('default_tax_rate').notNull().default(6.5),
  avatarUrl: text('avatar_url').notNull().default(''),
  role: text('role').notNull().default('SUBSCRIBER'),
  passwordHash: text('password_hash').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const subscribers = pgTable('subscribers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull().default(''),
  amazonAccountId: text('amazon_account_id').notNull().default(''),
  companyName: text('company_name').notNull().default(''),
  plan: text('plan').notNull().default('Starter'),
  monthlyPrice: doublePrecision('monthly_price').notNull().default(97),
  status: text('status').notNull().default('Trial'),
  accessGranted: boolean('access_granted').notNull().default(true),
  isPaidAdmin: boolean('is_paid_admin').notNull().default(false),
  trialStartedAt: text('trial_started_at').notNull(),
  trialEndsAt: text('trial_ends_at').notNull(),
  skusLimit: integer('skus_limit').notNull().default(25),
  skusUsed: integer('skus_used').notNull().default(0),
  paymentMethod: text('payment_method').notNull().default('PIX'),
  nextBillingDate: text('next_billing_date').notNull(),
  createdAt: text('created_at').notNull(),
});

export const trialRegistry = pgTable('trial_registry', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  phoneDigits: text('phone_digits').notNull().default(''),
  amazonAccountId: text('amazon_account_id').notNull().default(''),
  trialStartedAt: text('trial_started_at').notNull(),
  trialEndsAt: text('trial_ends_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const storeSkus = pgTable('store_skus', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  sku: text('sku').notNull(),
  asin: text('asin').notNull(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  fulfillment: text('fulfillment').notNull(),
  salePrice: doublePrecision('sale_price').notNull(),
  unitCost: doublePrecision('unit_cost').notNull(),
  inboundShipping: doublePrecision('inbound_shipping').notNull(),
  packagingCost: doublePrecision('packaging_cost').notNull(),
  taxPercent: doublePrecision('tax_percent').notNull(),
  acosPercent: doublePrecision('acos_percent').notNull(),
  weightGrams: integer('weight_grams').notNull(),
  stockUnits: integer('stock_units').notNull(),
  dailySalesVelocity: doublePrecision('daily_sales_velocity').notNull(),
  buyBoxOwner: text('buy_box_owner').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const competitors = pgTable('competitors', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  sellerName: text('seller_name').notNull(),
  sellerId: text('seller_id').notNull(),
  primaryAsin: text('primary_asin').notNull(),
  productTitle: text('product_title').notNull(),
  category: text('category').notNull(),
  fulfillment: text('fulfillment').notNull(),
  currentPrice: doublePrecision('current_price').notNull(),
  buyBoxSharePercent: doublePrecision('buy_box_share_percent').notNull(),
  activeSkus: integer('active_skus').notNull(),
  estimatedMonthlyRevenue: doublePrecision('estimated_monthly_revenue').notNull(),
  priceChange7d: doublePrecision('price_change_7d').notNull(),
  lastCheckedAt: text('last_checked_at').notNull(),
});

export const supplierBatches = pgTable('supplier_batches', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  batchName: text('batch_name').notNull(),
  createdAt: text('created_at').notNull(),
  taxRate: doublePrecision('tax_rate').notNull(),
  items: jsonb('items').$type<SupplierAnalyzedItem[]>().notNull(),
});

export const plannerScenarios = pgTable('planner_scenarios', {
  id: text('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  initialCapital: doublePrecision('initial_capital').notNull(),
  averageTicket: doublePrecision('average_ticket').notNull(),
  targetNetMarginPercent: doublePrecision('target_net_margin_percent').notNull(),
  reinvestmentPercent: doublePrecision('reinvestment_percent').notNull(),
  taxPercent: doublePrecision('tax_percent').notNull(),
  restockCycleDays: integer('restock_cycle_days').notNull(),
  monthlyGrowthPercent: doublePrecision('monthly_growth_percent').notNull(),
});

export const alertSettings = pgTable('alert_settings', {
  userUid: text('user_uid')
    .primaryKey()
    .references(() => users.uid, { onDelete: 'cascade' }),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  notificationEmail: text('notification_email').notNull(),
  pushEnabled: boolean('push_enabled').notNull().default(true),
  quietHoursStart: text('quiet_hours_start').notNull().default('22:00'),
  quietHoursEnd: text('quiet_hours_end').notNull().default('07:00'),
  rules: jsonb('rules').$type<AlertRule[]>().notNull(),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  storeSkus: many(storeSkus),
  competitors: many(competitors),
  supplierBatches: many(supplierBatches),
  plannerScenarios: many(plannerScenarios),
  alertSettings: one(alertSettings),
}));

export const storeSkusRelations = relations(storeSkus, ({ one }) => ({
  owner: one(users, {
    fields: [storeSkus.userUid],
    references: [users.uid],
  }),
}));

export const competitorsRelations = relations(competitors, ({ one }) => ({
  owner: one(users, {
    fields: [competitors.userUid],
    references: [users.uid],
  }),
}));

export const supplierBatchesRelations = relations(supplierBatches, ({ one }) => ({
  owner: one(users, {
    fields: [supplierBatches.userUid],
    references: [users.uid],
  }),
}));

export const plannerScenariosRelations = relations(plannerScenarios, ({ one }) => ({
  owner: one(users, {
    fields: [plannerScenarios.userUid],
    references: [users.uid],
  }),
}));

export const alertSettingsRelations = relations(alertSettings, ({ one }) => ({
  owner: one(users, {
    fields: [alertSettings.userUid],
    references: [users.uid],
  }),
}));
