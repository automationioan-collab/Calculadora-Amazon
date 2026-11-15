import { useCallback, useEffect, useState } from 'react';
import { Bell, Calculator, Clock, Compass, Menu, Plus, Sparkles } from 'lucide-react';
import { AdminSubscribersView } from './components/AdminSubscribersView';
import { AlertsSettingsView } from './components/AlertsSettingsView';
import { CalculatorView } from './components/CalculatorView';
import { CompetitorSpyView } from './components/CompetitorSpyView';
import { LoginView } from './components/LoginView';
import { MarketExplorerView } from './components/MarketExplorerView';
import { OverviewView } from './components/OverviewView';
import { PlannerView } from './components/PlannerView';
import { Sidebar } from './components/Sidebar';
import { StoreManagementView } from './components/StoreManagementView';
import { SubscriptionPaywallView } from './components/SubscriptionPaywallView';
import { SupplierAnalyzerView } from './components/SupplierAnalyzerView';
import { WelcomeTourModal } from './components/WelcomeTourModal';
import type {
  CompetitorWatch,
  MarketProduct,
  PlannerInputs,
  StoreSku,
  UserProfile,
  WorkspaceTab,
} from './types';
import { apiRequest, getStoredToken, setStoredToken } from './utils/api';

const TAB_META: Record<WorkspaceTab, { title: string; subtitle: string }> = {
  overview: {
    title: 'Visão Geral',
    subtitle: 'Resumo financeiro, tendência de receita e acesso rápido à calculadora',
  },
  calculator: {
    title: 'Calculadora Amazon BR',
    subtitle: 'Calcule lucro líquido, margem, ROI e compare FBA, DBA e FBM na hora',
  },
  market: {
    title: 'Explorar Nichos',
    subtitle: 'Encontre produtos com alta demanda e baixa concorrência',
  },
  supplier: {
    title: 'Listas CSV de Fornecedores',
    subtitle: 'Cruze planilhas em massa para descobrir itens lucrativos',
  },
  spy: {
    title: 'Monitor de Concorrentes',
    subtitle: 'Acompanhe preços e participação de Buy Box',
  },
  planner: {
    title: 'Metas de 12 Meses',
    subtitle: 'Simule giro de estoque e crescimento do seu capital',
  },
  store: {
    title: 'Meus Produtos (SKUs)',
    subtitle: 'Gerencie catálogo ativo, estoque e margens da loja',
  },
  alerts: {
    title: 'Configurações de Alertas',
    subtitle: 'Limites de preço, estoque baixo e notificações via e-mail ou push',
  },
  admin: {
    title: 'Administração de Assinantes',
    subtitle: 'Gerenciamento de planos, cobranças, trials e MRR da plataforma',
  },
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);

  const [skus, setSkus] = useState<StoreSku[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorWatch[]>([]);
  const [scenarios, setScenarios] = useState<PlannerInputs[]>([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [highlightedTourTab, setHighlightedTourTab] = useState<WorkspaceTab | null>(null);

  const loadWorkspaceData = useCallback(async (targetUser?: UserProfile) => {
    if (
      targetUser &&
      targetUser.role !== 'ADMIN_FULL' &&
      targetUser.subscriptionInfo &&
      !targetUser.subscriptionInfo.canAccessApp
    ) {
      return;
    }
    try {
      const [skuRes, compRes, planRes] = await Promise.all([
        apiRequest<{ skus: StoreSku[] }>('/api/store/skus'),
        apiRequest<{ competitors: CompetitorWatch[] }>('/api/competitors'),
        apiRequest<{ scenarios: PlannerInputs[] }>('/api/planner/scenarios'),
      ]);
      setSkus(skuRes.skus);
      setCompetitors(compRes.competitors);
      setScenarios(planRes.scenarios);
    } catch {
      // If subscription is required (402), paywall handles activation
    }
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setBooting(false);
      return;
    }
    apiRequest<{ user: UserProfile }>('/api/auth/me')
      .then(async (res) => {
        setUser(res.user);
        if (
          res.user.role !== 'ADMIN_FULL' &&
          res.user.subscriptionInfo?.canAccessApp !== false &&
          !localStorage.getItem(`amzhub_tour_done_${res.user.id}`)
        ) {
          setTourOpen(true);
        }
        await loadWorkspaceData(res.user);
      })
      .catch(() => {
        setStoredToken(null);
      })
      .finally(() => {
        setBooting(false);
      });
  }, [loadWorkspaceData]);

  const handleAuthenticated = async (authedUser: UserProfile) => {
    setUser(authedUser);
    setActiveTab('overview');
    setShowUpgradeModal(false);
    if (
      authedUser.role !== 'ADMIN_FULL' &&
      authedUser.subscriptionInfo?.canAccessApp !== false &&
      !localStorage.getItem(`amzhub_tour_done_${authedUser.id}`)
    ) {
      setTourOpen(true);
    } else {
      setTourOpen(false);
    }
    if (window.location.pathname === '/login') {
      window.history.replaceState({}, '', '/');
    }
    await loadWorkspaceData(authedUser);
  };

  const handleCloseTour = () => {
    if (user) {
      localStorage.setItem(`amzhub_tour_done_${user.id}`, '1');
    }
    setTourOpen(false);
    setHighlightedTourTab(null);
  };

  const handleSubscriptionActivated = async (updatedUser: UserProfile) => {
    setUser(updatedUser);
    setShowUpgradeModal(false);
    await loadWorkspaceData(updatedUser);
  };

  const handleLogout = () => {
    setStoredToken(null);
    setUser(null);
    setActiveTab('overview');
    setShowUpgradeModal(false);
    setTourOpen(false);
    setHighlightedTourTab(null);
    setSkus([]);
    setCompetitors([]);
    setScenarios([]);
    window.history.replaceState({}, '', '/login');
  };

  // Store SKU handlers
  const handleCreateSku = async (payload: Partial<StoreSku>) => {
    const res = await apiRequest<{ sku: StoreSku }>('/api/store/skus', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setSkus((prev) => [res.sku, ...prev]);
  };

  const handleUpdateSku = async (id: string, patch: Partial<StoreSku>) => {
    const res = await apiRequest<{ sku: StoreSku }>(`/api/store/skus/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setSkus((prev) => prev.map((s) => (s.id === id ? res.sku : s)));
  };

  const handleDeleteSku = async (id: string) => {
    await apiRequest(`/api/store/skus/${id}`, { method: 'DELETE' });
    setSkus((prev) => prev.filter((s) => s.id !== id));
  };

  // Competitor handlers
  const handleAddCompetitor = async (payload: {
    sellerName: string;
    sellerId: string;
    primaryAsin: string;
  }) => {
    const res = await apiRequest<{ competitor: CompetitorWatch }>(
      '/api/competitors',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    setCompetitors((prev) => [res.competitor, ...prev]);
  };

  const handleRemoveCompetitor = async (id: string) => {
    await apiRequest(`/api/competitors/${id}`, { method: 'DELETE' });
    setCompetitors((prev) => prev.filter((c) => c.id !== id));
  };

  // Planner handlers
  const handleSaveScenario = async (scenario: PlannerInputs) => {
    const res = await apiRequest<{ scenario: PlannerInputs }>(
      '/api/planner/scenarios',
      {
        method: 'POST',
        body: JSON.stringify(scenario),
      }
    );
    setScenarios((prev) => [res.scenario, ...prev]);
  };

  const handleDeleteScenario = async (id: string) => {
    await apiRequest(`/api/planner/scenarios/${id}`, { method: 'DELETE' });
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  };

  // Cross-module actions from Market Explorer
  const handleAddProductToStore = async (product: MarketProduct) => {
    await handleCreateSku({
      title: product.title,
      asin: product.asin,
      category: product.category,
      fulfillment: product.buyBoxMode,
      salePrice: product.price,
      unitCost: product.estimatedCost,
      weightGrams: product.weightGrams,
      stockUnits: 30,
      dailySalesVelocity: Number(((product.monthlySales / 30) * 0.15).toFixed(1)),
      taxPercent: user?.defaultTaxRate ?? 6.5,
    });
  };

  const handleMonitorProductAsin = async (product: MarketProduct) => {
    await handleAddCompetitor({
      sellerName: `Líder Buy Box (${product.brand})`,
      sellerId: '',
      primaryAsin: product.asin,
    });
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-indigo-700 font-medium">
        Carregando plataforma...
      </div>
    );
  }

  if (!user) {
    return <LoginView onAuthenticated={handleAuthenticated} />;
  }

  if (
    user.role !== 'ADMIN_FULL' &&
    user.subscriptionInfo &&
    !user.subscriptionInfo.canAccessApp
  ) {
    return (
      <SubscriptionPaywallView
        user={user}
        onActivated={handleSubscriptionActivated}
        onLogout={handleLogout}
      />
    );
  }

  const meta = TAB_META[activeTab];
  const subInfo = user.subscriptionInfo;

  return (
    <div className="min-h-screen flex bg-[#f4f7fb] text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        highlightedTourTab={highlightedTourTab}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header */}
        <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir navegação"
              className="lg:hidden p-2 -ml-2 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 truncate">
                <span className="text-slate-400 font-medium hidden sm:inline">
                  {user.companyName} /
                </span>
                <span className="truncate">{meta.title}</span>
              </div>
              <div className="text-xs text-slate-500 truncate hidden sm:block">
                {meta.subtitle}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setTourOpen(true)}
              className="hidden md:inline-flex btn-tech-secondary h-9 px-3.5 text-xs"
            >
              <Compass className="w-3.5 h-3.5 text-indigo-600" />
              <span>Tour Guiado</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('alerts')}
              className="hidden md:inline-flex btn-tech-secondary h-9 px-3.5 text-xs"
            >
              <Bell className="w-3.5 h-3.5 text-rose-500" />
              <span>Alertas</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('calculator')}
              className="btn-tech-calc h-9 px-4 text-xs"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Calculadora</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('store')}
              className="hidden sm:inline-flex btn-tech-primary h-9 px-4 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo SKU</span>
            </button>
          </div>
        </header>

        {/* 25-day FREE trial countdown strip */}
        {user.role !== 'ADMIN_FULL' && subInfo?.isFreeTrialActive && (
          <div className="bg-gradient-to-r from-indigo-50 via-cyan-50 to-emerald-50 border-b border-indigo-200/80 px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-slate-800">
              <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                <strong>Período FREE de 25 dias ativo:</strong> restam{' '}
                <strong className="text-indigo-700 tabular-nums">
                  {subInfo.trialDaysRemaining} dias
                </strong>{' '}
                (até{' '}
                <span className="font-mono">
                  {subInfo.trialEndsAt.split('-').reverse().join('/')}
                </span>
                ). Após esse prazo, somente com assinatura.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="btn-tech-emerald h-8 px-3.5 text-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Assinar Plano</span>
            </button>
          </div>
        )}

        {/* Main Workspace Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1380px] w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewView
              skus={skus}
              competitors={competitors}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === 'calculator' && (
            <CalculatorView user={user} onSaveAsSku={handleCreateSku} />
          )}
          {activeTab === 'market' && (
            <MarketExplorerView
              user={user}
              onAddToStore={handleAddProductToStore}
              onAddCompetitor={handleMonitorProductAsin}
            />
          )}
          {activeTab === 'supplier' && <SupplierAnalyzerView user={user} />}
          {activeTab === 'spy' && (
            <CompetitorSpyView
              competitors={competitors}
              onAdd={handleAddCompetitor}
              onRemove={handleRemoveCompetitor}
            />
          )}
          {activeTab === 'planner' && (
            <PlannerView
              scenarios={scenarios}
              onSaveScenario={handleSaveScenario}
              onDeleteScenario={handleDeleteScenario}
            />
          )}
          {activeTab === 'store' && (
            <StoreManagementView
              user={user}
              skus={skus}
              onCreateSku={handleCreateSku}
              onUpdateSku={handleUpdateSku}
              onDeleteSku={handleDeleteSku}
            />
          )}
          {activeTab === 'alerts' && (
            <AlertsSettingsView skus={skus} competitors={competitors} />
          )}
          {activeTab === 'admin' &&
            (user.role === 'ADMIN_FULL' || user.role === 'ADMIN_PAID' ? (
              <AdminSubscribersView
                userRole={user.role}
                onCurrentUserUpdated={setUser}
              />
            ) : (
              <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center space-y-4 max-w-lg mx-auto my-8">
                <h2 className="text-lg font-bold text-slate-900">
                  Acesso restrito aos Administradores
                </h2>
                <p className="text-sm text-slate-600">
                  Apenas o Administrador FULL ou cadastros selecionados para administrar assinantes pagos podem acessar este painel.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="btn-tech-primary px-5 h-10 text-xs"
                >
                  Voltar para Visão Geral
                </button>
              </div>
            ))}
        </main>
      </div>

      {showUpgradeModal && (
        <SubscriptionPaywallView
          user={user}
          isModal
          onClose={() => setShowUpgradeModal(false)}
          onActivated={handleSubscriptionActivated}
          onLogout={handleLogout}
        />
      )}

      <WelcomeTourModal
        open={tourOpen}
        userName={user.name}
        onNavigateTab={setActiveTab}
        onHighlightTab={setHighlightedTourTab}
        onClose={handleCloseTour}
      />
    </div>
  );
}
