import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Bell,
  Calculator,
  CheckCircle2,
  Compass,
  Eye,
  Sparkles,
  X,
} from 'lucide-react';
import type { WorkspaceTab } from '../types';

export interface TourStep {
  id: string;
  tab: WorkspaceTab;
  title: string;
  subtitle: string;
  description: string;
  tips: string[];
  icon: React.ComponentType<{ className?: string }>;
  accentGradient: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'overview',
    tab: 'overview',
    title: 'Boas-vindas ao AmzHub BR',
    subtitle: 'Passo 1 de 5 · Visão Geral da Operação',
    description:
      'Este é o seu painel central. Aqui você acompanha Receita Total, SKUs Ativos, Market Share e a tendência dos últimos 30 dias em tempo real.',
    tips: [
      'Acompanhe a evolução diária de receita e lucro líquido no gráfico de 30 dias.',
      'Use a Calculadora Rápida ou clique direto nas abas do menu à esquerda.',
    ],
    icon: BarChart2,
    accentGradient: 'from-blue-600 via-indigo-600 to-cyan-500',
  },
  {
    id: 'calculator',
    tab: 'calculator',
    title: 'Calculadora Amazon BR (FBA, DBA e FBM)',
    subtitle: 'Passo 2 de 5 · Simule Lucro Antes de Comprar',
    description:
      'Evite prejuízo antes de fechar pedido com fornecedor. Informe preço de venda, custo, peso e imposto para ver a margem líquida e o ROI exatos.',
    tips: [
      'Compare FBA, DBA e FBM lado a lado para escolher a logística mais lucrativa.',
      'Salve qualquer simulação direto no seu catálogo em Meus Produtos.',
    ],
    icon: Calculator,
    accentGradient: 'from-violet-600 via-fuchsia-600 to-amber-500',
  },
  {
    id: 'market',
    tab: 'market',
    title: 'Explorador de Nichos',
    subtitle: 'Passo 3 de 5 · Descubra Produtos em Alta',
    description:
      'Pesquise produtos vencedores na Amazon Brasil filtrando por BSR, faixa de preço, categoria e número de vendedores na Buy Box.',
    tips: [
      'Clique em qualquer produto para abrir o Raio-X com histórico de preço e BSR.',
      'Envie itens promissores direto para sua loja ou para o monitor de concorrentes.',
    ],
    icon: Compass,
    accentGradient: 'from-cyan-600 to-blue-600',
  },
  {
    id: 'spy',
    tab: 'spy',
    title: 'Monitor de Concorrentes & Buy Box',
    subtitle: 'Passo 4 de 5 · Espione Preços e Participação',
    description:
      'Acompanhe seus principais rivais por ASIN, monitore variações de preço nos últimos 7 dias e veja quem domina a Buy Box.',
    tips: [
      'Adicione qualquer ASIN ou Seller ID para monitorar ofertas em tempo real.',
      'Identifique quedas de preço antes que afetem seu giro de estoque.',
    ],
    icon: Eye,
    accentGradient: 'from-indigo-600 to-violet-600',
  },
  {
    id: 'alerts',
    tab: 'alerts',
    title: 'Alertas Inteligentes por E-mail e Push',
    subtitle: 'Passo 5 de 5 · Proteja sua Margem Automaticamente',
    description:
      'Defina regras como "preço do concorrente abaixo de R$ X" ou "estoque baixo para SKU" e deixe a plataforma vigiar sua operação.',
    tips: [
      'Ative notificações por e-mail, push e horário de silêncio em poucos cliques.',
      'Você pode reabrir este tour quando quiser clicando em Tour Guiado no topo.',
    ],
    icon: Bell,
    accentGradient: 'from-rose-500 to-amber-500',
  },
];

interface WelcomeTourModalProps {
  open: boolean;
  userName: string;
  onNavigateTab: (tab: WorkspaceTab) => void;
  onHighlightTab: (tab: WorkspaceTab | null) => void;
  onClose: (completed: boolean) => void;
}

export const WelcomeTourModal: React.FC<WelcomeTourModalProps> = ({
  open,
  userName,
  onNavigateTab,
  onHighlightTab,
  onClose,
}) => {
  const [stepIndex, setStepIndex] = useState(0);

  const step = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const progressPercent = Math.round(((stepIndex + 1) / TOUR_STEPS.length) * 100);
  const Icon = step.icon;

  useEffect(() => {
    if (!open) {
      onHighlightTab(null);
      return;
    }
    setStepIndex(0);
    onNavigateTab(TOUR_STEPS[0].tab);
    onHighlightTab(TOUR_STEPS[0].tab);
  }, [open, onNavigateTab, onHighlightTab]);

  const goToStep = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(TOUR_STEPS.length - 1, nextIndex));
    setStepIndex(clamped);
    const targetTab = TOUR_STEPS[clamped].tab;
    onNavigateTab(targetTab);
    onHighlightTab(targetTab);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-tour-title"
      className={`fixed z-50 transition-all ${
        isFirst
          ? 'inset-0 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-xs'
          : 'bottom-5 right-5 left-5 sm:left-auto sm:w-[440px] pointer-events-auto'
      }`}
    >
      <div className="w-full max-w-lg bg-white border border-indigo-200 rounded-2xl shadow-2xl shadow-indigo-950/20 overflow-hidden">
        {/* Top Progress Strip */}
        <div className="h-1.5 w-full bg-slate-100">
          <div
            style={{ width: `${progressPercent}%` }}
            className={`h-full bg-gradient-to-r ${step.accentGradient} transition-all duration-300`}
          />
        </div>

        {/* Header */}
        <div
          className={`px-6 py-4 bg-gradient-to-r ${step.accentGradient} text-white flex items-start justify-between gap-3`}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-white/90">
                {step.subtitle}
              </div>
              <h3 id="welcome-tour-title" className="text-base font-bold tracking-tight mt-0.5">
                {isFirst ? `Olá, ${userName.split(' ')[0]}! ${step.title}` : step.title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onClose(false)}
            aria-label="Fechar tour de boas-vindas"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            {step.description}
          </p>

          <ul className="space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            {step.tips.map((tip) => (
              <li
                key={tip}
                className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>

          {/* Quick Jump Stepper Dots */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              {TOUR_STEPS.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goToStep(idx)}
                  aria-label={`Ir para ${s.title}`}
                  className={`h-2 rounded-full transition-all cursor-pointer ${
                    idx === stepIndex
                      ? 'w-6 bg-indigo-600'
                      : idx < stepIndex
                        ? 'w-2 bg-emerald-500'
                        : 'w-2 bg-slate-300 hover:bg-slate-400'
                  }`}
                />
              ))}
            </div>
            <span className="text-[11px] font-mono font-semibold text-slate-500 tabular-nums">
              {stepIndex + 1} / {TOUR_STEPS.length}
            </span>
          </div>

          {/* Footer Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1.5 cursor-pointer"
            >
              Pular Tour
            </button>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  type="button"
                  onClick={() => goToStep(stepIndex - 1)}
                  className="btn-tech-secondary h-9 px-3.5 text-xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>
              )}

              {!isLast ? (
                <button
                  type="button"
                  onClick={() => goToStep(stepIndex + 1)}
                  className="btn-tech-primary h-9 px-4 text-xs"
                >
                  <span>Próximo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onClose(true)}
                  className="btn-tech-emerald h-9 px-4 text-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Concluir Tour</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
