import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import type { MarketProduct, UserProfile } from '../types';
import { apiRequest } from '../utils/api';
import {
  calculateUnitEconomics,
  formatBRL,
  formatNumberBR,
} from '../utils/amazonBr';

interface MarketExplorerViewProps {
  user: UserProfile;
  onAddToStore: (product: MarketProduct) => Promise<void>;
  onAddCompetitor: (product: MarketProduct) => Promise<void>;
}

const CATEGORIES = [
  'Todas',
  'Casa e Cozinha',
  'Ferramentas',
  'Eletrônicos',
  'Informática',
  'Beleza',
  'Esportes e Aventura',
  'Pet Shop',
  'Papelaria e Escritório',
];

export const MarketExplorerView: React.FC<MarketExplorerViewProps> = ({
  user,
  onAddToStore,
  onAddCompetitor,
}) => {
  const [products, setProducts] = useState<MarketProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');
  const [mode, setMode] = useState<'Todos' | 'FBA' | 'DBA' | 'FBM'>('Todos');
  const [maxBsr, setMaxBsr] = useState<number>(500);
  const [maxSellers, setMaxSellers] = useState<number>(20);
  const [sortBy, setSortBy] = useState<'sales' | 'bsr' | 'margin'>('sales');

  const [selected, setSelected] = useState<MarketProduct | null>(null);
  const [customCost, setCustomCost] = useState<number>(0);
  const [customAcos, setCustomAcos] = useState<number>(4);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          q: query,
          category,
          mode,
          maxBsr: String(maxBsr),
          maxSellers: String(maxSellers),
        });
        const data = await apiRequest<{ products: MarketProduct[] }>(
          `/api/market/products?${params.toString()}`
        );
        if (active) setProducts(data.products);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar catálogo.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [query, category, mode, maxBsr, maxSellers]);

  const enriched = useMemo(() => {
    const list = products.map((p) => {
      const econ = calculateUnitEconomics({
        salePrice: p.price,
        unitCost: p.estimatedCost,
        inboundShipping: 4.5,
        packagingCost: 2.0,
        category: p.category,
        fulfillment: p.buyBoxMode,
        weightGrams: p.weightGrams,
        taxPercent: user.defaultTaxRate,
        acosPercent: 4.0,
      });
      return { product: p, econ };
    });

    list.sort((a, b) => {
      if (sortBy === 'bsr') return a.product.bsr - b.product.bsr;
      if (sortBy === 'margin') return b.econ.marginPercent - a.econ.marginPercent;
      return b.product.monthlySales - a.product.monthlySales;
    });
    return list;
  }, [products, sortBy, user.defaultTaxRate]);

  const openDrawer = (p: MarketProduct) => {
    setSelected(p);
    setCustomCost(p.estimatedCost);
    setCustomAcos(4);
    setActionNotice(null);
  };

  const drawerEcon = useMemo(() => {
    if (!selected) return null;
    return calculateUnitEconomics({
      salePrice: selected.price,
      unitCost: customCost,
      inboundShipping: 4.5,
      packagingCost: 2.0,
      category: selected.category,
      fulfillment: selected.buyBoxMode,
      weightGrams: selected.weightGrams,
      taxPercent: user.defaultTaxRate,
      acosPercent: customAcos,
    });
  }, [selected, customCost, customAcos, user.defaultTaxRate]);

  return (
    <div className="space-y-5">
      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por produto, ASIN ou marca na Amazon Brasil..."
              className="w-full h-10 pl-9 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-amber-600"
            />
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            {(['Todos', 'FBA', 'DBA', 'FBM'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === m
                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-indigo-700'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Categoria Amazon BR
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              BSR Máximo: <span className="font-mono text-slate-900">{maxBsr}</span>
            </label>
            <input
              type="range"
              min={50}
              max={500}
              step={25}
              value={maxBsr}
              onChange={(e) => setMaxBsr(Number(e.target.value))}
              className="w-full accent-amber-600 mt-2"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Máx. Vendedores no Anúncio:{' '}
              <span className="font-mono text-slate-900">{maxSellers}</span>
            </label>
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={maxSellers}
              onChange={(e) => setMaxSellers(Number(e.target.value))}
              className="w-full accent-amber-600 mt-2"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Ordenar Oportunidades
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'sales' | 'bsr' | 'margin')}
              className="w-full h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="sales">Maior volume de vendas/mês</option>
              <option value="bsr">Menor BSR (melhor ranking)</option>
              <option value="margin">Maior margem estimada (%)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <span>
              <strong className="text-slate-900 tabular-nums">{enriched.length}</strong> produtos encontrados no catálogo analisado
            </span>
          </div>
          <div className="text-xs text-slate-500">
            Clique em qualquer linha para abrir o Raio-X do produto
          </div>
        </div>

        {error && (
          <div className="p-6 text-sm text-red-700 bg-red-50 border-b border-red-200">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-6">Produto / Marca</th>
                <th className="py-3 px-4">BSR</th>
                <th className="py-3 px-4 text-right">Preço</th>
                <th className="py-3 px-4 text-right">Vendas/mês</th>
                <th className="py-3 px-4 text-right">Receita Est.</th>
                <th className="py-3 px-4 text-right">Vendedores</th>
                <th className="py-3 px-4 text-right">Margem Est.</th>
                <th className="py-3 px-6 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="py-4 px-6">
                      <div className="h-5 bg-slate-100 rounded animate-pulse w-full" />
                    </td>
                  </tr>
                ))
              ) : enriched.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-500">
                    Nenhum produto corresponde aos filtros selecionados. Ajuste BSR ou número máximo de vendedores.
                  </td>
                </tr>
              ) : (
                enriched.map(({ product, econ }) => (
                  <tr
                    key={product.asin}
                    onClick={() => openDrawer(product)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-6">
                      <div className="font-medium text-slate-900 max-w-sm truncate">
                        {product.title}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                        {product.asin} · {product.brand} · {product.category} · {product.buyBoxMode}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                      <span className="font-semibold text-slate-900">#{product.bsr}</span>
                      <span
                        className={`ml-1.5 ${
                          product.bsrDelta30d < 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {product.bsrDelta30d < 0 ? `${product.bsrDelta30d}` : `+${product.bsrDelta30d}`}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-medium text-slate-900 tabular-nums">
                      {formatBRL(product.price)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-800 tabular-nums">
                      {formatNumberBR(product.monthlySales)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {formatBRL(product.price * product.monthlySales)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums">
                      <span className="text-slate-900">{product.sellersCount}</span>
                      {product.amazonInBuyBox && (
                        <span className="block text-[10px] text-amber-700">
                          Amazon na Buy Box
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold tabular-nums">
                      <span
                        className={
                          econ.marginPercent >= 15
                            ? 'text-emerald-700'
                            : econ.marginPercent >= 8
                              ? 'text-amber-700'
                              : 'text-red-700'
                        }
                      >
                        {econ.marginPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDrawer(product);
                        }}
                        className="btn-tech-secondary px-3 py-1.5 text-xs"
                      >
                        Raio-X
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product X-Ray Drawer (Extension-style Detail Panel) */}
      {selected && drawerEcon && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setSelected(null)}
          />
          <div className="relative z-10 w-full max-w-lg bg-white h-full overflow-y-auto border-l border-slate-200 p-6 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <div className="text-xs font-mono text-slate-500">
                    ASIN {selected.asin} · EAN {selected.ean}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-1 leading-snug">
                    {selected.title}
                  </h3>
                  <div className="text-xs text-slate-500 mt-1">
                    {selected.brand} · {selected.category} · Nota {selected.rating} ({formatNumberBR(selected.reviewsCount)} avaliações)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Fechar painel"
                  className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 30-day BSR Sparkline */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-slate-700">
                    Evolução do Ranking (BSR últimos 8 períodos)
                  </span>
                  <span className="font-mono text-slate-600 tabular-nums">
                    Atual: #{selected.bsr}
                  </span>
                </div>
                <div className="h-20 bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-end gap-2">
                  {selected.bsrHistory.map((val, i) => {
                    const maxB = Math.max(...selected.bsrHistory);
                    const minB = Math.min(...selected.bsrHistory);
                    // Lower BSR is better (taller bar = stronger sales rank)
                    const norm =
                      maxB === minB ? 70 : Math.round(25 + ((maxB - val) / (maxB - minB)) * 75);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                        <div
                          style={{ height: `${norm}%` }}
                          title={`BSR #${val}`}
                          className="w-full bg-slate-800 rounded-t"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Interactive Profit Simulator inside X-Ray */}
              <div className="space-y-4 pt-2 border-t border-slate-200">
                <div className="text-xs font-semibold text-slate-900">
                  Simulação Rápida de Margem ({selected.buyBoxMode})
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Seu Custo Fornecedor (R$)
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={0.5}
                      value={customCost}
                      onChange={(e) => setCustomCost(Number(e.target.value))}
                      className="w-full h-9 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Verba Ads / ACOS (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      step={0.5}
                      value={customAcos}
                      onChange={(e) => setCustomAcos(Number(e.target.value))}
                      className="w-full h-9 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Preço Buy Box Amazon BR</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {formatBRL(selected.price)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      Comissão Amazon ({(drawerEcon.referralRate * 100).toFixed(0)}%)
                    </span>
                    <span className="font-mono text-slate-700 tabular-nums">
                      - {formatBRL(drawerEcon.referralFee)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      Logística {selected.buyBoxMode} ({selected.weightGrams}g)
                    </span>
                    <span className="font-mono text-slate-700 tabular-nums">
                      - {formatBRL(drawerEcon.fulfillmentFee)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      Impostos ({user.defaultTaxRate}%) + Ads ({customAcos}%)
                    </span>
                    <span className="font-mono text-slate-700 tabular-nums">
                      - {formatBRL(drawerEcon.taxAmount + drawerEcon.adsAmount)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
                    <span className="font-semibold text-slate-900">Lucro Líquido / Un.</span>
                    <span
                      className={`font-mono text-base font-bold tabular-nums ${
                        drawerEcon.netProfit > 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {formatBRL(drawerEcon.netProfit)} ({drawerEcon.marginPercent.toFixed(1)}% · ROI{' '}
                      {drawerEcon.roiPercent.toFixed(0)}%)
                    </span>
                  </div>
                </div>
              </div>

              {actionNotice && (
                <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
                  {actionNotice}
                </div>
              )}
            </div>

            <div className="pt-6 mt-6 border-t border-slate-200 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={async () => {
                  await onAddCompetitor(selected);
                  setActionNotice('Adicionado ao Monitor de Concorrentes.');
                }}
                className="btn-tech-secondary h-10 px-4 text-xs"
              >
                <Eye className="w-4 h-4" />
                <span>Monitorar ASIN</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onAddToStore({ ...selected, estimatedCost: customCost });
                  setActionNotice('Produto adicionado à Loja.');
                }}
                className="btn-tech-primary h-10 px-4 text-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar à Loja</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
