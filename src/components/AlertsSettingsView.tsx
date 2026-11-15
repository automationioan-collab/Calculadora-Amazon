import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Mail,
  Plus,
  Smartphone,
  Trash2,
  Zap,
} from 'lucide-react';
import type {
  AlertChannel,
  AlertNotificationConfig,
  AlertRule,
  AlertRuleType,
  CompetitorWatch,
  StoreSku,
  TriggeredAlert,
} from '../types';
import { apiRequest } from '../utils/api';

interface AlertsSettingsViewProps {
  skus: StoreSku[];
  competitors: CompetitorWatch[];
}

const RULE_TYPE_LABELS: Record<
  AlertRuleType,
  { label: string; unit: AlertRule['thresholdUnit']; defaultThreshold: number }
> = {
  competitor_price_below: {
    label: 'Preço do concorrente abaixo de (R$)',
    unit: 'BRL',
    defaultThreshold: 220,
  },
  low_stock_days: {
    label: 'Estoque baixo para SKU (dias de cobertura)',
    unit: 'dias',
    defaultThreshold: 12,
  },
  low_stock_units: {
    label: 'Estoque baixo para SKU (unidades mínimas)',
    unit: 'unidades',
    defaultThreshold: 20,
  },
  margin_below: {
    label: 'Margem líquida do SKU abaixo de (%)',
    unit: '%',
    defaultThreshold: 15,
  },
  buybox_lost: {
    label: 'Perda de Buy Box em anúncio ativo',
    unit: '%',
    defaultThreshold: 0,
  },
};

export const AlertsSettingsView: React.FC<AlertsSettingsViewProps> = ({
  skus,
  competitors,
}) => {
  const [config, setConfig] = useState<AlertNotificationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingChannels, setSavingChannels] = useState(false);
  const [channelNotice, setChannelNotice] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window
      ? window.Notification.permission
      : 'unsupported'
  );

  // New rule form state
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState<AlertRuleType>('competitor_price_below');
  const [targetAsin, setTargetAsin] = useState('Todos');
  const [thresholdValue, setThresholdValue] = useState<number>(220);
  const [channel, setChannel] = useState<AlertChannel>('ambos');
  const [addingRule, setAddingRule] = useState(false);

  // Live evaluation state
  const [evaluating, setEvaluating] = useState(false);
  const [triggered, setTriggered] = useState<TriggeredAlert[] | null>(null);

  useEffect(() => {
    apiRequest<{ config: AlertNotificationConfig }>('/api/alerts')
      .then((res) => setConfig(res.config))
      .finally(() => setLoading(false));
  }, []);

  const handleRuleTypeChange = (nextType: AlertRuleType) => {
    setRuleType(nextType);
    setThresholdValue(RULE_TYPE_LABELS[nextType].defaultThreshold);
  };

  const handleSaveChannels = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSavingChannels(true);
    setChannelNotice(null);
    try {
      const res = await apiRequest<{ config: AlertNotificationConfig }>(
        '/api/alerts/channels',
        {
          method: 'PUT',
          body: JSON.stringify({
            emailEnabled: config.emailEnabled,
            notificationEmail: config.notificationEmail,
            pushEnabled: config.pushEnabled,
            quietHoursStart: config.quietHoursStart,
            quietHoursEnd: config.quietHoursEnd,
          }),
        }
      );
      setConfig(res.config);
      setChannelNotice('Preferências de e-mail e push salvas com sucesso.');
    } finally {
      setSavingChannels(false);
    }
  };

  const handleRequestBrowserPush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushStatus('unsupported');
      return;
    }
    try {
      const perm = await window.Notification.requestPermission();
      setPushStatus(perm);
      if (perm === 'granted' && config) {
        setConfig({ ...config, pushEnabled: true });
      }
    } catch {
      setPushStatus('denied');
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingRule(true);
    try {
      const meta = RULE_TYPE_LABELS[ruleType];
      const computedName =
        ruleName.trim() ||
        `${meta.label.split('(')[0].trim()}${
          targetAsin !== 'Todos' ? ` (${targetAsin})` : ''
        }`;

      const res = await apiRequest<{ config: AlertNotificationConfig }>(
        '/api/alerts/rules',
        {
          method: 'POST',
          body: JSON.stringify({
            name: computedName,
            type: ruleType,
            targetAsinOrSku: targetAsin,
            thresholdValue: ruleType === 'buybox_lost' ? 0 : thresholdValue,
            thresholdUnit: meta.unit,
            channel,
            enabled: true,
          }),
        }
      );
      setConfig(res.config);
      setRuleName('');
    } finally {
      setAddingRule(false);
    }
  };

  const handleToggleRule = async (rule: AlertRule) => {
    const res = await apiRequest<{ config: AlertNotificationConfig }>(
      `/api/alerts/rules/${rule.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !rule.enabled }),
      }
    );
    setConfig(res.config);
  };

  const handleDeleteRule = async (id: string) => {
    const res = await apiRequest<{ config: AlertNotificationConfig }>(
      `/api/alerts/rules/${id}`,
      { method: 'DELETE' }
    );
    setConfig(res.config);
  };

  const handleEvaluateNow = async () => {
    setEvaluating(true);
    try {
      const res = await apiRequest<{ triggered: TriggeredAlert[] }>(
        '/api/alerts/evaluate',
        { method: 'POST' }
      );
      setTriggered(res.triggered);
    } finally {
      setEvaluating(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-sm text-slate-500">
        Carregando configurações de alertas...
      </div>
    );
  }

  const allTargets = Array.from(
    new Set([
      ...skus.map((s) => `${s.asin}::${s.title}`),
      ...competitors.map((c) => `${c.primaryAsin}::${c.sellerName}`),
    ])
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-lg shadow-violet-500/20 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Bell className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              Configurações de Alertas Inteligentes
            </h2>
            <p className="text-sm text-indigo-100 mt-0.5">
              Defina limites automáticos para receber avisos por e-mail ou push quando preços caírem ou estoques estiverem baixos.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={evaluating}
          onClick={handleEvaluateNow}
          className="px-4 h-10 rounded-xl bg-white text-violet-700 hover:bg-amber-50 font-semibold text-xs inline-flex items-center gap-2 shadow-md hover:-translate-y-0.5 transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Zap className="w-4 h-4" />
          <span>{evaluating ? 'Verificando...' : 'Testar Regras Agora'}</span>
        </button>
      </div>

      {/* Triggered Alerts Simulation Result */}
      {triggered !== null && (
        <div className="bg-white border border-indigo-200 rounded-2xl p-6 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Resultado da Verificação Atual ({triggered.length}{' '}
              {triggered.length === 1 ? 'alerta disparado' : 'alertas disparados'})
            </h3>
            <button
              type="button"
              onClick={() => setTriggered(null)}
              className="link-tech text-xs"
            >
              Ocultar
            </button>
          </div>

          {triggered.length === 0 ? (
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Nenhum limite foi violado no momento. Sua operação está dentro das metas configuradas.
              </span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {triggered.map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        item.severity === 'alta' ? 'text-rose-600' : 'text-amber-600'
                      }`}
                    />
                    <div>
                      <div className="font-semibold text-slate-900">
                        {item.ruleName} · {item.targetLabel}
                      </div>
                      <div className="text-slate-500 mt-0.5 font-mono tabular-nums">
                        Valor atual: <strong className="text-slate-900">{item.currentValueText}</strong> (regra: {item.thresholdText})
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-indigo-700">
                    Envio: {item.channel === 'ambos' ? 'E-mail + Push' : item.channel === 'email' ? 'E-mail' : 'Push'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2-Column Split: Notification Channels + New Alert Rule */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Channels Form */}
        <form
          onSubmit={handleSaveChannels}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-5"
        >
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Canais de Notificação
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Escolha onde deseja ser avisado e configure o horário de silêncio.
            </p>
          </div>

          {/* Email Toggle */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-indigo-600" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Alertas por E-mail
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Resumo imediato ao atingir qualquer limite
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.emailEnabled}
                onClick={() =>
                  setConfig({ ...config, emailEnabled: !config.emailEnabled })
                }
                className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                  config.emailEnabled
                    ? 'bg-gradient-to-r from-indigo-600 to-cyan-500'
                    : 'bg-slate-300'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    config.emailEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {config.emailEnabled && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  E-mail de destino
                </label>
                <input
                  type="email"
                  required
                  value={config.notificationEmail}
                  onChange={(e) =>
                    setConfig({ ...config, notificationEmail: e.target.value })
                  }
                  className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>

          {/* Push Toggle */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-4 h-4 text-violet-600" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Notificações Push
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Alertas instantâneos no navegador / desktop
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.pushEnabled}
                onClick={() =>
                  setConfig({ ...config, pushEnabled: !config.pushEnabled })
                }
                className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                  config.pushEnabled
                    ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500'
                    : 'bg-slate-300'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    config.pushEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-500">
                Permissão navegador:{' '}
                <strong className="text-slate-800">
                  {pushStatus === 'granted'
                    ? 'Autorizado'
                    : pushStatus === 'denied'
                      ? 'Bloqueado'
                      : pushStatus === 'unsupported'
                        ? 'Indisponível aqui'
                        : 'Pendente'}
                </strong>
              </span>
              {pushStatus !== 'granted' && pushStatus !== 'unsupported' && (
                <button
                  type="button"
                  onClick={handleRequestBrowserPush}
                  className="link-tech text-[11px]"
                >
                  Autorizar Push
                </button>
              )}
            </div>
          </div>

          {/* Quiet Hours */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Silêncio a partir das
              </label>
              <input
                type="time"
                value={config.quietHoursStart}
                onChange={(e) =>
                  setConfig({ ...config, quietHoursStart: e.target.value })
                }
                className="w-full h-9 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Retomar às
              </label>
              <input
                type="time"
                value={config.quietHoursEnd}
                onChange={(e) =>
                  setConfig({ ...config, quietHoursEnd: e.target.value })
                }
                className="w-full h-9 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          {channelNotice && (
            <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
              {channelNotice}
            </div>
          )}

          <button
            type="submit"
            disabled={savingChannels}
            className="btn-tech-primary w-full h-10 px-4 text-xs"
          >
            <span>{savingChannels ? 'Salvando...' : 'Salvar Preferências de Canal'}</span>
          </button>
        </form>

        {/* Create New Alert Rule Form */}
        <form
          onSubmit={handleAddRule}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-5 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Criar Nova Regra de Alerta
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure gatilhos personalizados como "preço do concorrente abaixo de X" ou "estoque baixo para SKU".
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Condição do Alerta
                </label>
                <select
                  value={ruleType}
                  onChange={(e) =>
                    handleRuleTypeChange(e.target.value as AlertRuleType)
                  }
                  className="w-full h-10 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500"
                >
                  {(Object.keys(RULE_TYPE_LABELS) as AlertRuleType[]).map((key) => (
                    <option key={key} value={key}>
                      {RULE_TYPE_LABELS[key].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  SKU ou ASIN Alvo
                </label>
                <select
                  value={targetAsin}
                  onChange={(e) => setTargetAsin(e.target.value)}
                  className="w-full h-10 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500"
                >
                  <option value="Todos">Todos os produtos / concorrentes</option>
                  {allTargets.map((entry) => {
                    const [asin, label] = entry.split('::');
                    return (
                      <option key={entry} value={asin}>
                        {asin} — {label.slice(0, 36)}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-5">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nome do Alerta (opcional)
                </label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="Ex: Alerta guerra de preço Cafeteira"
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Limite ({RULE_TYPE_LABELS[ruleType].unit})
                </label>
                <input
                  type="number"
                  min={0}
                  step={ruleType === 'competitor_price_below' ? 5 : 1}
                  disabled={ruleType === 'buybox_lost'}
                  value={ruleType === 'buybox_lost' ? 0 : thresholdValue}
                  onChange={(e) => setThresholdValue(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl tabular-nums disabled:opacity-50"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Enviar via
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl h-10">
                  {(['email', 'push', 'ambos'] as const).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChannel(ch)}
                      className={`text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                        channel === ch
                          ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-indigo-700'
                      }`}
                    >
                      {ch === 'email' ? 'E-mail' : ch === 'push' ? 'Push' : 'Ambos'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={addingRule}
              className="btn-tech-calc h-10 px-5 text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>{addingRule ? 'Adicionando...' : 'Adicionar Regra de Alerta'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Rules List Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Regras de Alerta Configuradas ({config.rules.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Ative, pause ou remova regras a qualquer momento
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-6">Regra / Tipo</th>
                <th className="py-3 px-4">Alvo</th>
                <th className="py-3 px-4 text-right">Limite</th>
                <th className="py-3 px-4">Canal</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {config.rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                    Nenhuma regra configurada. Crie seu primeiro alerta acima.
                  </td>
                </tr>
              ) : (
                config.rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-semibold text-slate-900">
                        {rule.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {RULE_TYPE_LABELS[rule.type].label}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-700">
                      {rule.targetAsinOrSku}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-slate-900 tabular-nums">
                      {rule.type === 'buybox_lost'
                        ? 'Imediato'
                        : rule.thresholdUnit === 'BRL'
                          ? `R$ ${rule.thresholdValue.toFixed(2).replace('.', ',')}`
                          : `${rule.thresholdValue} ${rule.thresholdUnit}`}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-indigo-700">
                      {rule.channel === 'ambos'
                        ? 'E-mail · Push'
                        : rule.channel === 'email'
                          ? 'E-mail'
                          : 'Push'}
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          rule.enabled
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white'
                            : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {rule.enabled ? 'Ativo' : 'Pausado'}
                      </button>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        aria-label={`Remover ${rule.name}`}
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
