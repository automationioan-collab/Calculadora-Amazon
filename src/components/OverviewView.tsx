import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Calculator,
  PackageCheck,
} from 'lucide-react';
import type {
  CompetitorWatch,
  StoreSku,
  WorkspaceTab,
} from '../types';
import {
  calculateUnitEconomics,
  formatBRL,
  formatNumberBR,
} from '../utils/amazonBr';
import { RevenueTrendChart } from './RevenueTrendChart';

interface OverviewViewProps {
  skus: StoreSku[];
  competitors: CompetitorWatch[];
  onNavigate: (tab: WorkspaceTab) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  skus,
  competitors,
  onNavigate,
}) => {
  // Quick inline calculator state for instant visibility
  const [quickPrice, setQuickPrice] = useState(199.9);
  const [quickCost, setQuickCost] = useState(84.0);

  const quickCalc = useMemo(
    () =>
      calculateUnitEconomics({
        salePrice: quickPrice,
        unitCost: quickCost,
        inboundShipping: 4.5,
        packagingCost: 2.0,
        category: 'Casa e Cozinha',
        fulfillment: 'FBA',
        weightGrams: 800,
        taxPercent: 6.5,
        acosPercent: 4.0,
      }),
    [quickPrice, quickCost]
  );

  const summary = useMemo(() => {
    let monthlyRevenue = 0;
    let monthlyProfit = 0;
    let buyBoxOwned = 0;
    let restockAlerts = 0;
    let totalStockUnits = 0;
    let fbaCount = 0;

    const enriched = skus.map((sku) => {
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

      const estMonthlyUnits = Math.round(sku.dailySalesVelocity * 30);
      const rev = estMonthlyUnits * sku.salePrice;
      const prof = estMonthlyUnits * econ.netProfit;
      const daysCoverage =
        sku.dailySalesVelocity > 0
          ? Math.round(sku.stockUnits / sku.dailySalesVelocity)
          : 999;

      monthlyRevenue += rev;
      monthlyProfit += prof;
      totalStockUnits += sku.stockUnits;
      if (sku.fulfillment === 'FBA') fbaCount += 1;
      if (sku.buyBoxOwner === 'Sua Loja') buyBoxOwned += 1;
      if (daysCoverage <= 12) restockAlerts += 1;

      return { sku, econ, estMonthlyUnits, rev, prof, daysCoverage };
    });

    const avgMargin =
      monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0;
    const buyBoxRate =
      skus.length > 0 ? Math.round((buyBoxOwned / skus.length) * 100) : 0;

    const competitorRevenue = competitors.reduce(
      (acc, c) => acc + c.estimatedMonthlyRevenue,
      0
    );
    const totalMarketPool = monthlyRevenue + competitorRevenue;
    const marketShare =
      totalMarketPool > 0 ? (monthlyRevenue / totalMarketPool) * 100 : 0;

    return {
      monthlyRevenue,
      monthlyProfit,
      avgMargin,
      buyBoxRate,
      restockAlerts,
      totalStockUnits,
      fbaCount,
      marketShare,
      totalMarketPool,
      enriched,
    };
  }, [skus, competitors]);

  return (
    <div className="space-y-6">
      {/* Clean 3-Card Summary KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('planner')}
          className="bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-md hover:shadow-indigo-500/10 hover:-translate-y-0.5 rounded-2xl p-6 text-left transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Receita Total (30 dias)
            </span>
            <ArrowUpRight className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2.5 text-3xl font-bold text-slate-900 font-mono tabular-nums">
            {formatBRL(summary.monthlyRevenue)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            Lucro líquido: <strong className="text-emerald-700">{formatBRL(summary.monthlyProfit)}</strong> ({summary.avgMargin.toFixed(1)}%)
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('store')}
          className="bg-white border border-slate-200 hover:border-cyan-400 hover:shadow-md hover:shadow-cyan-500/10 hover:-translate-y-0.5 rounded-2xl p-6 text-left transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              SKUs Ativos
            </span>
            <ArrowUpRight className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="mt-2.5 text-3xl font-bold text-slate-900 font-mono tabular-nums">
            {formatNumberBR(skus.length)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            {formatNumberBR(summary.totalStockUnits)} unidades · {summary.restockAlerts} alertas de reposição
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('spy')}
          className="bg-white border border-slate-200 hover:border-violet-400 hover:shadow-md hover:shadow-violet-500/10 hover:-translate-y-0.5 rounded-2xl p-6 text-left transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Market Share
            </span>
            <ArrowUpRight className="w-4 h-4 text-violet-600" />
          </div>
          <div className="mt-2.5 text-3xl font-bold text-indigo-700 font-mono tabular-nums">
            {summary.marketShare.toFixed(1)}%
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            Buy Box ativa em {summary.buyBoxRate}% dos anúncios
          </div>
        </button>
      </div>

      {/* Main Chart + Calculator Spotlight */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8">
          <RevenueTrendChart
            monthlyRevenue={summary.monthlyRevenue}
            monthlyProfit={summary.monthlyProfit}
          />
        </div>

        {/* Calculator Spotlight Widget */}
        <div className="xl:col-span-4 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 flex flex-col justify-between shadow-lg shadow-indigo-950/15">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    Calculadora Rápida
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Simule FBA na hora
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Venda (R$)
                </label>
                <input
                  type="number"
                  min={10}
                  step={5}
                  value={quickPrice}
                  onChange={(e) => setQuickPrice(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm font-mono font-bold text-white bg-white/10 border border-white/15 rounded-xl tabular-nums focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Custo (R$)
                </label>
                <input
                  type="number"
                  min={1}
                  step={2}
                  value={quickCost}
                  onChange={(e) => setQuickCost(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm font-mono font-bold text-white bg-white/10 border border-white/15 rounded-xl tabular-nums focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/10 border border-white/10 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-300">Lucro por unidade</span>
                <span
                  className={`text-xl font-bold font-mono tabular-nums ${
                    quickCalc.netProfit > 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {formatBRL(quickCalc.netProfit)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300 font-mono tabular-nums">
                <span>Margem: {quickCalc.marginPercent.toFixed(1)}%</span>
                <span>ROI: {quickCalc.roiPercent.toFixed(0)}%</span>
              </div>
            </div>
          </div>

          <div className="pt-5 space-y-2.5">
            <button
              type="button"
              onClick={() => onNavigate('calculator')}
              className="btn-tech-calc w-full h-11 px-4 text-xs"
            >
              <span>Abrir Calculadora Completa</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between pt-1 text-xs">
              <button
                type="button"
                onClick={() => onNavigate('market')}
                className="text-cyan-300 hover:text-white font-semibold transition-colors cursor-pointer"
              >
                Explorar Nichos
              </button>
              <button
                type="button"
                onClick={() => onNavigate('supplier')}
                className="text-violet-300 hover:text-white font-semibold transition-colors cursor-pointer"
              >
                Cruzar Lista CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Store Inventory & Buy Box Status Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Meus Produtos na Amazon
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Acompanhamento simples de lucro, estoque e Buy Box
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('store')}
            className="btn-tech-secondary h-9 px-4 text-xs"
          >
            Ver Todos os SKUs
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-6">Produto / ASIN</th>
                <th className="py-3 px-4">Logística</th>
                <th className="py-3 px-4 text-right">Preço</th>
                <th className="py-3 px-4 text-right">Lucro Un.</th>
                <th className="py-3 px-4 text-right">Margem</th>
                <th className="py-3 px-4 text-right">Estoque</th>
                <th className="py-3 px-6">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {summary.enriched.map(({ sku, econ, daysCoverage }) => {
                const lowStock = daysCoverage <= 12;
                const lostBuyBox = sku.buyBoxOwner !== 'Sua Loja';
                return (
                  <tr key={sku.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-medium text-slate-900 max-w-xs truncate">
                        {sku.title}
                      </div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                        {sku.asin} · {sku.sku}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-700">
                      {sku.fulfillment} · {sku.category}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-medium text-slate-900 tabular-nums">
                      {formatBRL(sku.salePrice)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                      {formatBRL(econ.netProfit)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {econ.marginPercent.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {formatNumberBR(sku.stockUnits)} un · {daysCoverage}d
                    </td>
                    <td className="py-3.5 px-6 text-xs font-medium">
                      {lowStock ? (
                        <span className="inline-flex items-center gap-1.5 text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Repor estoque ({daysCoverage}d)
                        </span>
                      ) : lostBuyBox ? (
                        <span className="inline-flex items-center gap-1.5 text-rose-700">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Buy Box perdida
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700">
                          <PackageCheck className="w-3.5 h-3.5 shrink-0" />
                          Saudável · Buy Box ativa
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {summary.enriched.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    Nenhum SKU cadastrado na loja ainda. Use a Calculadora para simular e salvar seu primeiro produto.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
