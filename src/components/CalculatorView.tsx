import React, { useMemo, useState } from 'react';
import { Calculator, CheckCircle2, Plus } from 'lucide-react';
import type { FulfillmentMode, StoreSku, UserProfile } from '../types';
import {
  AMAZON_BR_CATEGORY_RATES,
  calculateUnitEconomics,
  formatBRL,
} from '../utils/amazonBr';

interface CalculatorViewProps {
  user: UserProfile;
  onSaveAsSku: (payload: Partial<StoreSku>) => Promise<void>;
}

const CATEGORIES = Object.keys(AMAZON_BR_CATEGORY_RATES);

export const CalculatorView: React.FC<CalculatorViewProps> = ({
  user,
  onSaveAsSku,
}) => {
  const [title, setTitle] = useState('Produto Simulado Amazon BR');
  const [salePrice, setSalePrice] = useState(199.9);
  const [unitCost, setUnitCost] = useState(84.0);
  const [inboundShipping, setInboundShipping] = useState(4.5);
  const [packagingCost, setPackagingCost] = useState(2.0);
  const [category, setCategory] = useState('Casa e Cozinha');
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>('FBA');
  const [weightGrams, setWeightGrams] = useState(850);
  const [taxPercent, setTaxPercent] = useState(user.defaultTaxRate);
  const [acosPercent, setAcosPercent] = useState(4.0);

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const result = useMemo(
    () =>
      calculateUnitEconomics({
        salePrice,
        unitCost,
        inboundShipping,
        packagingCost,
        category,
        fulfillment,
        weightGrams,
        taxPercent,
        acosPercent,
      }),
    [
      salePrice,
      unitCost,
      inboundShipping,
      packagingCost,
      category,
      fulfillment,
      weightGrams,
      taxPercent,
      acosPercent,
    ]
  );

  const modeComparison = useMemo(() => {
    return (['FBA', 'DBA', 'FBM'] as const).map((m) => ({
      mode: m,
      econ: calculateUnitEconomics({
        salePrice,
        unitCost,
        inboundShipping,
        packagingCost,
        category,
        fulfillment: m,
        weightGrams,
        taxPercent,
        acosPercent,
      }),
    }));
  }, [
    salePrice,
    unitCost,
    inboundShipping,
    packagingCost,
    category,
    weightGrams,
    taxPercent,
    acosPercent,
  ]);

  // Visual breakdown bar percentages
  const safePrice = Math.max(1, salePrice);
  const productPct = Math.min(100, Math.round(((unitCost + inboundShipping + packagingCost) / safePrice) * 100));
  const amazonPct = Math.min(100, Math.round(((result.referralFee + result.fulfillmentFee) / safePrice) * 100));
  const taxAdsPct = Math.min(100, Math.round(((result.taxAmount + result.adsAmount) / safePrice) * 100));
  const profitPct = Math.max(0, 100 - productPct - amazonPct - taxAdsPct);

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg(null);
    try {
      await onSaveAsSku({
        title: title.trim() || 'Produto Calculadora',
        asin: `B0CALC${Math.floor(1000 + Math.random() * 8999)}`,
        category,
        fulfillment,
        salePrice,
        unitCost,
        inboundShipping,
        packagingCost,
        taxPercent,
        acosPercent,
        weightGrams,
        stockUnits: 30,
        dailySalesVelocity: 2.5,
      });
      setSavedMsg('Produto salvo em Meus Produtos!');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Spotlight Header */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 p-6 sm:p-7 text-white shadow-lg shadow-indigo-500/20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Calculator className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                Calculadora de Lucro Amazon Brasil
              </h2>
              <p className="text-sm text-blue-50 mt-0.5">
                Simule em segundos quanto sobra limpo no seu bolso após taxas, frete FBA/DBA e impostos.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-4 h-10 rounded-xl bg-white text-indigo-700 hover:bg-amber-50 font-semibold text-xs inline-flex items-center gap-2 shadow-md hover:-translate-y-0.5 transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{saving ? 'Salvando...' : 'Salvar como SKU na Loja'}</span>
          </button>
        </div>
        {savedMsg && (
          <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/20 text-xs font-semibold text-white">
            <CheckCircle2 className="w-4 h-4" />
            <span>{savedMsg}</span>
          </div>
        )}
      </div>

      {/* Main 2-Column Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Simple Grouped Inputs */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nome do Produto (opcional, para salvar depois)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-10 px-3.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Step 1: Sale & Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                1. Preço de Venda na Amazon (R$)
              </label>
              <input
                type="number"
                min={10}
                step={1}
                value={salePrice}
                onChange={(e) => setSalePrice(Number(e.target.value))}
                className="w-full h-11 px-3.5 text-base font-bold font-mono bg-slate-50 border border-slate-200 rounded-xl tabular-nums focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                2. Como você vai entregar?
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl h-11">
                {(['FBA', 'DBA', 'FBM'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFulfillment(m)}
                    className={`text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer ${
                      fulfillment === m
                        ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-indigo-700'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Step 2: Cost & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                3. Custo de Compra (R$)
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={unitCost}
                onChange={(e) => setUnitCost(Number(e.target.value))}
                className="w-full h-11 px-3.5 text-base font-bold font-mono bg-slate-50 border border-slate-200 rounded-xl tabular-nums focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Categoria (Comissão)
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-11 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c} ({(AMAZON_BR_CATEGORY_RATES[c] * 100).toFixed(0)}%)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Peso Embalado (gramas)
              </label>
              <input
                type="number"
                min={50}
                step={50}
                value={weightGrams}
                onChange={(e) => setWeightGrams(Number(e.target.value))}
                className="w-full h-11 px-3.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl tabular-nums focus:bg-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Step 3: Taxes & Extras */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Frete Entrada (R$)
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={inboundShipping}
                onChange={(e) => setInboundShipping(Number(e.target.value))}
                className="w-full h-9 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Embalagem (R$)
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={packagingCost}
                onChange={(e) => setPackagingCost(Number(e.target.value))}
                className="w-full h-9 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Imposto NF (%)
              </label>
              <input
                type="number"
                min={0}
                max={25}
                step={0.5}
                value={taxPercent}
                onChange={(e) => setTaxPercent(Number(e.target.value))}
                className="w-full h-9 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Ads / ACOS (%)
              </label>
              <input
                type="number"
                min={0}
                max={40}
                step={0.5}
                value={acosPercent}
                onChange={(e) => setAcosPercent(Number(e.target.value))}
                className="w-full h-9 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
              />
            </div>
          </div>
        </div>

        {/* Right: Crystal Clear Visual Result */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Resultado por Unidade Vendida
              </span>
              <span
                className={`text-xs font-bold ${
                  result.marginPercent >= 15
                    ? 'text-emerald-700'
                    : result.marginPercent > 0
                      ? 'text-amber-700'
                      : 'text-rose-700'
                }`}
              >
                {result.marginPercent >= 15
                  ? 'Margem Saudável'
                  : result.marginPercent > 0
                    ? 'Margem Apertada'
                    : 'Prejuízo'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-slate-700">
                Lucro Líquido
              </span>
              <span
                className={`text-3xl font-bold font-mono tabular-nums ${
                  result.netProfit > 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {formatBRL(result.netProfit)}
              </span>
            </div>

            {/* Visual Distribution Bar */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">
                Para onde vai cada real da venda
              </div>
              <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-100">
                <div style={{ width: `${productPct}%` }} className="bg-indigo-600" title="Custo do Produto" />
                <div style={{ width: `${amazonPct}%` }} className="bg-amber-500" title="Taxas Amazon" />
                <div style={{ width: `${taxAdsPct}%` }} className="bg-cyan-500" title="Imposto e Ads" />
                <div style={{ width: `${profitPct}%` }} className="bg-emerald-500" title="Seu Lucro" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 inline-block" />
                  Produto + Frete ({productPct}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                  Taxas Amazon ({amazonPct}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500 inline-block" />
                  Imposto + Ads ({taxAdsPct}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                  Seu Lucro ({profitPct}%)
                </span>
              </div>
            </div>

            {/* Breakdown Numbers */}
            <div className="space-y-2 text-xs pt-3 border-t border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-600">Comissão Amazon ({(result.referralRate * 100).toFixed(0)}%)</span>
                <span className="font-mono text-slate-900 tabular-nums">- {formatBRL(result.referralFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Tarifa Logística ({fulfillment})</span>
                <span className="font-mono text-slate-900 tabular-nums">- {formatBRL(result.fulfillmentFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Impostos ({taxPercent}%) + Ads ({acosPercent}%)</span>
                <span className="font-mono text-slate-900 tabular-nums">
                  - {formatBRL(result.taxAmount + result.adsAmount)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100 text-center">
            <div className="p-3 rounded-xl bg-indigo-50/70">
              <div className="text-[11px] font-medium text-indigo-700">Margem</div>
              <div className="mt-1 text-base font-bold font-mono text-indigo-950 tabular-nums">
                {result.marginPercent.toFixed(1)}%
              </div>
            </div>
            <div className="p-3 rounded-xl bg-violet-50/70">
              <div className="text-[11px] font-medium text-violet-700">ROI</div>
              <div className="mt-1 text-base font-bold font-mono text-violet-950 tabular-nums">
                {result.roiPercent.toFixed(0)}%
              </div>
            </div>
            <div className="p-3 rounded-xl bg-cyan-50/70">
              <div className="text-[11px] font-medium text-cyan-700">ACOS Máx.</div>
              <div className="mt-1 text-base font-bold font-mono text-cyan-950 tabular-nums">
                {result.breakEvenAcos.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Comparison Strip (FBA vs DBA vs FBM) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {modeComparison.map(({ mode, econ }) => {
          const isSelected = mode === fulfillment;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setFulfillment(mode)}
              className={`p-5 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'bg-gradient-to-br from-indigo-50 via-white to-cyan-50 border-indigo-400 shadow-md shadow-indigo-500/10'
                  : 'bg-white border-slate-200 hover:border-indigo-300 hover:-translate-y-0.5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">
                  Simulação {mode}
                </span>
                <span className="text-xs font-semibold text-indigo-600">
                  {isSelected ? 'Selecionado' : 'Comparar'}
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-xs text-slate-500">Lucro líquido:</span>
                <span
                  className={`text-lg font-bold font-mono tabular-nums ${
                    econ.netProfit > 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {formatBRL(econ.netProfit)}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-xs text-slate-500 font-mono tabular-nums">
                <span>Frete {mode}: {formatBRL(econ.fulfillmentFee)}</span>
                <span>Margem {econ.marginPercent.toFixed(1)}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
