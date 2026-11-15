import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import type { AdminFullRecord, UserProfile } from '../types';
import { apiRequest } from '../utils/api';

interface FullAdminsManagerProps {
  onCurrentUserUpdated?: (user: UserProfile) => void;
}

export const FullAdminsManager: React.FC<FullAdminsManagerProps> = ({
  onCurrentUserUpdated,
}) => {
  const [admins, setAdmins] = useState<AdminFullRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [creating, setCreating] = useState(false);

  // Edit modal state
  const [editingAdmin, setEditingAdmin] = useState<AdminFullRecord | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // 2-step inline delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ admins: AdminFullRecord[] }>('/api/admin/full-admins')
      .then((res) => setAdmins(res.admins))
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar lista de Administradores FULL.'
        )
      )
      .finally(() => setLoading(false));
  }, []);

  const filteredAdmins = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.phone || '').toLowerCase().includes(q) ||
        a.companyName.toLowerCase().includes(q)
    );
  }, [admins, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setCreating(true);
    setError(null);
    setFeedback(null);

    try {
      const res = await apiRequest<{
        admin: AdminFullRecord;
        admins: AdminFullRecord[];
      }>('/api/admin/full-admins', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          companyName: companyName.trim(),
          password,
        }),
      });
      setAdmins(res.admins);
      setFeedback(
        `Administrador FULL "${res.admin.name}" incluído com sucesso.`
      );
      setName('');
      setEmail('');
      setPhone('');
      setCompanyName('');
      setPassword('');
      setShowCreatePassword(false);
      setShowCreateForm(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível incluir o Administrador FULL.'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;
    setSavingEdit(true);
    setError(null);
    setFeedback(null);

    try {
      const payload: {
        name: string;
        email: string;
        phone: string;
        companyName: string;
        password?: string;
      } = {
        name: editingAdmin.name.trim(),
        email: editingAdmin.email.trim(),
        phone: (editingAdmin.phone || '').trim(),
        companyName: editingAdmin.companyName.trim(),
      };
      if (editPassword.trim().length > 0) {
        payload.password = editPassword;
      }

      const res = await apiRequest<{
        admin: AdminFullRecord;
        admins: AdminFullRecord[];
        updatedCurrentUser?: UserProfile;
      }>(`/api/admin/full-admins/${editingAdmin.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setAdmins(res.admins);
      if (res.updatedCurrentUser && onCurrentUserUpdated) {
        onCurrentUserUpdated(res.updatedCurrentUser);
      }
      setFeedback(
        `Dados do Administrador FULL "${res.admin.name}" atualizados.`
      );
      setEditingAdmin(null);
      setEditPassword('');
      setShowEditPassword(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao salvar alterações do Administrador FULL.'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (admin: AdminFullRecord) => {
    setDeletingId(admin.id);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{ admins: AdminFullRecord[] }>(
        `/api/admin/full-admins/${admin.id}`,
        { method: 'DELETE' }
      );
      setAdmins(res.admins);
      setConfirmDeleteId(null);
      setFeedback(`Administrador FULL "${admin.name}" excluído do sistema.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao excluir Administrador FULL.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Simple Explanatory Header & Action */}
      <div className="bg-white border border-indigo-200/80 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 max-w-2xl">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Cadastro de Administradores FULL ({admins.length})
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              Qualquer Administrador FULL tem acesso total ao painel, aos assinantes e a esta lista. Aqui você inclui novos administradores, edita dados ou senha e exclui contas antigas com facilidade.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setShowCreateForm((v) => !v);
          }}
          className="btn-tech-calc h-10 px-4 text-xs"
        >
          <Plus className="w-4 h-4" />
          <span>
            {showCreateForm ? 'Fechar Cadastro' : 'Novo Administrador FULL'}
          </span>
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-700 hover:text-rose-950 font-semibold cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {feedback && (
        <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center justify-between gap-3">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-emerald-700 hover:text-emerald-950 font-semibold cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Simple Create Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-indigo-200 rounded-2xl p-6 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <UserPlus className="w-4 h-4 text-indigo-600" />
              <span>Incluir Novo Administrador FULL</span>
            </div>
            <span className="text-[11px] font-medium text-slate-500">
              Acesso total imediato após salvar
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Nome Completo *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Juliana Martins"
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                E-mail de Acesso *
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="juliana@amzhub.com.br"
                  className="w-full h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Telefone / WhatsApp
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 98888-7777"
                  className="w-full h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Empresa / Área
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="AmzHub BR Administração"
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Senha de Acesso (mínimo 6 caracteres) *
              </label>
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showCreatePassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite uma senha segura com 6+ caracteres"
                  className="w-full h-9 pl-8 pr-9 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePassword((v) => !v)}
                  aria-label="Mostrar ou ocultar senha"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showCreatePassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="btn-tech-secondary h-9 px-4 text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creating}
              className="btn-tech-emerald h-9 px-5 text-xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {creating ? 'Incluindo...' : 'Incluir Administrador FULL'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Full Admins Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar administrador por nome, e-mail ou empresa..."
              className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium tabular-nums">
            Exibindo {filteredAdmins.length} de {admins.length} administradores FULL
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-6">Administrador</th>
                <th className="py-3 px-4">E-mail de Acesso</th>
                <th className="py-3 px-4">Telefone / WhatsApp</th>
                <th className="py-3 px-4">Empresa / Área</th>
                <th className="py-3 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-10 text-center text-sm text-slate-500"
                  >
                    Carregando Administradores FULL...
                  </td>
                </tr>
              ) : filteredAdmins.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-10 text-center text-sm text-slate-500"
                  >
                    Nenhum Administrador FULL encontrado.
                  </td>
                </tr>
              ) : (
                filteredAdmins.map((admin) => {
                  const isConfirming = confirmDeleteId === admin.id;
                  const canDelete = !admin.isCurrentUser && admins.length > 1;
                  const deleteHint = admin.isCurrentUser
                    ? 'Você está logado nesta conta'
                    : admins.length <= 1
                      ? 'É necessário manter ao menos 1 Administrador FULL'
                      : `Excluir ${admin.name}`;

                  return (
                    <tr
                      key={admin.id}
                      className="hover:bg-indigo-50/30 transition-colors"
                    >
                      <td className="py-3.5 px-6">
                        <div className="font-semibold text-slate-900">
                          {admin.name}
                          {admin.isCurrentUser && (
                            <span className="ml-2 text-[11px] font-semibold text-indigo-700">
                              · Sessão atual
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Permissão: Acesso Total (Administrador FULL)
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs text-slate-700">
                        {admin.email}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                        {admin.phone || '—'}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-700">
                        {admin.companyName}
                      </td>

                      <td className="py-3.5 px-6 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(null);
                              setEditPassword('');
                              setShowEditPassword(false);
                              setEditingAdmin({ ...admin });
                            }}
                            aria-label={`Editar ${admin.name}`}
                            className="btn-tech-primary px-3 py-1.5 text-[11px]"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>

                          {isConfirming ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                disabled={deletingId === admin.id}
                                onClick={() => handleDelete(admin)}
                                className="btn-tech-danger px-2.5 py-1.5 text-[11px]"
                              >
                                {deletingId === admin.id
                                  ? 'Excluindo...'
                                  : 'Confirmar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="btn-tech-secondary px-2.5 py-1.5 text-[11px]"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={!canDelete}
                              title={deleteHint}
                              aria-label={deleteHint}
                              onClick={() => setConfirmDeleteId(admin.id)}
                              className={`px-3 py-1.5 text-[11px] rounded-xl font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                                canDelete
                                  ? 'btn-tech-danger'
                                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Excluir</span>
                            </button>
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

      {/* Edit Full Admin Modal */}
      {editingAdmin && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-full-admin-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Pencil className="w-4 h-4" />
                <h3 id="edit-full-admin-title" className="text-sm font-bold">
                  Editar Administrador FULL — {editingAdmin.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingAdmin(null);
                  setEditPassword('');
                }}
                aria-label="Fechar edição"
                className="p-1 text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingAdmin.name}
                    onChange={(e) =>
                      setEditingAdmin({
                        ...editingAdmin,
                        name: e.target.value,
                      })
                    }
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    E-mail de Acesso *
                  </label>
                  <input
                    type="email"
                    required
                    value={editingAdmin.email}
                    onChange={(e) =>
                      setEditingAdmin({
                        ...editingAdmin,
                        email: e.target.value,
                      })
                    }
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={editingAdmin.phone || ''}
                    onChange={(e) =>
                      setEditingAdmin({
                        ...editingAdmin,
                        phone: e.target.value,
                      })
                    }
                    placeholder="(11) 99999-9999"
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Empresa / Área
                  </label>
                  <input
                    type="text"
                    value={editingAdmin.companyName}
                    onChange={(e) =>
                      setEditingAdmin({
                        ...editingAdmin,
                        companyName: e.target.value,
                      })
                    }
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nova Senha (deixe em branco para manter a atual)
                  </label>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showEditPassword ? 'text' : 'password'}
                      minLength={6}
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Digite 6+ caracteres apenas se desejar trocar a senha"
                      className="w-full h-9 pl-8 pr-9 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword((v) => !v)}
                      aria-label="Mostrar ou ocultar nova senha"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showEditPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditingAdmin(null);
                    setEditPassword('');
                  }}
                  className="btn-tech-secondary h-9 px-4 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="btn-tech-emerald h-9 px-5 text-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{savingEdit ? 'Salvando...' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
