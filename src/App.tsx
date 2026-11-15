import { useCallback, useEffect, useState } from 'react';
import { Bell, Calculator, Menu, Plus } from 'lucide-react';
import { AlertsSettingsView } from './components/AlertsSettingsView';
import { CalculatorView } from './components/CalculatorView';
import { CompetitorSpyView } from './components/CompetitorSpyView';
import { LoginView } from './components/LoginView';
import { MarketExplorerView } from './components/MarketExplorerView';
import { OverviewView } from './components/OverviewView';
import { PlannerView } from './components/PlannerView';
import { Sidebar } from './components/Sidebar';
import { StoreManagementView } from './components/StoreManagementView';
import { SupplierAnalyzerView } from './components/SupplierAnalyzerView';
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
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);

  const [skus, setSkus] = useState<StoreSku[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorWatch[]>([]);
  const [scenarios, setScenarios] = useState<PlannerInputs[]>([]);

  const loadWorkspaceData = useCallback(async () => {
    const [skuRes, compRes, planRes] = await Promise.all([
      apiRequest<{ skus: StoreSku[] }>('/api/store/skus'),
      apiRequest<{ competitors: CompetitorWatch[] }>('/api/competitors'),
      apiRequest<{ scenarios: PlannerInputs[] }>('/api/planner/scenarios'),
    ]);
    setSkus(skuRes.skus);
    setCompetitors(compRes.competitors);
    setScenarios(planRes.scenarios);
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
        await loadWorkspaceData();
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
    if (window.location.pathname === '/login') {
      window.history.replaceState({}, '', '/');
    }
    await loadWorkspaceData();
  };

  const handleLogout = () => {
    setStoredToken(null);
    setUser(null);
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

  const meta = TAB_META[activeTab];

  return (
    <div className="min-h-screen flex bg-[#f4f7fb] text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
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
        </main>
      </div>
    </div>
  );
}
