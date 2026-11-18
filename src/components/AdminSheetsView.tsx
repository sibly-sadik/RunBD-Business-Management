import React, { useEffect, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  DownloadCloud,
  FileSpreadsheet,
  RefreshCw,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import { GOOGLE_APPS_SCRIPT_CODE } from '../data/seedData';
import { SyncStatus } from '../types';
import { formatDateTime } from '../utils/leadLogic';

interface AdminSheetsViewProps {
  webhookUrl: string;
  defaultWebhookUrl: string;
  lastSyncedAt: string | null;
  syncStatus: SyncStatus;
  onSaveWebhookUrl: (url: string) => void;
  onTestAndSync: (url: string) => Promise<void>;
  onPullLatest: (url: string) => Promise<void>;
}

export function AdminSheetsView({
  webhookUrl,
  defaultWebhookUrl,
  lastSyncedAt,
  syncStatus,
  onSaveWebhookUrl,
  onTestAndSync,
  onPullLatest,
}: AdminSheetsViewProps) {
  const [urlInput, setUrlInput] = useState(webhookUrl);
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pulling, setPulling] = useState(false);

  useEffect(() => {
    setUrlInput(webhookUrl);
  }, [webhookUrl]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveWebhookUrl(urlInput.trim());
  };

  const handleResetDefault = () => {
    setUrlInput(defaultWebhookUrl);
    onSaveWebhookUrl(defaultWebhookUrl);
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await onTestAndSync(urlInput.trim());
    } finally {
      setTesting(false);
    }
  };

  const handlePull = async () => {
    setPulling(true);
    try {
      await onPullLatest(urlInput.trim());
    } finally {
      setPulling(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Google Sheets Real-Time Sync
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Connect a Google Apps Script Web App webhook to mirror leads, call logs, and daily summaries.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setScriptModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap self-start cursor-pointer"
        >
          <Code2 className="w-4 h-4 text-emerald-500" />
          <span>View Code.gs Script</span>
        </button>
      </div>

      {/* Webhook Configuration Card */}
      <section className="glass-panel rounded-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Apps Script Webhook Endpoint
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {lastSyncedAt
                  ? `Last synced: ${formatDateTime(lastSyncedAt)}`
                  : syncStatus === 'synced' || syncStatus === 'syncing'
                  ? 'Connected automatically using the default RunBD Google Sheets webhook.'
                  : 'Currently running in Offline Local Mode (localStorage).'}
              </p>
            </div>
          </div>

          <span
            className={`text-xs font-semibold whitespace-nowrap ${
              syncStatus === 'synced'
                ? 'text-emerald-600 dark:text-emerald-400'
                : syncStatus === 'error'
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {syncStatus === 'synced'
              ? 'Synced'
              : syncStatus === 'syncing'
              ? 'Syncing...'
              : syncStatus === 'error'
              ? 'Sync Error'
              : 'Offline Local Mode'}
          </span>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label
              htmlFor="webhook-url-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Google Apps Script Web App URL
            </label>
            <input
              id="webhook-url-input"
              type="url"
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save URL</span>
            </button>

            <button
              type="button"
              disabled={testing || pulling || !urlInput.trim()}
              onClick={handleTest}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Syncing...' : 'Test & Push Sync'}</span>
            </button>

            <button
              type="button"
              disabled={pulling || testing || !urlInput.trim()}
              onClick={handlePull}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <DownloadCloud className={`w-3.5 h-3.5 ${pulling ? 'animate-pulse' : ''}`} />
              <span>{pulling ? 'Pulling...' : 'Pull Latest Data'}</span>
            </button>

            {urlInput.trim() !== defaultWebhookUrl && (
              <button
                type="button"
                onClick={handleResetDefault}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Default</span>
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Core & Dedicated Agent Tabs Overview */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
            Core Tab 1: Master_Data
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
            Centralized Leads Ledger
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Automatically upserts every lead with normalized phone, collector, assigned agent,
            latest call status, notes, and updated timestamp.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs font-mono font-semibold text-sky-600 dark:text-sky-400">
            Core Tab 2: Agent_Logs
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
            Individual Call Activity
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Appends every individual call status update logged by Tanjin, Kathy, Tania, Shanaz,
            Sizon, or Sakib with follow-up dates and notes.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">
            Core Tab 3: Daily_Summary
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
            Daily Aggregated KPIs
          </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Maintains one live summary row per day with total leads, calls made today, order
            confirmed count, and conversion rate (%).
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs font-mono font-semibold text-violet-600 dark:text-violet-400">
            Core Tab 4: Kawsar_Posts_Log
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
            Facebook &amp; Website Links
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Logs every Facebook and Website link submitted by Kawsar in real time via the{' '}
            <code className="font-mono text-[11px]">KAWSAR_POST_LOGGED</code> webhook event.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
            Core Tab 5: Final_Daily_Summary
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
            Consolidated Team Daily Report
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Upserts one daily executive row combining all 6 agents&apos; calls &amp; orders, Farhan
            &amp; Naim lead counts, and Kawsar&apos;s Facebook &amp; Website links.
          </p>
        </div>
      </section>

      <section className="glass-panel rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Dedicated Per-Agent Tabs (Auto-Synced)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Leads are automatically routed to each agent&apos;s sheet tab and moved automatically on
              manual reassignment.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {['Agent_Tanjin', 'Agent_Kathy', 'Agent_Tania', 'Agent_Shanaz', 'Agent_Sizon', 'Agent_Sakib'].map(
            (tabName) => (
              <div
                key={tabName}
                className="rounded-xl px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800"
              >
                <p className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                  {tabName}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Assigned leads only
                </p>
              </div>
            )
          )}
        </div>
      </section>

      {/* Code.gs Modal */}
      {scriptModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="code-gs-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs"
        >
          <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
              <div>
                <h3
                  id="code-gs-modal-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  Google Apps Script (Code.gs)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Paste into Extensions → Apps Script, deploy as Web App (Anyone), and copy the URL.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy Code.gs'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScriptModalOpen(false)}
                  aria-label="Close Code.gs modal"
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-auto bg-slate-950 text-slate-200">
              <pre className="text-xs font-mono leading-relaxed whitespace-pre">
                <code>{GOOGLE_APPS_SCRIPT_CODE}</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
