import { useCallback, useEffect, useRef, useState } from 'react';

interface StartupSplashProps {
  onComplete: () => void;
}

const SPLASH_HOLD_MS = 1180;
const SPLASH_EXIT_MS = 260;

export function StartupSplash({ onComplete }: StartupSplashProps) {
  const [exiting, setExiting] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const completedRef = useRef(false);
  const exitingRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);

  const triggerExit = useCallback(() => {
    if (completedRef.current || exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    exitTimerRef.current = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    }, SPLASH_EXIT_MS);
  }, [onComplete]);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const holdMs = prefersReduced ? 350 : SPLASH_HOLD_MS;
    const timer = window.setTimeout(() => {
      triggerExit();
    }, holdMs);

    return () => {
      window.clearTimeout(timer);
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, [triggerExit]);

  return (
    <div
      data-testid="startup-splash"
      role="status"
      aria-live="polite"
      aria-label="RunBD Business Management loading"
      className={`fixed inset-0 z-[70] flex flex-col items-center justify-center px-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none overflow-hidden ${
        exiting ? 'runbd-splash-exit pointer-events-none' : ''
      }`}
    >
      {/* Subtle radial atmosphere matching RunBD emerald/slate palette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.10)_0%,transparent_62%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.14)_0%,transparent_60%)]"
      />

      <div className="relative flex flex-col items-center text-center max-w-sm w-full">
        <div className="runbd-splash-logo relative mb-5">
          <div
            aria-hidden="true"
            className="runbd-ring-expand absolute -inset-2.5 rounded-3xl border border-emerald-500/35"
          />
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg flex items-center justify-center">
            {!imgFailed ? (
              <img
                src="/assets/aistudio/WhatsApp_Image_2026-10-29_at_11.52.03_ee88581e.jpeg"
                alt="RunBD Logo"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                RB
              </span>
            )}
          </div>
        </div>

        <div className="runbd-splash-text space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            RunBD
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
            Business Management &amp; Operations Suite
          </p>
        </div>

        <div
          aria-hidden="true"
          className="mt-6 w-44 sm:w-52 h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
        >
          <div className="runbd-splash-progress h-full w-full rounded-full bg-emerald-600 dark:bg-emerald-500" />
        </div>

        <button
          type="button"
          onClick={triggerExit}
          aria-label="Skip startup animation"
          className="mt-6 px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/70 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          Skip intro
        </button>
      </div>
    </div>
  );
}
