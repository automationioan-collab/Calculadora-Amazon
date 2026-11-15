import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  Layers,
  Phone,
  ShieldCheck,
  Store,
} from 'lucide-react';
import type { FreeEligibilityResult, UserProfile } from '../types';
import { apiRequest, setStoredToken } from '../utils/api';

interface LoginViewProps {
  onAuthenticated: (user: UserProfile) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [amazonAccountId, setAmazonAccountId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const [eligibility, setEligibility] = useState<FreeEligibilityResult | null>(null);
  const [checkingFree, setCheckingFree] = useState(false);

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setError(null);
    setEligibility(null);
  };

  // Automatic recognition of email, phone, and Amazon Seller account for 25-day FREE eligibility
  useEffect(() => {
    if (mode !== 'register') return;
    const hasInput =
      email.trim().includes('@') ||
      phone.replace(/\D/g, '').length >= 10 ||
      amazonAccountId.trim().length >= 4;
    if (!hasInput) {
      setEligibility(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setCheckingFree(true);
      try {
        const res = await apiRequest<FreeEligibilityResult>(
          '/api/auth/check-free-eligibility',
          {
            method: 'POST',
            body: JSON.stringify({ email, phone, amazonAccountId }),
          }
        );
        setEligibility(res);
      } catch {
        // Ignore silent check errors
      } finally {
        setCheckingFree(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [mode, email, phone, amazonAccountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        mode === 'login'
          ? { email, password }
          : { name, companyName, email, phone, amazonAccountId, password };
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
            Amazon Brasil · 25 Dias de Acesso FREE no Cadastro
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight [text-wrap:balance]">
            Inteligência de dados para escalar sua operação na Amazon Brasil.
          </h1>
          <p className="text-sm lg:text-base text-slate-200 leading-relaxed">
            Novos vendedores ganham 25 dias FREE completos vinculados ao e-mail,
            telefone e conta da Amazon. Após o prazo, continue com uma assinatura ativa.
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
                <div className="font-semibold text-white">25 Dias FREE</div>
                <div className="text-slate-300 mt-0.5">Validação única por conta</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Form */}
      <div className="lg:col-span-6 flex items-center justify-center p-6 sm:p-10 lg:p-12 bg-slate-50">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="mb-5">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {mode === 'login' ? 'Acessar plataforma' : 'Criar conta — 25 dias FREE'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {mode === 'login'
                ? 'Entre com suas credenciais para abrir seu painel operacional.'
                : 'Validamos seu e-mail, telefone e conta Amazon para liberar 25 dias gratuitos.'}
            </p>
          </div>

          {/* Segmented Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl mb-5">
            <button
              type="button"
              onClick={() => switchMode('login')}
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
              onClick={() => switchMode('register')}
              className={`py-2 text-xs font-semibold rounded-lg transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-indigo-700'
              }`}
            >
              Criar Conta (25d FREE)
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700"
            >
              Erro: {error}
            </div>
          )}

          {mode === 'register' && (eligibility || checkingFree) && (
            <div
              className={`mb-4 px-3.5 py-2.5 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
                checkingFree
                  ? 'bg-slate-50 border-slate-200 text-slate-600'
                  : eligibility?.eligibleForFree
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              {checkingFree ? (
                <span>Verificando e-mail, telefone e conta Amazon...</span>
              ) : eligibility?.eligibleForFree ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{eligibility.message}</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{eligibility?.message}</span>
                </>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <>
                <div>
                  <label
                    htmlFor="auth-name"
                    className="block text-xs font-semibold text-slate-700 mb-1"
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="auth-phone"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Telefone / WhatsApp
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="auth-phone"
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(11) 99999-9999"
                        className="w-full h-10 pl-8 pr-3 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="auth-amazon"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Conta da Amazon (Seller ID)
                    </label>
                    <div className="relative">
                      <Store className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="auth-amazon"
                        type="text"
                        required
                        value={amazonAccountId}
                        onChange={(e) => setAmazonAccountId(e.target.value)}
                        placeholder="Ex: A2Q8K9X4BR"
                        className="w-full h-10 pl-8 pr-3 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="auth-company"
                    className="block text-xs font-semibold text-slate-700 mb-1"
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
                className="block text-xs font-semibold text-slate-700 mb-1"
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
                className="block text-xs font-semibold text-slate-700 mb-1"
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
                    : eligibility?.requiresSubscriptionNow
                      ? 'Cadastrar e Assinar Plano'
                      : 'Criar Conta com 25 Dias FREE'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
