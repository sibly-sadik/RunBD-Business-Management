import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Globe,
  Headphones,
  Link2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { User } from '../types';
import {
  buildRoleWelcomeConfig,
  RoleWelcomeContext,
  SocialPlatformKey,
} from '../utils/welcomeLogic';

interface RoleWelcomeBannerProps {
  user: User;
  welcomeKey: number;
  context?: RoleWelcomeContext;
  onDismiss: () => void;
}

const WELCOME_HOLD_MS = 2650;
const WELCOME_EXIT_MS = 260;

function SocialPlatformBadge({
  platform,
  delayMs,
}: {
  platform: SocialPlatformKey;
  delayMs: number;
}) {
  const labels: Record<SocialPlatformKey, string> = {
    facebook: 'Facebook',
    website: 'Website',
    tiktok: 'TikTok',
    instagram: 'Instagram',
    twitter: 'Twitter',
  };

  return (
    <span
      title={labels[platform]}
      style={{ animationDelay: `${delayMs}ms` }}
      className="runbd-icon-pop inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap"
    >
      {platform === 'facebook' && (
        <svg className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.5 1.6-1.5H16.7V5c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1V11H7.6v3h2.7v8h3.2z" />
        </svg>
      )}
      {platform === 'website' && (
        <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
      )}
      {platform === 'tiktok' && (
        <svg className="w-3.5 h-3.5 text-slate-800 dark:text-slate-100 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16.6 5.82s.51.5 0 0A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.43 0-2.59-1.15-2.59-2.59a2.59 2.59 0 0 1 2.59-2.59c.27 0 .53.04.77.12V9.67a5.69 5.69 0 0 0-.77-.05A5.67 5.67 0 0 0 4.18 15.3 5.67 5.67 0 0 0 9.86 21a5.67 5.67 0 0 0 5.68-5.68V9.02a7.35 7.35 0 0 0 4.28 1.37V7.31a4.28 4.28 0 0 1-3.22-1.49z" />
        </svg>
      )}
      {platform === 'instagram' && (
        <svg className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      )}
      {platform === 'twitter' && (
        <svg className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      )}
      <span>{labels[platform]}</span>
    </span>
  );
}

export function RoleWelcomeBanner({
  user,
  welcomeKey,
  context,
  onDismiss,
}: RoleWelcomeBannerProps) {
  const [exiting, setExiting] = useState(false);
  const dismissedRef = useRef(false);
  const exitingRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);

  const handleClose = useCallback(() => {
    if (dismissedRef.current || exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    exitTimerRef.current = window.setTimeout(() => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      onDismiss();
    }, WELCOME_EXIT_MS);
  }, [onDismiss]);

  useEffect(() => {
    dismissedRef.current = false;
    exitingRef.current = false;
    setExiting(false);

    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const holdMs = prefersReduced ? 1600 : WELCOME_HOLD_MS;
    const timer = window.setTimeout(() => {
      handleClose();
    }, holdMs);

    return () => {
      window.clearTimeout(timer);
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, [welcomeKey, handleClose]);

  const config = buildRoleWelcomeConfig(user, context);

  const iconContainerClass: Record<typeof config.accentTone, string> = {
    emerald:
      'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
    teal: 'bg-teal-500/15 text-teal-700 dark:text-teal-400 border border-teal-500/30',
    sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30',
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30',
  };

  const ringClass: Record<typeof config.accentTone, string> = {
    emerald: 'border-emerald-500/40',
    teal: 'border-teal-500/40',
    sky: 'border-sky-500/40',
    amber: 'border-amber-500/40',
  };

  return (
    <div
      data-testid="role-welcome-banner"
      role="status"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100vw-2rem)] max-w-xl pointer-events-none print:hidden"
    >
      <div
        className={`pointer-events-auto rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl ${
          exiting ? 'runbd-welcome-exit' : 'runbd-welcome-enter'
        }`}
      >
        <div className="flex items-start gap-3.5">
          {/* Role-specific animated icon badge */}
          <div className="relative shrink-0 mt-0.5">
            {(config.role === 'admin' || config.role === 'agent') && (
              <span
                aria-hidden="true"
                className={`runbd-ring-expand absolute -inset-1 rounded-xl border ${ringClass[config.accentTone]}`}
              />
            )}
            <div
              className={`runbd-icon-pop w-10 h-10 rounded-xl flex items-center justify-center ${iconContainerClass[config.accentTone]}`}
            >
              {config.role === 'admin' && <ShieldCheck className="w-5 h-5" />}
              {config.role === 'agent' && <Headphones className="w-5 h-5" />}
              {config.role === 'collector' && (
                <div className="relative flex items-center justify-center">
                  <Database className="w-5 h-5" />
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 absolute -right-1.5 -bottom-1 bg-white dark:bg-slate-900 rounded-full" />
                </div>
              )}
              {config.role === 'poster' && <Link2 className="w-5 h-5" />}
            </div>
          </div>

          {/* Personalized Greeting */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
              {config.roleLabel} Workspace
            </p>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug mt-0.5">
              {config.headline}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
              {config.subtitle}
            </p>

            {config.platforms && config.platforms.length > 0 && (
              <div
                data-testid="poster-social-icons"
                aria-label="Supported campaign platforms"
                className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/80"
              >
                {config.platforms.map((platform, idx) => (
                  <SocialPlatformBadge
                    key={platform}
                    platform={platform}
                    delayMs={60 + idx * 65}
                  />
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Dismiss welcome greeting"
            className="p-2 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
