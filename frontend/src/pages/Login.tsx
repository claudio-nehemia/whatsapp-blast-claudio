import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { MessageSquare, Mail, Lock, Eye, EyeOff } from 'lucide-react';

const Login: React.FC = () => {
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-50 px-4 relative">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(18,140,126,0.05),transparent_50%)] pointer-events-none" />
      
      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl p-8 shadow-xl relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 pulse-primary">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-extrabold text-zinc-800 tracking-tight">{t('login')}</h1>
          <p className="text-xs text-zinc-500 mt-1">Sign in to manage WhatsApp blasts</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs text-center font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-600">{t('email')}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 rounded-lg text-sm text-zinc-950 placeholder-zinc-400 transition-all outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-600">{t('password')}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 bg-white border border-zinc-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 rounded-lg text-sm text-zinc-950 placeholder-zinc-400 transition-all outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3.5 text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-lg text-sm transition-all shadow-md shadow-emerald-600/10 disabled:opacity-50 disabled:scale-100 flex items-center justify-center cursor-pointer"
          >
            {isLoading ? '...' : t('login_btn')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-zinc-500">
            {t('no_account')}{' '}
            <Link to="/register" className="text-emerald-600 hover:underline font-bold">
              {t('register')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
