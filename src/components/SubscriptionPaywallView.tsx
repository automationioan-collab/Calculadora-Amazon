import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  LogOut,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { PaymentMethod, SubscriberPlan, UserProfile } from '../types';
import { apiRequest } from '../utils/api';
import { formatBRL } from '../utils/amazonBr';

interface SubscriptionPaywallViewProps {
  user: UserProfile;
  isModal?: boolean;
  onClose?: () => void;
  onActivated: (updatedUser: UserProfile) => void;
  onLogout: () => void;
}

const PLANS: Array<{
  id: SubscriberPlan;
  name: string;
  price: number;
  skus: number;
  description: string;
  highlights: string[];
}> = [
  {
    id: 'Starter',
    name: 'Starter',
    price: 97,
    skus: 25,
    description: 'Ideal para quem está validando os primeiros produtos na Amazon BR.',
    highlights: [
      'Até 25 SKUs monitorados na loja',
      'Calculadora FBA, DBA e FBM ilimitada',
      'Alertas de estoque baixo e Buy Box',
    ],
  },
  {
    id: 'Pro',
    name: 'Pro',
    price: 197,
    skus: 150,
    description: 'Para vendedores ativos que cruzam listas de fornecedores toda semana.',
    highlights: [
      'Até 150 SKUs ativos na operação',
      'Analisador de planilhas CSV em massa',
      'Espião de concorrentes e Planejador 12 meses',
    ],
  },
  {
    id: 'Enterprise',
    name: 'Enterprise',
    price: 397,
    skus: 1000,
    description: 'Operações de alto volume com múltiplos fornecedores e catálogo extenso.',
    highlights: [
      'Até 1.000 SKUs monitorados',
      'Alertas prioritários por e-mail e push',
      'Exportações e simulações sem limites',
    ],
  },
];

function formatDateBr(iso?: string): string {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export const SubscriptionPaywallView: React.FC<SubscriptionPaywallViewProps> = ({
  user,
  isModal = false,
  onClose,
  onActivated,
  onLogout,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<SubscriberPlan>('Pro');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = user.subscriptionInfo;

  const handleActivate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ user: UserProfile }>(
        '/api/subscription/activate',
        {
          method: 'POST',
          body: JSON.stringify({
            plan: selectedPlan,
            paymentMethod,
          }),
        }
      );
      onActivated(res.user);
      if (onClose) onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao ativar assinatura.'
      );
    } finally {
      setLoading(false);
    }
  };

  const innerCard = (
    <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="p-6 sm:p-8 bg-gradient-to-r from-indigo-700 via-blue-700 to-cyan-600 text-white flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-100">
            <Clock className="w-4 h-4" />
            <span>
              {info?.isTrialExpired
                ? 'Prazo de 25 dias FREE encerrado'
                : `Restam ${info?.trialDaysRemaining ?? 0} de 25 dias FREE`}
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            {info?.isTrialExpired
              ? 'Ative sua assinatura para continuar usando o AmzHub BR'
              : 'Escolha seu plano definitivo do AmzHub BR'}
          </h2>
          <p className="text-sm text-indigo-100 max-w-2xl">
            {info?.isTrialExpired
              ? `O período gratuito de 25 dias vinculado aos seus dados terminou em ${formatDateBr(info?.trialEndsAt)}. A partir de agora o acesso é exclusivo para assinantes ativos.`
              : 'Garanta continuidade sem interrupções antes do encerramento do período gratuito de 25 dias.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold cursor-pointer"
            >
              Continuar no FREE
            </button>
          )}
          {!isModal && (
            <button
              type="button"
              onClick={onLogout}
              className="px-3.5 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          )}
        </div>
      </div>

      {/* Recognized Identity Summary */}
      <div className="px-6 sm:px-8 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            <strong className="text-slate-900">E-mail:</strong>{' '}
            <span className="font-mono">{user.email}</span>
          </span>
          {user.phone && (
            <span>
              <strong className="text-slate-900">Telefone:</strong>{' '}
              <span className="font-mono">{user.phone}</span>
            </span>
          )}
          {user.amazonAccountId && (
            <span>
              <strong className="text-slate-900">Conta Amazon:</strong>{' '}
              <span className="font-mono">{user.amazonAccountId}</span>
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-500 tabular-nums">
          Início FREE: {formatDateBr(info?.trialStartedAt)} · Fim:{' '}
          {formatDateBr(info?.trialEndsAt)}
        </span>
      </div>

      <div className="p-6 sm:p-8 space-y-6">
        {error && (
          <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
            {error}
          </div>
        )}

        {/* Plan Options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((p) => {
            const active = selectedPlan === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlan(p.id)}
                className={`text-left rounded-2xl p-5 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  active
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-md shadow-indigo-500/10'
                    : 'border-slate-200 bg-white hover:border-indigo-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-bold text-slate-900">
                      {p.name}
                    </span>
                    {p.id === 'Pro' && (
                      <span className="text-[11px] font-bold text-indigo-700 inline-flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        Mais usado
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                      {formatBRL(p.price)}
                    </span>
                    <span className="text-xs text-slate-500">/mês</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                    {p.description}
                  </p>
                </div>

                <ul className="mt-4 pt-4 border-t border-slate-200/80 space-y-2">
                  {p.highlights.map((h) => (
                    <li
                      key={h}
                      className="flex items-start gap-2 text-xs text-slate-700"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* Payment Method & Confirm */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
              <span>Forma de pagamento</span>
            </div>
            <div className="flex items-center gap-2">
              {(['PIX', 'Cartão', 'Boleto'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`px-3.5 h-9 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    paymentMethod === m
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white border-transparent shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={handleActivate}
            className="btn-tech-emerald h-11 px-6 text-sm"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>
              {loading
                ? 'Ativando assinatura...'
                : `Assinar Plano ${selectedPlan} (${formatBRL(
                    PLANS.find((x) => x.id === selectedPlan)?.price ?? 197
                  )}/mês)`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto"
      >
        {innerCard}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] flex items-center justify-center p-4 sm:p-8">
      {innerCard}
    </div>
  );
};
