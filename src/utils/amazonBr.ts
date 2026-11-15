import type {
  FulfillmentMode,
  PlannerInputs,
  PlannerMonthRow,
  UnitEconomicsResult,
} from '../types';

export const AMAZON_BR_CATEGORY_RATES: Record<string, number> = {
  'Casa e Cozinha': 0.12,
  'Eletrônicos': 0.10,
  'Informática': 0.10,
  'Beleza': 0.14,
  'Ferramentas': 0.12,
  'Esportes e Aventura': 0.12,
  'Pet Shop': 0.13,
  'Papelaria e Escritório': 0.13,
  'Brinquedos': 0.14,
};

export function getCategoryReferralRate(category: string): number {
  return AMAZON_BR_CATEGORY_RATES[category] ?? 0.12;
}

/**
 * Estimates Amazon Brasil FBA / DBA / FBM fulfillment fee based on weight and price tier.
 */
export function estimateFulfillmentFee(
  mode: FulfillmentMode,
  weightGrams: number,
  salePrice: number
): number {
  if (mode === 'FBM') {
    // Merchant-fulfilled average courier label cost for items >= R$ 79 (or shared)
    if (salePrice < 79) return 14.9;
    if (weightGrams <= 500) return 18.9;
    if (weightGrams <= 1000) return 22.5;
    if (weightGrams <= 2000) return 27.9;
    return 34.9;
  }

  // FBA / DBA Brasil progressive fee structure
  const baseDiscount = salePrice < 79 ? 0.65 : 1.0;
  let baseFee = 19.95;

  if (weightGrams <= 250) baseFee = 18.45;
  else if (weightGrams <= 500) baseFee = 19.95;
  else if (weightGrams <= 1000) baseFee = 22.95;
  else if (weightGrams <= 2000) baseFee = 26.45;
  else if (weightGrams <= 5000) baseFee = 33.9;
  else baseFee = 42.5;

  // DBA typically adds a small pickup/label handling differential compared to FBA
  const modeFactor = mode === 'DBA' ? 1.06 : 1.0;
  return Number((baseFee * baseDiscount * modeFactor).toFixed(2));
}

export function calculateUnitEconomics(params: {
  salePrice: number;
  unitCost: number;
  inboundShipping: number;
  packagingCost: number;
  category: string;
  fulfillment: FulfillmentMode;
  weightGrams: number;
  taxPercent: number;
  acosPercent: number;
}): UnitEconomicsResult {
  const {
    salePrice,
    unitCost,
    inboundShipping,
    packagingCost,
    category,
    fulfillment,
    weightGrams,
    taxPercent,
    acosPercent,
  } = params;

  const referralRate = getCategoryReferralRate(category);
  const referralFee = Number((salePrice * referralRate).toFixed(2));
  const fulfillmentFee = estimateFulfillmentFee(fulfillment, weightGrams, salePrice);
  const taxAmount = Number((salePrice * (taxPercent / 100)).toFixed(2));
  const adsAmount = Number((salePrice * (acosPercent / 100)).toFixed(2));

  const totalCosts = Number(
    (
      unitCost +
      inboundShipping +
      packagingCost +
      referralFee +
      fulfillmentFee +
      taxAmount +
      adsAmount
    ).toFixed(2)
  );

  const netProfit = Number((salePrice - totalCosts).toFixed(2));
  const marginPercent = salePrice > 0 ? Number(((netProfit / salePrice) * 100).toFixed(1)) : 0;
  const investedBase = unitCost + inboundShipping + packagingCost;
  const roiPercent = investedBase > 0 ? Number(((netProfit / investedBase) * 100).toFixed(1)) : 0;

  const profitBeforeAds = netProfit + adsAmount;
  const breakEvenAcos =
    salePrice > 0 ? Number(Math.max(0, (profitBeforeAds / salePrice) * 100).toFixed(1)) : 0;

  return {
    referralRate,
    referralFee,
    fulfillmentFee,
    taxAmount,
    adsAmount,
    totalCosts,
    netProfit,
    marginPercent,
    roiPercent,
    breakEvenAcos,
  };
}

export function buildPlannerSchedule(inputs: PlannerInputs): PlannerMonthRow[] {
  const rows: PlannerMonthRow[] = [];
  let capital = Math.max(1000, inputs.initialCapital);
  const months = [
    'Mês 1',
    'Mês 2',
    'Mês 3',
    'Mês 4',
    'Mês 5',
    'Mês 6',
    'Mês 7',
    'Mês 8',
    'Mês 9',
    'Mês 10',
    'Mês 11',
    'Mês 12',
  ];

  // Typical markup: cost represents ~46% of Amazon sale price in healthy resale/PL
  const costToRevenueFactor = 2.15;
  const turnoverPerMonth = Math.max(0.5, 30 / Math.max(15, inputs.restockCycleDays));

  for (let i = 0; i < 12; i++) {
    const investedStock = Number(capital.toFixed(2));
    const growthMultiplier = 1 + (inputs.monthlyGrowthPercent / 100) * Math.min(i, 6) * 0.25;
    const grossRevenue = Number(
      (investedStock * costToRevenueFactor * turnoverPerMonth * growthMultiplier).toFixed(2)
    );
    const unitsSold = Math.max(1, Math.round(grossRevenue / Math.max(20, inputs.averageTicket)));
    const amazonFees = Number((grossRevenue * 0.27).toFixed(2));
    const taxes = Number((grossRevenue * (inputs.taxPercent / 100)).toFixed(2));
    const netProfit = Number((grossRevenue * (inputs.targetNetMarginPercent / 100)).toFixed(2));
    const reinvested = Number((netProfit * (inputs.reinvestmentPercent / 100)).toFixed(2));
    const withdrawn = Number((netProfit - reinvested).toFixed(2));

    capital = Number((capital + reinvested).toFixed(2));

    rows.push({
      month: i + 1,
      label: months[i],
      investedStock,
      unitsSold,
      grossRevenue,
      amazonFees,
      taxes,
      netProfit,
      reinvested,
      withdrawn,
      endingCapital: capital,
    });
  }

  return rows;
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumberBR(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}
