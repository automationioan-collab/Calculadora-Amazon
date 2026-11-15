import React, { useState } from 'react';
import { Eye, Plus, Search, Trash2 } from 'lucide-react';
import type { CompetitorWatch } from '../types';
import { formatBRL, formatNumberBR } from '../utils/amazonBr';

interface CompetitorSpyViewProps {
  competitors: CompetitorWatch[];
  onAdd: (payload: {
    sellerName: string;
    sellerId: string;
    primaryAsin: string;
  }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export const CompetitorSpyView: React.FC<CompetitorSpyViewProps> = ({
  competitors,
  onAdd,
  onRemove,
}) => {
  const [search, setSearch] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [primaryAsin, setPrimaryAsin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = competitors.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.sellerName.toLowerCase().includes(q) ||
      c.primaryAsin.toLowerCase().includes(q) ||
      c.productTitle.toLowerCase().includes(q) ||
      c.sellerId.toLowerCase().includes(q)
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerName.trim() || !primaryAsin.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onAdd({ sellerName, sellerId, primaryAsin });
      setSellerName('');
      setSellerId('');
      setPrimaryAsin('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar concorrente.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalMonitoredRev = competitors.reduce(
    (acc, c) => acc + c.estimatedMonthlyRevenue,
    0
  );
  const fbaShare =
    competitors.length > 0
      ? Math.round(
          (competitors.filter((c) => c.fulfillment === 'FBA').length /
            competitors.length) *
            100
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Concorrentes Monitorados</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {competitors.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Rastreamento de preço e posse de Buy Box
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Faturamento Estimado Agregado</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {formatBRL(totalMonitoredRev)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Volume mensal dos anúncios vigiados
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Predominância Logística FBA</div>
          <div className="mt-1.5 text-2xl font-bold text-amber-700 tabular-nums">
            {fbaShare}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Operações usando Fulfillment by Amazon
          </div>
        </div>
      </div>

      {/* Add Competitor Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Adicionar Loja ou ASIN Concorrente
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Informe o nome do seller e o ASIN principal (ex: B09V3KXJPB, B0D4R7N1QX) para acompanhar variação de preço e share de Buy Box.
          </p>
        </div>

        {error && (
          <div className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <input
            type="text"
            required
            value={sellerName}
            onChange={(e) => setSellerName(e.target.value)}
            placeholder="Nome da loja concorrente (ex: Loja Casa Prime)"
            className="sm:col-span-4 h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-amber-600"
          />
          <input
            type="text"
            required
            value={primaryAsin}
            onChange={(e) => setPrimaryAsin(e.target.value)}
            placeholder="ASIN alvo (ex: B09V3KXJPB)"
            className="sm:col-span-3 h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-amber-600"
          />
          <input
            type="text"
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            placeholder="Seller ID (opcional)"
            className="sm:col-span-3 h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-amber-600"
          />
          <button
            type="submit"
            disabled={submitting}
            className="sm:col-span-2 btn-tech-primary h-10 px-4 text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{submitting ? 'Salvando...' : 'Monitorar'}</span>
          </button>
        </form>
      </div>

      {/* Watchlist Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">
              Radar de Concorrência
            </h3>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por seller, ASIN ou produto..."
              className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-6">Loja / Seller ID</th>
                <th className="py-3 px-4">Anúncio Principal (ASIN)</th>
                <th className="py-3 px-4">Logística</th>
                <th className="py-3 px-4 text-right">Preço Atual</th>
                <th className="py-3 px-4 text-right">Variação 7d</th>
                <th className="py-3 px-4 text-right">Buy Box Share</th>
                <th className="py-3 px-4 text-right">Receita Est./mês</th>
                <th className="py-3 px-6 text-right">Remover</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                    Nenhum concorrente encontrado na lista de monitoramento.
                  </td>
                </tr>
              ) : (
                filtered.map((comp) => (
                  <tr key={comp.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-6">
                      <div className="font-semibold text-slate-900">
                        {comp.sellerName}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5 tabular-nums">
                        {comp.sellerId} · {formatNumberBR(comp.activeSkus)} SKUs ativos
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-xs font-medium text-slate-800 max-w-xs truncate">
                        {comp.productTitle}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                        {comp.primaryAsin} · {comp.category}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-700">
                      {comp.fulfillment}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums">
                      {formatBRL(comp.currentPrice)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums">
                      {comp.priceChange7d === 0 ? (
                        <span className="text-slate-500">Estável</span>
                      ) : comp.priceChange7d < 0 ? (
                        <span className="text-red-700">
                          {formatBRL(comp.priceChange7d)}
                        </span>
                      ) : (
                        <span className="text-emerald-700">
                          +{formatBRL(comp.priceChange7d)}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-medium text-slate-800 tabular-nums">
                      {comp.buyBoxSharePercent}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums">
                      {formatBRL(comp.estimatedMonthlyRevenue)}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <button
                        type="button"
                        onClick={() => onRemove(comp.id)}
                        aria-label={`Remover ${comp.sellerName}`}
                        className="btn-tech-danger p-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
