import React, { useMemo, useState } from 'react';
import { Calculator, Plus, Trash2 } from 'lucide-react';
import type { FulfillmentMode, StoreSku, UserProfile } from '../types';
import {
  AMAZON_BR_CATEGORY_RATES,
  calculateUnitEconomics,
  formatBRL,
  formatNumberBR,
} from '../utils/amazonBr';

interface StoreManagementViewProps {
  user: UserProfile;
  skus: StoreSku[];
  onCreateSku: (payload: Partial<StoreSku>) => Promise<void>;
  onUpdateSku: (id: string, patch: Partial<StoreSku>) => Promise<void>;
  onDeleteSku: (id: string) => Promise<void>;
}

const CATEGORIES = Object.keys(AMAZON_BR_CATEGORY_RATES);

export const StoreManagementView: React.FC<StoreManagementViewProps> = ({
  user,
  skus,
  onCreateSku,
  onUpdateSku,
  onDeleteSku,
}) => {
  const [subTab, setSubTab] = useState<'inventory' | 'calculator'>('inventory');

  // New SKU Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAsin, setNewAsin] = useState('');
  const [newCategory, setNewCategory] = useState('Casa e Cozinha');
  const [newMode, setNewMode] = useState<FulfillmentMode>('FBA');
  const [newPrice, setNewPrice] = useState('179.90');
  const [newCost, setNewCost] = useState('78.00');
  const [newStock, setNewStock] = useState('40');
  const [saving, setSaving] = useState(false);

  // Unit Economics Calculator state
  const [calcPrice, setCalcPrice] = useState(199.9);
  const [calcCost, setCalcCost] = useState(86.0);
  const [calcInbound, setCalcInbound] = useState(5.0);
  const [calcPackaging, setCalcPackaging] = useState(2.2);
  const [calcCategory, setCalcCategory] = useState('Casa e Cozinha');
  const [calcMode, setCalcMode] = useState<FulfillmentMode>('FBA');
  const [calcWeight, setCalcWeight] = useState(850);
  const [calcTax, setCalcTax] = useState(user.defaultTaxRate);
  const [calcAcos, setCalcAcos] = useState(4.5);

  const calcResult = useMemo(
    () =>
      calculateUnitEconomics({
        salePrice: calcPrice,
        unitCost: calcCost,
        inboundShipping: calcInbound,
        packagingCost: calcPackaging,
        category: calcCategory,
        fulfillment: calcMode,
        weightGrams: calcWeight,
        taxPercent: calcTax,
        acosPercent: calcAcos,
      }),
    [
      calcPrice,
      calcCost,
      calcInbound,
      calcPackaging,
      calcCategory,
      calcMode,
      calcWeight,
      calcTax,
      calcAcos,
    ]
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newAsin.trim()) return;
    setSaving(true);
    try {
      await onCreateSku({
        title: newTitle,
        asin: newAsin,
        category: newCategory,
        fulfillment: newMode,
        salePrice: Number(newPrice.replace(',', '.')),
        unitCost: Number(newCost.replace(',', '.')),
        stockUnits: Number(newStock),
        taxPercent: user.defaultTaxRate,
      });
      setNewTitle('');
      setNewAsin('');
      setShowAddForm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('inventory')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'inventory'
                ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-indigo-700'
            }`}
          >
            Meus Produtos ({skus.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('calculator')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'calculator'
                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-violet-700'
            }`}
          >
            Calculadora Rápida
          </button>
        </div>

        {subTab === 'inventory' && (
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="btn-tech-primary h-9 px-4 text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{showAddForm ? 'Cancelar' : 'Cadastrar Novo SKU'}</span>
          </button>
        )}
      </div>

      {subTab === 'inventory' ? (
        <div className="space-y-5">
          {showAddForm && (
            <form
              onSubmit={handleCreate}
              className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-12 gap-3"
            >
              <div className="sm:col-span-5">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Título do Produto
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Kit Organizador Cozinha Hermético"
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  ASIN
                </label>
                <input
                  type="text"
                  required
                  value={newAsin}
                  onChange={(e) => setNewAsin(e.target.value)}
                  placeholder="B0C7K4W9BV"
                  className="w-full h-9 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Categoria
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Logística
                </label>
                <select
                  value={newMode}
                  onChange={(e) => setNewMode(e.target.value as FulfillmentMode)}
                  className="w-full h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="FBA">FBA</option>
                  <option value="DBA">DBA</option>
                  <option value="FBM">FBM</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Preço de Venda (R$)
                </label>
                <input
                  type="text"
                  required
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="w-full h-9 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Custo Compra (R$)
                </label>
                <input
                  type="text"
                  required
                  value={newCost}
                  onChange={(e) => setNewCost(e.target.value)}
                  className="w-full h-9 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Estoque Atual (un)
                </label>
                <input
                  type="number"
                  min={0}
                  value={newStock}
                  onChange={(e) => setNewStock(e.target.value)}
                  className="w-full h-9 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="sm:col-span-3 flex items-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-tech-emerald w-full h-9 px-4 text-xs"
                >
                  {saving ? 'Salvando...' : 'Salvar SKU na Loja'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-6">Produto / ASIN</th>
                    <th className="py-3 px-4">Logística</th>
                    <th className="py-3 px-4 text-right">Preço Venda</th>
                    <th className="py-3 px-4 text-right">Custo Un.</th>
                    <th className="py-3 px-4 text-right">Lucro Líq.</th>
                    <th className="py-3 px-4 text-right">Margem / ROI</th>
                    <th className="py-3 px-4 text-right">Estoque</th>
                    <th className="py-3 px-6 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {skus.map((sku) => {
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
                    return (
                      <tr key={sku.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-6">
                          <div className="font-medium text-slate-900 max-w-xs truncate">
                            {sku.title}
                          </div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            {sku.asin} · {sku.sku} · {sku.buyBoxOwner}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-700">
                          {sku.fulfillment} · {sku.category}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums">
                          {formatBRL(sku.salePrice)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-600 tabular-nums">
                          {formatBRL(sku.unitCost)}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-mono text-xs font-semibold tabular-nums ${
                            econ.netProfit > 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {formatBRL(econ.netProfit)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-800 tabular-nums">
                          {econ.marginPercent.toFixed(1)}% · ROI {econ.roiPercent.toFixed(0)}%
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-800 tabular-nums">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateSku(sku.id, {
                                  stockUnits: Math.max(0, sku.stockUnits - 5),
                                })
                              }
                              className="w-6 h-6 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-10 text-center">
                              {formatNumberBR(sku.stockUnits)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateSku(sku.id, { stockUnits: sku.stockUnits + 10 })
                              }
                              className="w-6 h-6 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <button
                            type="button"
                            onClick={() => onDeleteSku(sku.id)}
                            aria-label={`Excluir ${sku.title}`}
                            className="btn-tech-danger p-2"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Unit Economics Calculator */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <Calculator className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Calculadora de Precificação Amazon Brasil
                </h3>
                <p className="text-xs text-slate-500">
                  Simule comissão por categoria, tarifa logística FBA/DBA, impostos e verba de Amazon Ads.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Preço de Venda (R$)
                </label>
                <input
                  type="number"
                  min={10}
                  step={1}
                  value={calcPrice}
                  onChange={(e) => setCalcPrice(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Custo Produto (R$)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={calcCost}
                  onChange={(e) => setCalcCost(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Peso Embalado (g)
                </label>
                <input
                  type="number"
                  min={50}
                  step={50}
                  value={calcWeight}
                  onChange={(e) => setCalcWeight(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Categoria Amazon BR
                </label>
                <select
                  value={calcCategory}
                  onChange={(e) => setCalcCategory(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c} ({(AMAZON_BR_CATEGORY_RATES[c] * 100).toFixed(0)}%)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Modalidade Logística
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg h-10">
                  {(['FBA', 'DBA', 'FBM'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCalcMode(m)}
                      className={`text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                        calcMode === m
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Frete Entrada (R$)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={calcInbound}
                  onChange={(e) => setCalcInbound(Number(e.target.value))}
                  className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
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
                  value={calcPackaging}
                  onChange={(e) => setCalcPackaging(Number(e.target.value))}
                  className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
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
                  value={calcTax}
                  onChange={(e) => setCalcTax(Number(e.target.value))}
                  className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  ACOS Ads (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={40}
                  step={0.5}
                  value={calcAcos}
                  onChange={(e) => setCalcAcos(Number(e.target.value))}
                  className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="text-xs font-semibold text-slate-500">
                Demonstrativo por Unidade Vendida
              </div>
              <div className="flex items-baseline justify-between pb-4 border-b border-slate-200">
                <span className="text-sm font-semibold text-slate-900">
                  Lucro Líquido
                </span>
                <span
                  className={`text-3xl font-bold font-mono tabular-nums ${
                    calcResult.netProfit > 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {formatBRL(calcResult.netProfit)}
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Preço de Venda</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatBRL(calcPrice)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Custo + Frete + Embalagem</span>
                  <span className="font-mono text-slate-700 tabular-nums">
                    - {formatBRL(calcCost + calcInbound + calcPackaging)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    Comissão Amazon ({(calcResult.referralRate * 100).toFixed(0)}%)
                  </span>
                  <span className="font-mono text-slate-700 tabular-nums">
                    - {formatBRL(calcResult.referralFee)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Tarifa Logística ({calcMode})</span>
                  <span className="font-mono text-slate-700 tabular-nums">
                    - {formatBRL(calcResult.fulfillmentFee)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Impostos ({calcTax}%)</span>
                  <span className="font-mono text-slate-700 tabular-nums">
                    - {formatBRL(calcResult.taxAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Amazon Ads ({calcAcos}%)</span>
                  <span className="font-mono text-slate-700 tabular-nums">
                    - {formatBRL(calcResult.adsAmount)}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[11px] text-slate-500">Margem Líq.</div>
                <div className="mt-1 text-base font-bold font-mono text-slate-900 tabular-nums">
                  {calcResult.marginPercent.toFixed(1)}%
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[11px] text-slate-500">ROI s/ Custo</div>
                <div className="mt-1 text-base font-bold font-mono text-amber-700 tabular-nums">
                  {calcResult.roiPercent.toFixed(1)}%
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[11px] text-slate-500">ACOS Equilíbrio</div>
                <div className="mt-1 text-base font-bold font-mono text-slate-900 tabular-nums">
                  {calcResult.breakEvenAcos.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
