import React, { useState } from 'react';
import {
  BarChart2,
  Bell,
  Calculator,
  Compass,
  Eye,
  FileSpreadsheet,
  LogOut,
  Package,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import type { UserProfile, WorkspaceTab } from '../types';

interface SidebarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  user: UserProfile;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  highlightedTourTab?: WorkspaceTab | null;
}

const NAV_ITEMS: Array<{
  id: WorkspaceTab;
  label: string;
  subtitle: string;
  featured?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  activeGradient: string;
  iconColor: string;
}> = [
  {
    id: 'overview',
    label: 'Visão Geral',
    subtitle: 'Resumo e gráficos',
    icon: BarChart2,
    activeGradient: 'from-blue-600 to-indigo-600 shadow-blue-500/25',
    iconColor: 'text-blue-500',
  },
  {
    id: 'calculator',
    label: 'Calculadora',
    subtitle: 'Lucro FBA e DBA na hora',
    featured: true,
    icon: Calculator,
    activeGradient: 'from-violet-600 via-fuchsia-600 to-amber-500 shadow-fuchsia-500/30',
    iconColor: 'text-violet-600',
  },
  {
    id: 'market',
    label: 'Explorar Nichos',
    subtitle: 'Produtos em alta',
    icon: Compass,
    activeGradient: 'from-cyan-600 to-blue-600 shadow-cyan-500/25',
    iconColor: 'text-cyan-600',
  },
  {
    id: 'supplier',
    label: 'Listas CSV',
    subtitle: 'Cruzar fornecedores',
    icon: FileSpreadsheet,
    activeGradient: 'from-emerald-600 to-teal-500 shadow-emerald-500/25',
    iconColor: 'text-emerald-600',
  },
  {
    id: 'spy',
    label: 'Concorrentes',
    subtitle: 'Preços e Buy Box',
    icon: Eye,
    activeGradient: 'from-indigo-600 to-violet-600 shadow-indigo-500/25',
    iconColor: 'text-indigo-500',
  },
  {
    id: 'planner',
    label: 'Metas 12 Meses',
    subtitle: 'Projeção de capital',
    icon: TrendingUp,
    activeGradient: 'from-amber-500 to-orange-600 shadow-amber-500/25',
    iconColor: 'text-amber-600',
  },
  {
    id: 'store',
    label: 'Meus Produtos',
    subtitle: 'Estoque e SKUs',
    icon: Package,
    activeGradient: 'from-slate-800 to-indigo-900 shadow-slate-500/25',
    iconColor: 'text-slate-600',
  },
  {
    id: 'alerts',
    label: 'Config. de Alertas',
    subtitle: 'E-mail e Push',
    icon: Bell,
    activeGradient: 'from-rose-500 to-amber-500 shadow-rose-500/25',
    iconColor: 'text-rose-500',
  },
  {
    id: 'admin',
    label: 'Assinantes',
    subtitle: 'Painel Admin SaaS',
    icon: Users,
    activeGradient: 'from-cyan-600 to-indigo-700 shadow-cyan-500/25',
    iconColor: 'text-cyan-600',
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  user,
  onLogout,
  mobileOpen,
  onCloseMobile,
  highlightedTourTab = null,
}) => {
  const [avatarFailed, setAvatarFailed] = useState(false);

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const content = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-[260px]">
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 bg-clip-text text-transparent whitespace-nowrap shrink-0">
            AmzHub BR
          </span>
          <span className="text-xs text-slate-400 whitespace-nowrap">
            Amazon BR
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Fechar menu"
          className="lg:hidden p-1.5 text-slate-500 hover:text-indigo-600 rounded-md cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation List */}
      <nav aria-label="Navegação principal" className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {NAV_ITEMS.filter(
          (item) =>
            item.id !== 'admin' ||
            user.role === 'ADMIN_FULL' ||
            user.role === 'ADMIN_PAID'
        ).map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          const isTourHighlighted = highlightedTourTab === item.id;
          const displayLabel =
            item.id === 'admin' && user.role === 'ADMIN_PAID'
              ? 'Assinantes Pagos'
              : item.label;
          const displaySubtitle =
            item.id === 'admin' && user.role === 'ADMIN_PAID'
              ? 'Liberar assinaturas'
              : item.subtitle;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all duration-200 cursor-pointer ${
                isTourHighlighted ? 'ring-2 ring-amber-400 ring-offset-2' : ''
              } ${
                active
                  ? `bg-gradient-to-r ${item.activeGradient} text-white shadow-md`
                  : item.featured
                    ? 'bg-gradient-to-r from-violet-50 to-fuchsia-50 border border-violet-200 text-violet-950 hover:from-violet-600 hover:to-fuchsia-600 hover:text-white hover:border-transparent hover:shadow-md hover:shadow-violet-500/20 hover:translate-x-0.5'
                    : 'text-slate-700 hover:bg-indigo-50/70 hover:text-indigo-700 hover:translate-x-0.5'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  active ? 'text-white' : item.iconColor
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate whitespace-nowrap">
                  {displayLabel}
                </div>
                <div
                  className={`text-[11px] truncate ${
                    active ? 'text-white/85' : 'text-slate-500'
                  }`}
                >
                  {displaySubtitle}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Account Footer */}
      <div className="p-4 border-t border-slate-200 space-y-3">
        <div className="flex items-center gap-3">
          {!avatarFailed && user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="w-9 h-9 rounded-full object-cover border border-indigo-200 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-white text-xs font-semibold flex items-center justify-center shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-900 truncate">
              {user.name}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {user.companyName} · {user.taxRegime}
            </div>
            <div
              className={`text-[11px] font-semibold mt-0.5 truncate ${
                user.role === 'ADMIN_FULL'
                  ? 'text-indigo-700'
                  : user.role === 'ADMIN_PAID'
                    ? 'text-cyan-700'
                    : 'text-slate-500'
              }`}
            >
              {user.role === 'ADMIN_FULL'
                ? 'Administrador FULL'
                : user.role === 'ADMIN_PAID'
                  ? 'Admin Assinantes Pagos'
                  : 'Assinante'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="btn-tech-danger w-full h-9 px-3 text-xs"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sair da Conta</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
};
