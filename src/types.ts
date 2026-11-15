export type FulfillmentMode = 'FBA' | 'DBA' | 'FBM';

export type WorkspaceTab =
  | 'overview'
  | 'calculator'
  | 'market'
  | 'supplier'
  | 'spy'
  | 'planner'
  | 'store'
  | 'alerts';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  companyName: string;
  taxRegime: 'Simples Nacional' | 'Lucro Presumido' | 'MEI';
  defaultTaxRate: number;
  avatarUrl: string;
}

export interface MarketProduct {
  asin: string;
  ean: string;
  title: string;
  brand: string;
  category: string;
  price: number;
  estimatedCost: number;
  bsr: number;
  bsrDelta30d: number;
  monthlySales: number;
  sellersCount: number;
  amazonInBuyBox: boolean;
  buyBoxMode: FulfillmentMode;
  weightGrams: number;
  rating: number;
  reviewsCount: number;
  bsrHistory: number[];
  priceHistory: number[];
}

export interface SupplierRowInput {
  eanOrAsin: string;
  productName: string;
  supplierCost: number;
  icmsStPercent: number;
  freightPerUnit: number;
  mode?: FulfillmentMode;
}

export interface SupplierAnalyzedItem extends SupplierRowInput {
  id: string;
  matchedAsin: string | null;
  amazonTitle: string;
  category: string;
  amazonPrice: number;
  monthlySales: number;
  sellersCount: number;
  referralFee: number;
  fulfillmentFee: number;
  taxes: number;
  netProfit: number;
  marginPercent: number;
  roiPercent: number;
  verdict: 'Lucrativo' | 'Margem Baixa' | 'Inviável';
}

export interface SupplierBatch {
  id: string;
  batchName: string;
  createdAt: string;
  taxRate: number;
  items: SupplierAnalyzedItem[];
}

export interface CompetitorWatch {
  id: string;
  sellerName: string;
  sellerId: string;
  primaryAsin: string;
  productTitle: string;
  category: string;
  fulfillment: FulfillmentMode;
  currentPrice: number;
  buyBoxSharePercent: number;
  activeSkus: number;
  estimatedMonthlyRevenue: number;
  priceChange7d: number;
  lastCheckedAt: string;
}

export interface StoreSku {
  id: string;
  sku: string;
  asin: string;
  title: string;
  category: string;
  fulfillment: FulfillmentMode;
  salePrice: number;
  unitCost: number;
  inboundShipping: number;
  packagingCost: number;
  taxPercent: number;
  acosPercent: number;
  weightGrams: number;
  stockUnits: number;
  dailySalesVelocity: number;
  buyBoxOwner: 'Sua Loja' | 'Concorrente';
  updatedAt: string;
}

export interface PlannerInputs {
  id?: string;
  name: string;
  initialCapital: number;
  averageTicket: number;
  targetNetMarginPercent: number;
  reinvestmentPercent: number;
  taxPercent: number;
  restockCycleDays: number;
  monthlyGrowthPercent: number;
}

export interface PlannerMonthRow {
  month: number;
  label: string;
  investedStock: number;
  unitsSold: number;
  grossRevenue: number;
  amazonFees: number;
  taxes: number;
  netProfit: number;
  reinvested: number;
  withdrawn: number;
  endingCapital: number;
}

export interface UnitEconomicsResult {
  referralRate: number;
  referralFee: number;
  fulfillmentFee: number;
  taxAmount: number;
  adsAmount: number;
  totalCosts: number;
  netProfit: number;
  marginPercent: number;
  roiPercent: number;
  breakEvenAcos: number;
}

export type AlertChannel = 'email' | 'push' | 'ambos';

export type AlertRuleType =
  | 'competitor_price_below'
  | 'low_stock_days'
  | 'low_stock_units'
  | 'margin_below'
  | 'buybox_lost';

export interface AlertRule {
  id: string;
  name: string;
  type: AlertRuleType;
  targetAsinOrSku: string;
  thresholdValue: number;
  thresholdUnit: 'BRL' | 'dias' | 'unidades' | '%';
  channel: AlertChannel;
  enabled: boolean;
  updatedAt: string;
}

export interface AlertNotificationConfig {
  emailEnabled: boolean;
  notificationEmail: string;
  pushEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  rules: AlertRule[];
}

export interface TriggeredAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  targetLabel: string;
  currentValueText: string;
  thresholdText: string;
  channel: AlertChannel;
  severity: 'alta' | 'media';
}
