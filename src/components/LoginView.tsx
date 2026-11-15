import React, { useState } from 'react';
import { ArrowRight, BarChart3, Eye, EyeOff, Layers, ShieldCheck } from 'lucide-react';
import type { UserProfile } from '../types';
import { apiRequest, setStoredToken } from '../utils/api';

interface LoginViewProps {
  onAuthenticated: (user: UserProfile) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('demo@amzhub.com.br');
  const [password, setPassword] = useState('demo1234');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        mode === 'login'
          ? { email, password }
          : { name, companyName, email, password };
      const res = await apiRequest<{ token: string; user: UserProfile }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setStoredToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao autenticar.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoAccess = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: UserProfile }>(
        '/api/auth/demo',
        { method: 'POST' }
      );
      setStoredToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar conta demo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 items-stretch bg-white">
      {/* Left Visual & Positioning Panel */}
      <div className="lg:col-span-6 relative flex flex-col justify-between bg-slate-900 text-white min-h-[320px] lg:min-h-screen overflow-hidden">
        {!imgFailed ? (
          <img
            src="/src/assets/images/login_warehouse_studio_1794711815302.jpg"
            alt="Operação logística e análise financeira para vendedores Amazon Brasil"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/65 to-slate-950/40" />

        <div className="relative z-10 p-8 lg:p-12">
          <span className="text-xl font-bold tracking-tight text-white">
            AmzHub BR
          </span>
        </div>

        <div className="relative z-10 p-8 lg:p-12 max-w-xl space-y-6">
          <div className="text-xs font-medium text-amber-300 tracking-wide">
            Amazon Brasil · FBA, DBA e FBM
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight [text-wrap:balance]">
            Inteligência de dados para escalar sua operação na Amazon Brasil.
          </h1>
          <p className="text-sm lg:text-base text-slate-200 leading-relaxed">
            Substitua achismos por margem líquida validada. Pesquise nichos, cruze
            planilhas de fornecedores, monitore a Buy Box dos concorrentes e projete
            seu fluxo de caixa em um único painel.
          </p>

          <div className="pt-4 border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-200">
            <div className="flex items-start gap-2.5">
              <BarChart3 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-white">Explorador de Nichos</div>
                <div className="text-slate-300 mt-0.5">BSR, demanda e concorrência</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Layers className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-white">Listas em Massa</div>
                <div className="text-slate-300 mt-0.5">Cruzamento EAN e ROI líquido</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-white">Planejador & Loja</div>
                <div className="text-slate-300 mt-0.5">Cálculo FBA, DBA e Simples</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Form */}
      <div className="lg:col-span-6 flex items-center justify-center p-6 sm:p-10 lg:p-16 bg-slate-50">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {mode === 'login' ? 'Acessar plataforma' : 'Criar conta de vendedor'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {mode === 'login'
                ? 'Entre com suas credenciais para abrir seu painel operacional.'
                : 'Configure sua loja em segundos com dados iniciais prontos para análise.'}
            </p>
          </div>

          {/* Segmented Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-indigo-700'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-indigo-700'
              }`}
            >
              Criar Conta
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700"
            >
              Erro: {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label
                    htmlFor="auth-name"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Nome completo
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Mariana Costa"
                    className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor="auth-company"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Nome da loja na Amazon
                  </label>
                  <input
                    id="auth-company"
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex: Costa Comércio E-commerce"
                    className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600"
                  />
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                E-mail corporativo
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@sualoja.com.br"
                className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Senha
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full h-10 pl-3 pr-10 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-indigo-500 hover:text-cyan-600 transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-tech-primary w-full h-11 px-4 text-sm"
            >
              <span>
                {loading
                  ? 'Autenticando...'
                  : mode === 'login'
                    ? 'Entrar no Sistema'
                    : 'Criar Conta e Entrar'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-200 space-y-3">
            <div className="text-xs text-slate-500">
              Acesso imediato para demonstração:
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleDemoAccess}
              className="btn-tech-calc w-full h-10 px-4 text-xs"
            >
              Entrar com Conta Demo (demo@amzhub.com.br)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
