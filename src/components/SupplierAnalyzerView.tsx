import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Plus, Upload } from 'lucide-react';
import type {
  SupplierAnalyzedItem,
  SupplierBatch,
  SupplierRowInput,
  UserProfile,
} from '../types';
import { apiRequest } from '../utils/api';
import { formatBRL, formatNumberBR } from '../utils/amazonBr';

interface SupplierAnalyzerViewProps {
  user: UserProfile;
}

const SAMPLE_ROWS: SupplierRowInput[] = [
  {
    eanOrAsin: '7898615981024',
    productName: 'Cafeteira Elétrica Inox Programável 30 Xícaras',
    supplierCost: 112.0,
    icmsStPercent: 4.5,
    freightPerUnit: 5.5,
    mode: 'FBA',
  },
  {
    eanOrAsin: '7891129248701',
    productName: 'Kit Chave Catraca Reversível 46 Peças Vonder',
    supplierCost: 46.0,
    icmsStPercent: 3.0,
    freightPerUnit: 3.2,
    mode: 'FBA',
  },
  {
    eanOrAsin: '7898571423108',
    productName: 'Garrafa Térmica Aço Inox 1L Tampa Vedação',
    supplierCost: 59.0,
    icmsStPercent: 0,
    freightPerUnit: 3.5,
    mode: 'FBA',
  },
  {
    eanOrAsin: '7899838851245',
    productName: 'Mouse Sem Fio Ergonômico Dual Mode USB-C',
    supplierCost: 118.0,
    icmsStPercent: 6.0,
    freightPerUnit: 3.0,
    mode: 'FBA',
  },
  {
    eanOrAsin: '7898643190442',
    productName: 'Sérum Facial Vitamina C 10% + Hialurônico 30ml',
    supplierCost: 23.0,
    icmsStPercent: 4.0,
    freightPerUnit: 2.1,
    mode: 'FBA',
  },
  {
    eanOrAsin: '7896581209341',
    productName: 'Kit 10 Potes Herméticos Vidro Borossilicato',
    supplierCost: 92.0,
    icmsStPercent: 4.0,
    freightPerUnit: 7.5,
    mode: 'FBA',
  },
];

function parseSupplierCsv(text: string): SupplierRowInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const rows: SupplierRowInput[] = [];

  lines.forEach((line, index) => {
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (index === 0 && /ean|asin|produto|custo/i.test(cols.join(' '))) {
      return; // Skip header
    }
    if (cols.length < 3) return;
    const cost = Number(cols[2].replace(',', '.').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(cost) || cost <= 0) return;

    const icms = cols[3] ? Number(cols[3].replace(',', '.')) || 0 : 0;
    const freight = cols[4] ? Number(cols[4].replace(',', '.')) || 4.0 : 4.0;

    rows.push({
      eanOrAsin: cols[0] || `EAN-${index}`,
      productName: cols[1] || `Item ${index}`,
      supplierCost: cost,
      icmsStPercent: icms,
      freightPerUnit: freight,
      mode: 'FBA',
    });
  });

  return rows;
}

export const SupplierAnalyzerView: React.FC<SupplierAnalyzerViewProps> = ({
  user,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [batchName, setBatchName] = useState('Distribuidora Paulista — Tabela Novembro');
  const [taxRate, setTaxRate] = useState(user.defaultTaxRate);
  const [batches, setBatches] = useState<SupplierBatch[]>([]);
  const [activeBatch, setActiveBatch] = useState<SupplierBatch | null>(null);
  const [verdictFilter, setVerdictFilter] = useState<'Todos' | 'Lucrativo' | 'Margem Baixa' | 'Inviável'>('Todos');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual quick row inputs
  const [manualEan, setManualEan] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualCost, setManualCost] = useState('');

  useEffect(() => {
    apiRequest<{ batches: SupplierBatch[] }>('/api/supplier/batches')
      .then((res) => {
        setBatches(res.batches);
        if (res.batches.length > 0) setActiveBatch(res.batches[0]);
      })
      .catch(() => {
        // Ignore initial empty load errors
      });
  }, []);

  const runAnalysis = async (rows: SupplierRowInput[], customName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ batch: SupplierBatch }>('/api/supplier/analyze', {
        method: 'POST',
        body: JSON.stringify({
          batchName: customName || batchName,
          taxRate,
          rows,
        }),
      });
      setBatches((prev) => [res.batch, ...prev]);
      setActiveBatch(res.batch);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cruzar planilha.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseSupplierCsv(text);
    if (parsed.length === 0) {
      setError('Não foi possível ler linhas válidas. Formato esperado: EAN_ou_ASIN;Produto;Custo;ICMS_ST;Frete');
      return;
    }
    await runAnalysis(parsed, file.name.replace(/\.csv$/i, ''));
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const costNum = Number(manualCost.replace(',', '.'));
    if (!manualName || !Number.isFinite(costNum) || costNum <= 0) return;

    const existingRows: SupplierRowInput[] = activeBatch
      ? activeBatch.items.map((it) => ({
          eanOrAsin: it.eanOrAsin,
          productName: it.productName,
          supplierCost: it.supplierCost,
          icmsStPercent: it.icmsStPercent,
          freightPerUnit: it.freightPerUnit,
          mode: it.mode,
        }))
      : [];

    await runAnalysis([
      {
        eanOrAsin: manualEan || 'B09V3KXJPB',
        productName: manualName,
        supplierCost: costNum,
        icmsStPercent: 4.0,
        freightPerUnit: 4.5,
        mode: 'FBA',
      },
      ...existingRows,
    ]);

    setManualEan('');
    setManualName('');
    setManualCost('');
  };

  const filteredItems: SupplierAnalyzedItem[] = useMemo(() => {
    if (!activeBatch) return [];
    if (verdictFilter === 'Todos') return activeBatch.items;
    return activeBatch.items.filter((i) => i.verdict === verdictFilter);
  }, [activeBatch, verdictFilter]);

  const metrics = useMemo(() => {
    const items = activeBatch?.items || [];
    const profitable = items.filter((i) => i.verdict === 'Lucrativo');
    const avgRoi =
      profitable.length > 0
        ? profitable.reduce((acc, i) => acc + i.roiPercent, 0) / profitable.length
        : 0;
    const potentialMonthlyProfit = profitable.reduce(
      (acc, i) => acc + i.netProfit * Math.round(i.monthlySales * 0.15),
      0
    );
    return {
      total: items.length,
      profitableCount: profitable.length,
      avgRoi,
      potentialMonthlyProfit,
    };
  }, [activeBatch]);

  const exportCsv = () => {
    if (!activeBatch) return;
    const header = [
      'EAN/ASIN Informado',
      'ASIN Amazon',
      'Produto',
      'Custo Fornecedor',
      'Preco Amazon',
      'Taxas Amazon',
      'Lucro Liquido',
      'Margem %',
      'ROI %',
      'Veredito',
    ].join(';');
    const lines = activeBatch.items.map((i) =>
      [
        i.eanOrAsin,
        i.matchedAsin || 'Estimado',
        `"${i.amazonTitle.replace(/"/g, '""')}"`,
        i.supplierCost.toFixed(2),
        i.amazonPrice.toFixed(2),
        (i.referralFee + i.fulfillmentFee).toFixed(2),
        i.netProfit.toFixed(2),
        i.marginPercent.toFixed(1),
        i.roiPercent.toFixed(1),
        i.verdict,
      ].join(';')
    );
    const blob = new Blob([[header, ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeBatch.batchName.replace(/\s+/g, '_')}_analise.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Import & Configuration Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Cruzamento em Massa de Listas de Fornecedores
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Envie um arquivo CSV (colunas: EAN/ASIN, Produto, Custo, ICMS-ST%, Frete) ou carregue uma tabela modelo para identificar itens lucrativos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => runAnalysis(SAMPLE_ROWS)}
              className="btn-tech-emerald h-9 px-3.5 text-xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Carregar Lista Exemplo</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => fileRef.current?.click()}
              className="btn-tech-primary h-9 px-3.5 text-xs"
            >
              <Upload className="w-4 h-4" />
              <span>Importar CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-4 border-t border-slate-100">
          <div className="md:col-span-5">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Nome do Lote / Fornecedor
            </label>
            <input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Imposto NF (%)
            </label>
            <input
              type="number"
              step={0.5}
              min={0}
              max={25}
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
              className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-200 rounded-lg tabular-nums"
            />
          </div>
          <div className="md:col-span-5">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Análises Salvas Recentemente
            </label>
            <select
              value={activeBatch?.id || ''}
              onChange={(e) => {
                const found = batches.find((b) => b.id === e.target.value);
                if (found) setActiveBatch(found);
              }}
              className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg"
            >
              {batches.length === 0 && <option value="">Nenhuma lista analisada ainda</option>}
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchName} ({b.items.length} itens)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Manual Item Quick Test */}
        <form
          onSubmit={handleManualAdd}
          className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-3 border-t border-slate-100"
        >
          <input
            type="text"
            value={manualEan}
            onChange={(e) => setManualEan(e.target.value)}
            placeholder="EAN ou ASIN (ex: 7898615981024)"
            className="sm:col-span-3 h-9 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
          />
          <input
            type="text"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            placeholder="Descrição do item no fornecedor"
            className="sm:col-span-5 h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          />
          <input
            type="text"
            value={manualCost}
            onChange={(e) => setManualCost(e.target.value)}
            placeholder="Custo R$ (ex: 85.00)"
            className="sm:col-span-2 h-9 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
          />
          <button
            type="submit"
            disabled={loading}
            className="sm:col-span-2 btn-tech-primary h-9 px-3 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Testar Item</span>
          </button>
        </form>

        {error && (
          <div className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Results View */}
      {activeBatch ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">SKUs na Planilha</div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                {metrics.total}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Itens Lucrativos (≥14%)</div>
              <div className="mt-1 text-xl font-bold text-emerald-700 tabular-nums">
                {metrics.profitableCount}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">ROI Médio dos Aprovados</div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                {metrics.avgRoi.toFixed(1)}%
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Potencial Mensal (15% share)</div>
              <div className="mt-1 text-xl font-bold text-amber-700 tabular-nums">
                {formatBRL(metrics.potentialMonthlyProfit)}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                {(['Todos', 'Lucrativo', 'Margem Baixa', 'Inviável'] as const).map(
                  (v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVerdictFilter(v)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer ${
                        verdictFilter === v
                          ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-indigo-700'
                      }`}
                    >
                      {v}
                    </button>
                  )
                )}
              </div>
              <button
                type="button"
                onClick={exportCsv}
                className="btn-tech-secondary h-9 px-3.5 text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar CSV</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-6">Item / Correspondência Amazon</th>
                    <th className="py-3 px-4 text-right">Custo + ST</th>
                    <th className="py-3 px-4 text-right">Preço Amazon</th>
                    <th className="py-3 px-4 text-right">Taxas FBA/Com.</th>
                    <th className="py-3 px-4 text-right">Lucro Un.</th>
                    <th className="py-3 px-4 text-right">Margem / ROI</th>
                    <th className="py-3 px-6">Viabilidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredItems.map((item) => {
                    const effectiveCost =
                      item.supplierCost * (1 + item.icmsStPercent / 100);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-6">
                          <div className="font-medium text-slate-900 max-w-sm truncate">
                            {item.amazonTitle}
                          </div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                            EAN/ASIN: {item.eanOrAsin}
                            {item.matchedAsin ? ` · Match ${item.matchedAsin}` : ' · Preço estimado'} ·{' '}
                            {formatNumberBR(item.monthlySales)} vendas/mês
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                          {formatBRL(effectiveCost)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs font-medium text-slate-900 tabular-nums">
                          {formatBRL(item.amazonPrice)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-600 tabular-nums">
                          {formatBRL(item.referralFee + item.fulfillmentFee)}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-mono text-xs font-semibold tabular-nums ${
                            item.netProfit > 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {formatBRL(item.netProfit)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-800 tabular-nums">
                          {item.marginPercent.toFixed(1)}% · ROI {item.roiPercent.toFixed(0)}%
                        </td>
                        <td className="py-3.5 px-6 text-xs font-semibold">
                          <span
                            className={
                              item.verdict === 'Lucrativo'
                                ? 'text-emerald-700'
                                : item.verdict === 'Margem Baixa'
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                            }
                          >
                            {item.verdict}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="text-base font-semibold text-slate-900">
            Nenhuma planilha cruzada ainda
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Clique em "Carregar Lista Distribuidora (Exemplo)" acima para simular o cruzamento instantâneo de custos e taxas Amazon Brasil, ou importe seu próprio CSV.
          </p>
        </div>
      )}
    </div>
  );
};
