import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBRL } from '../utils/amazonBr';

interface RevenueTrendChartProps {
  monthlyRevenue: number;
  monthlyProfit: number;
}

interface ChartPoint {
  dateLabel: string;
  revenue: number;
  profit: number;
}

// Deterministic daily seasonality curve for the last 30 days
const DAILY_SEASONALITY = [
  0.81, 0.84, 0.79, 0.86, 0.92, 0.96, 0.88, 0.85, 0.89, 0.93,
  0.91, 0.97, 1.04, 0.95, 0.92, 0.96, 1.01, 0.99, 1.05, 1.11,
  1.02, 0.98, 1.03, 1.08, 1.06, 1.12, 1.18, 1.09, 1.14, 1.19,
];

function formatCompactBRL(value: number): string {
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(1).replace('.', ',')}k`;
  }
  return `R$ ${Math.round(value)}`;
}

export const RevenueTrendChart: React.FC<RevenueTrendChartProps> = ({
  monthlyRevenue,
  monthlyProfit,
}) => {
  const [showProfitLine, setShowProfitLine] = useState(true);

  const data: ChartPoint[] = useMemo(() => {
    const safeMonthlyRev = Math.max(12000, monthlyRevenue);
    const safeMonthlyProfit = Math.max(2000, monthlyProfit);
    const avgDailyRev = safeMonthlyRev / 30;
    const avgDailyProfit = safeMonthlyProfit / 30;

    // Anchor end date to 2026-11-14 (current workspace date)
    const endDate = new Date(2026, 10, 14);
    const sumWeights = DAILY_SEASONALITY.reduce((a, b) => a + b, 0);
    const scale = DAILY_SEASONALITY.length / sumWeights;

    return DAILY_SEASONALITY.map((factor, index) => {
      const d = new Date(endDate);
      d.setDate(endDate.getDate() - (29 - index));
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');

      const weightedFactor = factor * scale;
      return {
        dateLabel: `${day}/${month}`,
        revenue: Math.round(avgDailyRev * weightedFactor),
        profit: Math.round(avgDailyProfit * weightedFactor),
      };
    });
  }, [monthlyRevenue, monthlyProfit]);

  const stats = useMemo(() => {
    const revs = data.map((d) => d.revenue);
    const avg = revs.reduce((a, b) => a + b, 0) / Math.max(1, revs.length);
    const peak = Math.max(...revs);
    const firstWeekAvg = revs.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
    const lastWeekAvg = revs.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const deltaPct =
      firstWeekAvg > 0 ? ((lastWeekAvg - firstWeekAvg) / firstWeekAvg) * 100 : 0;

    return { avg, peak, deltaPct };
  }, [data]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-100">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Tendência de Receita — Últimos 30 Dias
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Evolução diária do faturamento bruto e lucro líquido estimado nos últimos 30 dias
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setShowProfitLine(true)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer ${
              showProfitLine
                ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-indigo-700'
            }`}
          >
            Receita + Lucro
          </button>
          <button
            type="button"
            onClick={() => setShowProfitLine(false)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer ${
              !showProfitLine
                ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-indigo-700'
            }`}
          >
            Apenas Receita
          </button>
        </div>
      </div>

      {/* Inline Legend & 30-day Summary Metrics */}
      <div className="mt-4 mb-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-5 text-slate-600">
          <span className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-indigo-600 inline-block" />
            Receita Diária
          </span>
          {showProfitLine && (
            <span className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-emerald-500 inline-block" />
              Lucro Líquido Diário
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-slate-600">
          <span>
            Média/dia: <strong className="text-slate-900">{formatBRL(stats.avg)}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Pico: <strong className="text-slate-900">{formatBRL(stats.peak)}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span className={stats.deltaPct >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
            Tendência 30d: {stats.deltaPct >= 0 ? '+' : ''}
            {stats.deltaPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Recharts LineChart */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis
              dataKey="dateLabel"
              tick={{ fill: '#64748B', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#E2E8F0' }}
              minTickGap={22}
            />
            <YAxis
              tickFormatter={formatCompactBRL}
              tick={{ fill: '#64748B', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={72}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                return (
                  <div className="bg-white border border-indigo-200 rounded-xl px-3.5 py-2.5 shadow-lg shadow-indigo-500/10 text-xs">
                    <div className="font-semibold text-slate-900 mb-1.5">
                      Data: {label}
                    </div>
                    {payload.map((entry) => (
                      <div
                        key={String(entry.dataKey)}
                        className="flex items-center justify-between gap-4 font-mono tabular-nums"
                      >
                        <span className="text-slate-600">
                          {entry.dataKey === 'revenue' ? 'Receita Bruta' : 'Lucro Líquido'}
                        </span>
                        <span
                          className="font-semibold"
                          style={{ color: entry.color }}
                        >
                          {formatBRL(Number(entry.value || 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              name="Receita Bruta"
              stroke="#4F46E5"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: '#4F46E5', stroke: '#FFFFFF', strokeWidth: 2 }}
            />
            {showProfitLine && (
              <Line
                type="monotone"
                dataKey="profit"
                name="Lucro Líquido"
                stroke="#10B981"
                strokeWidth={2.25}
                dot={false}
                activeDot={{ r: 4, fill: '#10B981', stroke: '#FFFFFF', strokeWidth: 2 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
