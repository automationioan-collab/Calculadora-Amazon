import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  KeyRound,
  Lock,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  Unlock,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type {
  PaymentMethod,
  SubscriberPlan,
  SubscriberRecord,
  SubscriberStatus,
  UserRole,
} from '../types';
import { apiRequest } from '../utils/api';
import { formatBRL, formatNumberBR } from '../utils/amazonBr';

interface AdminSubscribersViewProps {
  userRole: UserRole;
}

const PLAN_PRICING_META: Record<
  SubscriberPlan,
  { monthlyPrice: number; skusLimit: number }
> = {
  Starter: { monthlyPrice: 97, skusLimit: 25 },
  Pro: { monthlyPrice: 197, skusLimit: 150 },
  Enterprise: { monthlyPrice: 397, skusLimit: 1000 },
};

function getTrialDaysLeft(trialEndsAt?: string): number {
  if (!trialEndsAt) return 0;
  const endMs = new Date(`${trialEndsAt.slice(0, 10)}T23:59:59.999Z`).getTime();
  if (Number.isNaN(endMs)) return 0;
  const diff = endMs - Date.now();
  if (diff <= 0) return 0;
  return Math.min(25, Math.ceil(diff / 86400000));
}

export const AdminSubscribersView: React.FC<AdminSubscribersViewProps> = ({
  userRole,
}) => {
  const isFullAdmin = userRole === 'ADMIN_FULL';

  const [subscribers, setSubscribers] = useState<SubscriberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | SubscriberStatus>('Todos');
  const [planFilter, setPlanFilter] = useState<'Todos' | SubscriberPlan>('Todos');
  const [onlySelectedAdmins, setOnlySelectedAdmins] = useState(false);

  // Create form state (ADMIN_FULL only)
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [amazonAccountId, setAmazonAccountId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [plan, setPlan] = useState<SubscriberPlan>('Starter');
  const [status, setStatus] = useState<SubscriberStatus>('Trial');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [createAccessGranted, setCreateAccessGranted] = useState(true);
  const [createIsPaidAdmin, setCreateIsPaidAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit modal state (ADMIN_FULL only)
  const [editingSub, setEditingSub] = useState<SubscriberRecord | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // 2-step inline delete confirmation state (ADMIN_FULL only)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ subscribers: SubscriberRecord[] }>('/api/admin/subscribers')
      .then((res) => setSubscribers(res.subscribers))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Erro ao carregar assinantes.')
      )
      .finally(() => setLoading(false));
  }, []);

  const kpis = useMemo(() => {
    const active = subscribers.filter((s) => s.status === 'Ativo');
    const trial = subscribers.filter((s) => s.status === 'Trial');
    const granted = subscribers.filter((s) => s.accessGranted);
    const selectedAdmins = subscribers.filter((s) => s.isPaidAdmin);
    const atRisk = subscribers.filter(
      (s) => s.status === 'Inadimplente' || s.status === 'Suspenso'
    );

    const mrr = active.reduce((acc, s) => acc + s.monthlyPrice, 0);
    const riskMrr = atRisk.reduce((acc, s) => acc + s.monthlyPrice, 0);
    return {
      mrr,
      arr: mrr * 12,
      activeCount: active.length,
      trialCount: trial.length,
      grantedCount: granted.length,
      selectedAdminsCount: selectedAdmins.length,
      atRiskCount: atRisk.length,
      riskMrr,
      total: subscribers.length,
    };
  }, [subscribers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subscribers.filter((s) => {
      if (statusFilter !== 'Todos' && s.status !== statusFilter) return false;
      if (planFilter !== 'Todos' && s.plan !== planFilter) return false;
      if (onlySelectedAdmins && !s.isPaidAdmin) return false;
      if (
        q &&
        !s.name.toLowerCase().includes(q) &&
        !s.email.toLowerCase().includes(q) &&
        !(s.phone || '').toLowerCase().includes(q) &&
        !(s.amazonAccountId || '').toLowerCase().includes(q) &&
        !s.companyName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [subscribers, search, statusFilter, planFilter, onlySelectedAdmins]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFullAdmin || !name.trim() || !email.trim()) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{ subscribers: SubscriberRecord[] }>(
        '/api/admin/subscribers',
        {
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
            phone,
            amazonAccountId,
            companyName,
            initialPassword: initialPassword.trim() || undefined,
            plan,
            status,
            paymentMethod,
            accessGranted: createAccessGranted,
            isPaidAdmin: createIsPaidAdmin,
          }),
        }
      );
      setSubscribers(res.subscribers);
      setFeedback(
        `Assinante ${name.trim()} cadastrado com sucesso.`
      );
      setName('');
      setEmail('');
      setPhone('');
      setAmazonAccountId('');
      setCompanyName('');
      setInitialPassword('');
      setCreateAccessGranted(true);
      setCreateIsPaidAdmin(false);
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar assinante.');
    } finally {
      setSaving(false);
    }
  };

  const handlePatch = async (
    id: string,
    patch: Partial<SubscriberRecord>,
    successMsg?: string
  ) => {
    setError(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{ subscribers: SubscriberRecord[] }>(
        `/api/admin/subscribers/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
        }
      );
      setSubscribers(res.subscribers);
      if (successMsg) setFeedback(successMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar assinante.');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub || !isFullAdmin) return;
    setEditSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{ subscribers: SubscriberRecord[] }>(
        `/api/admin/subscribers/${editingSub.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: editingSub.name,
            email: editingSub.email,
            phone: editingSub.phone,
            amazonAccountId: editingSub.amazonAccountId,
            companyName: editingSub.companyName,
            plan: editingSub.plan,
            monthlyPrice: Number(editingSub.monthlyPrice),
            skusLimit: Number(editingSub.skusLimit),
            status: editingSub.status,
            paymentMethod: editingSub.paymentMethod,
            trialEndsAt: editingSub.trialEndsAt,
            nextBillingDate: editingSub.nextBillingDate,
            accessGranted: editingSub.accessGranted,
            isPaidAdmin: Boolean(editingSub.isPaidAdmin),
          }),
        }
      );
      setSubscribers(res.subscribers);
      setFeedback(`Dados de ${editingSub.name} atualizados.`);
      setEditingSub(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar edição.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: string, subName: string) => {
    if (!isFullAdmin) return;
    setError(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{ subscribers: SubscriberRecord[] }>(
        `/api/admin/subscribers/${id}`,
        { method: 'DELETE' }
      );
      setSubscribers(res.subscribers);
      setConfirmDeleteId(null);
      setFeedback(`Assinante ${subName} removido do sistema.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover assinante.');
    }
  };

  const exportCsv = () => {
    const header = [
      'Nome',
      'Email',
      'Telefone',
      'Conta Amazon',
      'Loja',
      'Plano',
      'Mensalidade',
      'Status',
      'Acesso Liberado',
      'Admin Assinantes Pagos',
      'Fim 25d FREE',
      'SKUs Usados',
      'Limite SKUs',
      'Pagamento',
      'Proxima Cobranca',
    ].join(';');
    const lines = filtered.map((s) =>
      [
        `"${s.name}"`,
        s.email,
        `"${s.phone || ''}"`,
        s.amazonAccountId || '',
        `"${s.companyName}"`,
        s.plan,
        s.monthlyPrice.toFixed(2),
        s.status,
        s.accessGranted ? 'Sim' : 'Nao',
        s.isPaidAdmin ? 'Sim' : 'Nao',
        s.trialEndsAt || '',
        s.skusUsed,
        s.skusLimit,
        s.paymentMethod,
        s.nextBillingDate,
      ].join(';')
    );
    const blob = new Blob([[header, ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'assinantes_amzhub_br.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const availableStatuses: ReadonlyArray<'Todos' | SubscriberStatus> = isFullAdmin
    ? ['Todos', 'Ativo', 'Trial', 'Inadimplente', 'Suspenso']
    : ['Todos', 'Ativo', 'Inadimplente', 'Suspenso'];

  return (
    <div className="space-y-6">
      {/* Admin Hero Header */}
      <div className="rounded-2xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-700 p-6 text-white shadow-lg shadow-blue-500/20 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">
                {isFullAdmin
                  ? 'Administração de Assinantes'
                  : 'Administração de Assinantes Pagos'}
              </h2>
              <span className="text-[11px] font-semibold text-cyan-100">
                {isFullAdmin
                  ? '· Administrador FULL'
                  : '· Cadastro selecionado para gerenciar assinaturas pagas'}
              </span>
            </div>
            <p className="text-sm text-cyan-50 mt-0.5">
              {isFullAdmin
                ? 'Controle completo: selecione quais cadastros serão administradores de assinantes pagos, edite dados, libere acessos ou exclua contas.'
                : 'Gerencie assinantes pagos e libere ou bloqueie o acesso às suas assinaturas.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={exportCsv}
            className="px-3.5 h-10 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 text-xs font-semibold inline-flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>
          {isFullAdmin && (
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="btn-tech-calc h-10 px-4 text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>{showAddForm ? 'Fechar Formulário' : 'Novo Assinante'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 4-Column SaaS Billing KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs font-semibold text-slate-500">
            MRR (Assinantes Pagos)
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {formatBRL(kpis.mrr)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            ARR anualizado: {formatBRL(kpis.arr)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs font-semibold text-slate-500">
            Assinaturas com Acesso
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
            {formatNumberBR(kpis.grantedCount)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {kpis.activeCount} ativos · {kpis.total} exibidos
          </div>
        </div>

        {isFullAdmin ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="text-xs font-semibold text-slate-500">
              Admins de Assinantes Pagos
            </div>
            <div className="mt-2 text-2xl font-bold text-indigo-700 font-mono tabular-nums">
              {formatNumberBR(kpis.selectedAdminsCount)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500">
              {kpis.trialCount} em período FREE (25 dias)
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="text-xs font-semibold text-slate-500">
              Assinantes Pagos Ativos
            </div>
            <div className="mt-2 text-2xl font-bold text-indigo-700 font-mono tabular-nums">
              {formatNumberBR(kpis.activeCount)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500">
              Prontos para gestão de assinatura
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs font-semibold text-slate-500">
            Inadimplentes / Suspensos
          </div>
          <div
            className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
              kpis.atRiskCount > 0 ? 'text-rose-600' : 'text-slate-900'
            }`}
          >
            {formatNumberBR(kpis.atRiskCount)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            MRR em risco: {formatBRL(kpis.riskMrr)}
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
          {error}
        </div>
      )}

      {feedback && (
        <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center justify-between gap-3">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-emerald-700 hover:text-emerald-950 text-xs font-semibold cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Create Subscriber Form (ADMIN_FULL only) */}
      {isFullAdmin && showAddForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-indigo-200 rounded-2xl p-6 space-y-4 shadow-sm"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>Cadastrar Novo Assinante (25 dias FREE automático)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Nome Completo
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Thiago Ribeiro"
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                E-mail de Acesso
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="thiago@lojabr.com.br"
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Nome da Loja Amazon
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ribeiro Comércio Digital"
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Telefone / WhatsApp
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Conta da Amazon (Seller ID)
              </label>
              <div className="relative">
                <Store className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={amazonAccountId}
                  onChange={(e) => setAmazonAccountId(e.target.value)}
                  placeholder="A2Q8K9X4BR"
                  className="w-full h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase"
                />
              </div>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Senha Inicial (opcional)
              </label>
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={initialPassword}
                  onChange={(e) => setInitialPassword(e.target.value)}
                  placeholder="123456 (padrão se vazio)"
                  className="w-full h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Plano
              </label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as SubscriberPlan)}
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="Starter">Starter (R$ 97)</option>
                <option value="Pro">Pro (R$ 197)</option>
                <option value="Enterprise">Enterprise (R$ 397)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Situação
              </label>
              <select
                value={status}
                onChange={(e) => {
                  const next = e.target.value as SubscriberStatus;
                  setStatus(next);
                  setCreateAccessGranted(next !== 'Suspenso');
                }}
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="Trial">Trial (25 dias FREE)</option>
                <option value="Ativo">Ativo (Assinante)</option>
                <option value="Inadimplente">Inadimplente</option>
                <option value="Suspenso">Suspenso</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Pagamento
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="PIX">PIX</option>
                <option value="Cartão">Cartão</option>
                <option value="Boleto">Boleto</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 h-9 px-3 w-full bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createAccessGranted}
                  onChange={(e) => setCreateAccessGranted(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Liberar login</span>
              </label>
            </div>

            <div className="lg:col-span-2 flex items-end">
              <label className="flex items-center gap-2 h-9 px-3 w-full bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-semibold text-indigo-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createIsPaidAdmin}
                  onChange={(e) => setCreateIsPaidAdmin(e.target.checked)}
                  className="rounded border-indigo-300 text-indigo-600"
                />
                <span>Admin de Assinantes Pagos</span>
              </label>
            </div>

            <div className="lg:col-span-6 flex justify-end pt-1">
              <button
                type="submit"
                disabled={saving}
                className="btn-tech-emerald h-9 px-5 text-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{saving ? 'Salvando...' : 'Cadastrar Assinante'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filters & Subscribers Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, e-mail, telefone ou conta Amazon..."
              className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
              {availableStatuses.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === st
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-indigo-700'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {isFullAdmin && (
              <button
                type="button"
                onClick={() => setOnlySelectedAdmins((v) => !v)}
                className={`h-9 px-3 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  onlySelectedAdmins
                    ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white border-transparent shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Somente Admins Pagos</span>
              </button>
            )}

            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value as 'Todos' | SubscriberPlan)}
              className="h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="Todos">Todos os Planos</option>
              <option value="Starter">Starter</option>
              <option value="Pro">Pro</option>
              <option value="Enterprise">Enterprise</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-6">Assinante / Identidade</th>
                <th className="py-3 px-4">Plano</th>
                <th className="py-3 px-4 text-right">Mensalidade</th>
                <th className="py-3 px-4">Assinatura / Prazo</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Acesso</th>
                {isFullAdmin && <th className="py-3 px-4">Admin Pagos</th>}
                <th className="py-3 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td
                    colSpan={isFullAdmin ? 8 : 7}
                    className="py-10 text-center text-sm text-slate-500"
                  >
                    Carregando base de assinantes...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={isFullAdmin ? 8 : 7}
                    className="py-10 text-center text-sm text-slate-500"
                  >
                    Nenhum assinante encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filtered.map((sub) => {
                  const daysLeft = getTrialDaysLeft(sub.trialEndsAt);
                  const isConfirmingDelete = confirmDeleteId === sub.id;
                  return (
                    <tr key={sub.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="font-semibold text-slate-900">
                          {sub.name}{' '}
                          <span className="text-xs font-normal text-slate-500">
                            · {sub.companyName}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5 font-mono">
                          {sub.email}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                          Tel: {sub.phone || '-'} · Amazon:{' '}
                          {sub.amazonAccountId || '-'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <select
                          aria-label={`Plano de ${sub.name}`}
                          value={sub.plan}
                          onChange={(e) =>
                            handlePatch(
                              sub.id,
                              { plan: e.target.value as SubscriberPlan },
                              `Plano de ${sub.name} alterado para ${e.target.value}.`
                            )
                          }
                          className="h-8 px-2.5 text-xs font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg cursor-pointer"
                        >
                          <option value="Starter">Starter</option>
                          <option value="Pro">Pro</option>
                          <option value="Enterprise">Enterprise</option>
                        </select>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-slate-900 tabular-nums">
                        {formatBRL(sub.monthlyPrice)}
                        <div className="text-[10px] font-normal text-slate-500">
                          {sub.skusUsed}/{sub.skusLimit} SKUs
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs tabular-nums">
                        {sub.status === 'Ativo' ? (
                          <div className="text-emerald-700 font-semibold">
                            Assinante Pago
                            <div className="text-[11px] font-normal text-slate-500 font-mono">
                              Próx: {sub.nextBillingDate}
                            </div>
                          </div>
                        ) : sub.status === 'Trial' && daysLeft > 0 ? (
                          <div className="text-indigo-700 font-semibold">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {daysLeft} dias FREE
                            </span>
                            <div className="text-[11px] font-normal text-slate-500 font-mono">
                              Até {sub.trialEndsAt}
                            </div>
                          </div>
                        ) : (
                          <div className="text-rose-600 font-semibold">
                            {sub.status}
                            <div className="text-[11px] font-normal text-slate-500 font-mono">
                              Venc: {sub.nextBillingDate}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <select
                          aria-label={`Status de ${sub.name}`}
                          value={sub.status}
                          onChange={(e) =>
                            handlePatch(
                              sub.id,
                              { status: e.target.value as SubscriberStatus },
                              `Status de ${sub.name} alterado para ${e.target.value}.`
                            )
                          }
                          className={`h-8 px-2.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                            sub.status === 'Ativo'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : sub.status === 'Trial'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : sub.status === 'Inadimplente'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          <option value="Ativo">Ativo</option>
                          {isFullAdmin && <option value="Trial">Trial</option>}
                          <option value="Inadimplente">Inadimplente</option>
                          <option value="Suspenso">Suspenso</option>
                        </select>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold ${
                            sub.accessGranted ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {sub.accessGranted ? (
                            <>
                              <Unlock className="w-3.5 h-3.5" />
                              <span>Liberado</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5" />
                              <span>Bloqueado</span>
                            </>
                          )}
                        </span>
                      </td>

                      {isFullAdmin && (
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() =>
                              handlePatch(
                                sub.id,
                                { isPaidAdmin: !sub.isPaidAdmin },
                                !sub.isPaidAdmin
                                  ? `${sub.name} selecionado como Admin de Assinantes Pagos.`
                                  : `${sub.name} removido dos Admins de Assinantes Pagos.`
                              )
                            }
                            className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold border inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                              sub.isPaidAdmin
                                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white border-transparent shadow-sm'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
                            }`}
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>
                              {sub.isPaidAdmin ? 'Selecionado' : 'Selecionar'}
                            </span>
                          </button>
                        </td>
                      )}

                      <td className="py-3.5 px-6 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handlePatch(
                                sub.id,
                                {
                                  accessGranted: !sub.accessGranted,
                                  status:
                                    !sub.accessGranted &&
                                    (sub.status === 'Suspenso' ||
                                      sub.status === 'Inadimplente')
                                      ? 'Ativo'
                                      : sub.status,
                                },
                                !sub.accessGranted
                                  ? `Acesso à assinatura liberado para ${sub.name}.`
                                  : `Acesso bloqueado para ${sub.name}.`
                              )
                            }
                            className={
                              sub.accessGranted
                                ? 'btn-tech-secondary px-2.5 py-1.5 text-[11px]'
                                : 'btn-tech-emerald px-2.5 py-1.5 text-[11px]'
                            }
                          >
                            {sub.accessGranted ? 'Bloquear' : 'Dar Acesso'}
                          </button>

                          {isFullAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteId(null);
                                  setEditingSub({ ...sub });
                                }}
                                aria-label={`Editar ${sub.name}`}
                                className="btn-tech-primary px-2.5 py-1.5 text-[11px]"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>Editar</span>
                              </button>

                              {isConfirmingDelete ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(sub.id, sub.name)}
                                    className="btn-tech-danger px-2.5 py-1.5 text-[11px]"
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="btn-tech-secondary px-2 py-1.5 text-[11px]"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(sub.id)}
                                  aria-label={`Excluir ${sub.name}`}
                                  className="btn-tech-danger p-1.5"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Subscriber Modal (ADMIN_FULL only) */}
      {isFullAdmin && editingSub && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-subscriber-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
        >
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Pencil className="w-4 h-4" />
                <h3 id="edit-subscriber-title" className="text-sm font-bold">
                  Editar Assinante — {editingSub.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSub(null)}
                aria-label="Fechar edição"
                className="p-1 text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    required
                    value={editingSub.name}
                    onChange={(e) =>
                      setEditingSub({ ...editingSub, name: e.target.value })
                    }
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    E-mail de Acesso
                  </label>
                  <input
                    type="email"
                    required
                    value={editingSub.email}
                    onChange={(e) =>
                      setEditingSub({ ...editingSub, email: e.target.value })
                    }
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={editingSub.phone || ''}
                    onChange={(e) =>
                      setEditingSub({ ...editingSub, phone: e.target.value })
                    }
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Conta da Amazon (Seller ID)
                  </label>
                  <input
                    type="text"
                    value={editingSub.amazonAccountId || ''}
                    onChange={(e) =>
                      setEditingSub({
                        ...editingSub,
                        amazonAccountId: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nome da Loja Amazon
                  </label>
                  <input
                    type="text"
                    required
                    value={editingSub.companyName}
                    onChange={(e) =>
                      setEditingSub({ ...editingSub, companyName: e.target.value })
                    }
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Plano
                  </label>
                  <select
                    value={editingSub.plan}
                    onChange={(e) => {
                      const nextPlan = e.target.value as SubscriberPlan;
                      const meta = PLAN_PRICING_META[nextPlan];
                      setEditingSub({
                        ...editingSub,
                        plan: nextPlan,
                        monthlyPrice: meta.monthlyPrice,
                        skusLimit: meta.skusLimit,
                      });
                    }}
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="Starter">Starter</option>
                    <option value="Pro">Pro</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Situação
                  </label>
                  <select
                    value={editingSub.status}
                    onChange={(e) => {
                      const nextStatus = e.target.value as SubscriberStatus;
                      setEditingSub({
                        ...editingSub,
                        status: nextStatus,
                        accessGranted:
                          nextStatus === 'Suspenso'
                            ? false
                            : editingSub.accessGranted,
                      });
                    }}
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="Trial">Trial (25 dias FREE)</option>
                    <option value="Ativo">Ativo (Assinante)</option>
                    <option value="Inadimplente">Inadimplente</option>
                    <option value="Suspenso">Suspenso</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Mensalidade (R$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={editingSub.monthlyPrice}
                    onChange={(e) =>
                      setEditingSub({
                        ...editingSub,
                        monthlyPrice: Number(e.target.value),
                      })
                    }
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Limite de SKUs
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editingSub.skusLimit}
                    onChange={(e) =>
                      setEditingSub({
                        ...editingSub,
                        skusLimit: Number(e.target.value),
                      })
                    }
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Fim do Prazo FREE (25d)
                  </label>
                  <input
                    type="date"
                    required
                    value={editingSub.trialEndsAt || ''}
                    onChange={(e) =>
                      setEditingSub({
                        ...editingSub,
                        trialEndsAt: e.target.value,
                      })
                    }
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Próxima Cobrança
                  </label>
                  <input
                    type="date"
                    required
                    value={editingSub.nextBillingDate}
                    onChange={(e) =>
                      setEditingSub({
                        ...editingSub,
                        nextBillingDate: e.target.value,
                      })
                    }
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingSub.accessGranted}
                    onChange={(e) =>
                      setEditingSub({
                        ...editingSub,
                        accessGranted: e.target.checked,
                      })
                    }
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span>
                    Acesso à plataforma liberado (permite login com este e-mail)
                  </span>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingSub.isPaidAdmin)}
                    onChange={(e) =>
                      setEditingSub({
                        ...editingSub,
                        isPaidAdmin: e.target.checked,
                      })
                    }
                    className="rounded border-indigo-300 text-indigo-600"
                  />
                  <span>
                    Selecionar como Administrador de Assinantes Pagos (pode dar acesso às assinaturas)
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingSub(null)}
                  className="btn-tech-secondary h-9 px-4 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="btn-tech-emerald h-9 px-5 text-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editSaving ? 'Salvando...' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
