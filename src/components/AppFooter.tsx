export function AppFooter() {
  return (
    <footer className="w-full border-t border-slate-200/80 dark:border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500 dark:text-slate-400 shrink-0">
      <span>Developed by </span>
      <a
        href="https://siblysadik-dev.vercel.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 underline-offset-4 hover:underline transition-colors"
      >
        Shimul.Dev
      </a>
    </footer>
  );
}
