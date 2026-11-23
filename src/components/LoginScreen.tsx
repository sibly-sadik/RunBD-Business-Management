import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Database,
  Eye,
  EyeOff,
  Headphones,
  Link2,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { DEMO_USERS } from '../data/seedData';
import { User } from '../types';
import { loginWithServer } from '../utils/apiSync';
import { AppFooter } from './AppFooter';

interface LoginScreenProps {
  teamMembers?: User[];
  onLogin: (user: User) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function LoginScreen({
  teamMembers,
  onLogin,
  theme,
  onToggleTheme,
}: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeDirectory = useMemo(() => {
    const source = teamMembers && teamMembers.length > 0 ? teamMembers : DEMO_USERS;
    return source.filter((u) => u.isActive !== false);
  }, [teamMembers]);

  const adminUsers = useMemo(
    () => activeDirectory.filter((u) => u.role === 'admin'),
    [activeDirectory]
  );
  const agentUsers = useMemo(
    () => activeDirectory.filter((u) => u.role === 'agent'),
    [activeDirectory]
  );
  const collectorUsers = useMemo(
    () => activeDirectory.filter((u) => u.role === 'collector'),
    [activeDirectory]
  );
  const posterUsers = useMemo(
    () => activeDirectory.filter((u) => u.role === 'poster'),
    [activeDirectory]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    const trimmed = username.trim();
    if (!trimmed || !password) {
      setError('Please enter both your username and password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await loginWithServer(trimmed, password);
      if (!res.ok || !res.user) {
        setError(
          res.error ??
            'Invalid username or password. Please verify your assigned RunBD credentials.'
        );
        return;
      }
      onLogin(res.user);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectUsername = (selectedUsername: string) => {
    setUsername(selectedUsername);
    setPassword('');
    setError('');
    const pwInput = document.getElementById('login-password');
    if (pwInput) pwInput.focus();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top minimal bar */}
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <img
            src="/assets/aistudio/WhatsApp_Image_2026-10-29_at_11.52.03_ee88581e.jpeg"
            alt="RunBD Logo"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700/80 shadow-xs shrink-0"
          />
          <span className="text-lg sm:text-xl font-bold tracking-tight">RunBD</span>
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: Explicit Username & Password Login */}
          <section className="lg:col-span-5 glass-panel rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                RunBD Business Management
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Sign in with your assigned RunBD username and password to access your role-specific
                workspace.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="login-username"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Username / Email
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-username"
                      type="text"
                      autoComplete="username"
                      placeholder="e.g. admin@runbd or tazin@runbd"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3 py-2.5 text-xs text-rose-700 dark:text-rose-300"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer"
                >
                  <span>{submitting ? 'Signing In...' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              Role-Based Access Control enforced. Each agent and team member must authenticate with
              their assigned credentials.
            </div>
          </section>

          {/* Right Column: Authorized Account Directory (fills username only; password required) */}
          <section className="lg:col-span-7 glass-panel rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Authorized RunBD Accounts
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Click an account to fill the username, then enter your assigned password to sign
                    in.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-6">
                {/* Admin Group */}
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Admin / Supervisor — Full Control & Analytics</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {adminUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectUsername(user.email)}
                        className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-emerald-500/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-500/10 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 font-semibold text-xs flex items-center justify-center shrink-0">
                            {user.avatarInitials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {user.name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono">
                              {user.email}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          Use Username
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Call Center Agents Group */}
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2.5">
                    <Headphones className="w-4 h-4 text-sky-500" />
                    <span>Call Center Agents ({agentUsers.length}) — Personal Queue & Follow-ups</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {agentUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectUsername(user.email)}
                        className="text-left flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-sky-500/60 hover:bg-sky-50/40 dark:hover:bg-sky-500/10 transition-colors cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-sky-600/15 text-sky-700 dark:text-sky-300 font-semibold text-xs flex items-center justify-center shrink-0">
                          {user.avatarInitials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {user.name}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
                            {user.email}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Data Collection Team Group */}
                {collectorUsers.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2.5">
                      <Database className="w-4 h-4 text-amber-500" />
                      <span>
                        Data Collection Team ({collectorUsers.length}) — Lead Entry & Duplicate Guard
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {collectorUsers.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => handleSelectUsername(user.email)}
                          className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-amber-500/60 hover:bg-amber-50/40 dark:hover:bg-amber-500/10 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold text-xs flex items-center justify-center shrink-0">
                              {user.avatarInitials}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {user.name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono">
                                {user.email}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
                            Use Username
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Content & Link Poster Group */}
                {posterUsers.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2.5">
                      <Link2 className="w-4 h-4 text-violet-500" />
                      <span>Content &amp; Link Poster — Facebook &amp; Website Post Tracking</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5">
                      {posterUsers.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => handleSelectUsername(user.email)}
                          className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-violet-500/60 hover:bg-violet-50/40 dark:hover:bg-violet-500/10 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-violet-500/15 text-violet-700 dark:text-violet-300 font-semibold text-xs flex items-center justify-center shrink-0">
                              {user.avatarInitials}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {user.name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono">
                                {user.email}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-medium text-violet-600 dark:text-violet-400 whitespace-nowrap">
                            Use Username
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
