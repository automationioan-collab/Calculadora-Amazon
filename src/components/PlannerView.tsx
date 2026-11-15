import React, { useMemo, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import type { PlannerInputs } from '../types';
import {
  buildPlannerSchedule,
  formatBRL,
  formatNumberBR,
} from '../utils/amazonBr';

interface PlannerViewProps {
  scenarios: PlannerInputs[];
  onSaveScenario: (scenario: PlannerInputs) => Promise<void>;
  onDeleteScenario: (id: string) => Promise<void>;
}

export const PlannerView: React.FC<PlannerViewProps> = ({
  scenarios,
  onSaveScenario,
  onDeleteScenario,
}) => {
  const [inputs, setInputs] = useState<PlannerInputs>(
    scenarios[0] || {
      name: 'Plano de Crescimento FBA 12 Meses',
      initialCapital: 25000,
      averageTicket: 165,
      targetNetMarginPercent: 18,
      reinvestmentPercent: 80,
      taxPercent: 6.5,
      restockCycleDays: 28,
      monthlyGrowthPercent: 12,
    }
  );
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const schedule = useMemo(() => buildPlannerSchedule(inputs), [inputs]);
  const month12 = schedule[schedule.length - 1];
  const totalProfit12m = schedule.reduce((acc, r) => acc + r.netProfit, 0);
  const totalWithdrawn12m = schedule.reduce((acc, r) => acc + r.withdrawn, 0);
  const maxRevenue = Math.max(...schedule.map((r) => r.grossRevenue), 1);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(null);
    try {
      await onSaveScenario(inputs);
      setSavedNotice('Cenário salvo no seu planejamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Saved Scenarios Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Planejamento Financeiro & Giro de Estoque (12 Meses)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Simule juros compostos de estoque reinvestindo parte do lucro líquido a cada ciclo de reposição.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {scenarios.map((sc) => (
            <div
              key={sc.id || sc.name}
              className="flex items-center border border-indigo-200 rounded-xl overflow-hidden bg-indigo-50/50"
            >
              <button
                type="button"
                onClick={() => {
                  setInputs(sc);
                  setSavedNotice(null);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-600 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {sc.name}
              </button>
              {sc.id && (
                <button
                  type="button"
                  onClick={() => onDeleteScenario(sc.id!)}
                  aria-label={`Excluir ${sc.name}`}
                  className="px-2 py-1.5 text-rose-500 hover:bg-rose-600 hover:text-white border-l border-indigo-200 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Split Layout: Parameters + Projection Chart & Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <form
          onSubmit={handleSave}
          className="xl:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nome do Cenário
            </label>
            <input
              type="text"
              required
              value={inputs.name}
              onChange={(e) => setInputs({ ...inputs, name: e.target.value })}
              className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Capital Inicial (R$)
              </label>
              <input
                type="number"
                min={1000}
                step={1000}
                value={inputs.initialCapital}
                onChange={(e) =>
                  setInputs({ ...inputs, initialCapital: Number(e.target.value) })
                }
                className="w-full h-9 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Ticket Médio (R$)
              </label>
              <input
                type="number"
                min={25}
                step={5}
                value={inputs.averageTicket}
                onChange={(e) =>
                  setInputs({ ...inputs, averageTicket: Number(e.target.value) })
                }
                className="w-full h-9 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-semibold text-slate-700">Margem Líquida Alvo</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {inputs.targetNetMarginPercent}%
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={35}
              step={1}
              value={inputs.targetNetMarginPercent}
              onChange={(e) =>
                setInputs({
                  ...inputs,
                  targetNetMarginPercent: Number(e.target.value),
                })
              }
              className="w-full accent-amber-600"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-semibold text-slate-700">Reinvestimento do Lucro</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {inputs.reinvestmentPercent}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={inputs.reinvestmentPercent}
              onChange={(e) =>
                setInputs({
                  ...inputs,
                  reinvestmentPercent: Number(e.target.value),
                })
              }
              className="w-full accent-amber-600"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Ciclo (dias)
              </label>
              <input
                type="number"
                min={15}
                max={90}
                value={inputs.restockCycleDays}
                onChange={(e) =>
                  setInputs({ ...inputs, restockCycleDays: Number(e.target.value) })
                }
                className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Imposto (%)
              </label>
              <input
                type="number"
                min={0}
                max={25}
                step={0.5}
                value={inputs.taxPercent}
                onChange={(e) =>
                  setInputs({ ...inputs, taxPercent: Number(e.target.value) })
                }
                className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Cresc. (%/mês)
              </label>
              <input
                type="number"
                min={0}
                max={30}
                value={inputs.monthlyGrowthPercent}
                onChange={(e) =>
                  setInputs({
                    ...inputs,
                    monthlyGrowthPercent: Number(e.target.value),
                  })
                }
                className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
          </div>

          {savedNotice && (
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {savedNotice}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="btn-tech-primary w-full h-10 px-4 text-xs"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Salvando...' : 'Salvar Cenário'}</span>
          </button>
        </form>

        <div className="xl:col-span-8 space-y-6">
          {/* 3-Metric Result Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Faturamento no Mês 12</div>
              <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
                {formatBRL(month12.grossRevenue)}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {formatNumberBR(month12.unitsSold)} unidades/mês estimadas
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Lucro Acumulado (12m)</div>
              <div className="mt-1.5 text-2xl font-bold text-emerald-700 tabular-nums">
                {formatBRL(totalProfit12m)}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                Retirada pró-labore: {formatBRL(totalWithdrawn12m)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Capital em Estoque (Mês 12)</div>
              <div className="mt-1.5 text-2xl font-bold text-amber-700 tabular-nums">
                {formatBRL(month12.endingCapital)}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                Multiplicador:{' '}
                {(month12.endingCapital / Math.max(1, inputs.initialCapital)).toFixed(2)}x
              </div>
            </div>
          </div>

          {/* 12-Month Projection Bar Chart */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between text-xs mb-4">
              <span className="font-semibold text-slate-900">
                Curva de Faturamento Bruto & Lucro Líquido (Meses 1–12)
              </span>
              <div className="flex items-center gap-4 text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-slate-900 rounded-sm inline-block" />
                  Faturamento
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-emerald-600 rounded-sm inline-block" />
                  Lucro Líquido
                </span>
              </div>
            </div>

            <div className="h-44 flex items-end gap-2 border-b border-slate-200 pb-1">
              {schedule.map((row) => {
                const revH = Math.max(8, Math.round((row.grossRevenue / maxRevenue) * 100));
                const profH = Math.max(4, Math.round((row.netProfit / maxRevenue) * 100));
                return (
                  <div key={row.month} className="flex-1 h-full flex items-end justify-center gap-0.5">
                    <div
                      style={{ height: `${revH}%` }}
                      title={`${row.label}: ${formatBRL(row.grossRevenue)} bruto`}
                      className="w-1/2 bg-slate-900 rounded-t"
                    />
                    <div
                      style={{ height: `${profH}%` }}
                      title={`${row.label}: ${formatBRL(row.netProfit)} líquido`}
                      className="w-1/2 bg-emerald-600 rounded-t"
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 pt-2">
              {schedule.map((row) => (
                <div
                  key={row.month}
                  className="flex-1 text-center text-[11px] font-mono text-slate-500"
                >
                  M{row.month}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 12-Month Tabular Ledger */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Cronograma Financeiro Mês a Mês
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-6">Período</th>
                <th className="py-3 px-4 text-right">Estoque Base</th>
                <th className="py-3 px-4 text-right">Unidades</th>
                <th className="py-3 px-4 text-right">Faturamento</th>
                <th className="py-3 px-4 text-right">Lucro Líquido</th>
                <th className="py-3 px-4 text-right">Reinvestido</th>
                <th className="py-3 px-4 text-right">Retirada</th>
                <th className="py-3 px-6 text-right">Capital Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {schedule.map((r) => (
                <tr key={r.month} className="hover:bg-slate-50">
                  <td className="py-3 px-6 font-sans font-semibold text-slate-900">
                    {r.label}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-700">
                    {formatBRL(r.investedStock)}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-700">
                    {formatNumberBR(r.unitsSold)}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-900">
                    {formatBRL(r.grossRevenue)}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                    {formatBRL(r.netProfit)}
                  </td>
                  <td className="py-3 px-4 text-right text-amber-700">
                    {formatBRL(r.reinvested)}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600">
                    {formatBRL(r.withdrawn)}
                  </td>
                  <td className="py-3 px-6 text-right font-semibold text-slate-900">
                    {formatBRL(r.endingCapital)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
