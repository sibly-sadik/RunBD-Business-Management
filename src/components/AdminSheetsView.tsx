import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  DownloadCloud,
  FileSpreadsheet,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import supabaseSchemaSql from '../../supabase/schema.sql?raw';
import { GOOGLE_APPS_SCRIPT_CODE } from '../data/seedData';
import { SyncStatus, User } from '../types';
import { formatDateTime } from '../utils/leadLogic';
import {
  getAgentTabName,
  getCollectorTabName,
  getPaidAgentTabName,
  SheetDuplicateReport,
} from '../utils/sheetsSync';

interface AdminSheetsViewProps {
  agents?: User[];
  collectors?: User[];
  webhookUrl: string;
  defaultWebhookUrl: string;
  lastSyncedAt: string | null;
  syncStatus: SyncStatus;
  sheetDuplicateReport: SheetDuplicateReport;
  onSaveWebhookUrl: (url: string) => void;
  onTestAndSync: (url: string) => Promise<void>;
  onPullLatest: (url: string) => Promise<void>;
  onClearCacheAndSyncToday: (url: string) => Promise<void>;
}

const DEFAULT_AGENT_NAMES = ['Tanjin', 'Kathy', 'Tania', 'Shanaz', 'Sizon', 'Sakib'];
const DEFAULT_COLLECTOR_NAMES = ['Farhan', 'Naim'];

export function AdminSheetsView({
  agents,
  collectors,
  webhookUrl,
  defaultWebhookUrl,
  lastSyncedAt,
  syncStatus,
  sheetDuplicateReport,
  onSaveWebhookUrl,
  onTestAndSync,
  onPullLatest,
  onClearCacheAndSyncToday,
}: AdminSheetsViewProps) {
  const [urlInput, setUrlInput] = useState(webhookUrl);
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

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

  const handleClearCacheAndSyncToday = async () => {
    setClearingCache(true);
    try {
      await onClearCacheAndSyncToday(urlInput.trim());
    } finally {
      setClearingCache(false);
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

  const handleCopySupabaseSql = async () => {
    try {
      await navigator.clipboard.writeText(supabaseSchemaSql);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      setSqlModalOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Google Sheets Sync &amp; Database Settings
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Supabase PostgreSQL primary storage with real-time Google Apps Script two-way sync.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start shrink-0">
          <button
            type="button"
            data-testid="copy-supabase-sql-btn"
            onClick={handleCopySupabaseSql}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-xs font-semibold text-sky-700 dark:text-sky-300 transition-colors whitespace-nowrap cursor-pointer"
          >
            {copiedSql ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Database className="w-3.5 h-3.5 text-sky-500" />
            )}
            <span>{copiedSql ? 'Copied Supabase SQL' : 'Copy Supabase SQL'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSqlModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5 text-sky-500" />
            <span>View SQL</span>
          </button>

          <button
            type="button"
            data-testid="copy-code-gs-btn"
            onClick={handleCopyCode}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition-colors whitespace-nowrap cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-emerald-500" />
            )}
            <span>{copied ? 'Copied Code.gs' : 'Copy Code.gs'}</span>
          </button>

          <button
            type="button"
            onClick={() => setScriptModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>View Code.gs Script</span>
          </button>
        </div>
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
              placeholder={defaultWebhookUrl}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            />
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 break-all">
              Default RunBD Web App URL:{' '}
              <code
                data-testid="default-webhook-url"
                className="font-mono text-slate-700 dark:text-slate-300"
              >
                {defaultWebhookUrl}
              </code>
            </p>
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
              disabled={testing || pulling || clearingCache || !urlInput.trim()}
              onClick={handleTest}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Syncing...' : 'Test & Push Sync'}</span>
            </button>

            <button
              type="button"
              disabled={pulling || testing || clearingCache || !urlInput.trim()}
              onClick={handlePull}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <DownloadCloud className={`w-3.5 h-3.5 ${pulling ? 'animate-pulse' : ''}`} />
              <span>{pulling ? 'Syncing...' : 'Pull Today + Paid Customers'}</span>
            </button>

            <button
              type="button"
              data-testid="clear-cache-sync-today-btn"
              disabled={clearingCache || pulling || testing || !urlInput.trim()}
              onClick={handleClearCacheAndSyncToday}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 text-amber-700 dark:text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                {clearingCache ? 'Clearing & Syncing...' : 'Clear Local Cache & Sync Today'}
              </span>
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

      {/* Sheet Duplicate Audit (Master_Data & Kawsar_Posts_Log) */}
      <section
        data-testid="sheet-duplicate-report"
        className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            {sheetDuplicateReport.leadDuplicates.length +
              sheetDuplicateReport.postDuplicates.length >
            0 ? (
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            )}
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Sheet Duplicate Check (Master_Data &amp; Kawsar_Posts_Log)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Last checked {formatDateTime(sheetDuplicateReport.checkedAt)}
              </p>
            </div>
          </div>

          <span
            className={`text-xs font-semibold whitespace-nowrap ${
              sheetDuplicateReport.leadDuplicates.length +
                sheetDuplicateReport.postDuplicates.length >
              0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {sheetDuplicateReport.leadDuplicates.length +
              sheetDuplicateReport.postDuplicates.length >
            0
              ? `${
                  sheetDuplicateReport.leadDuplicates.length +
                  sheetDuplicateReport.postDuplicates.length
                } Flagged Entry(s)`
              : '0 Duplicates Flagged'}
          </span>
        </div>

        {sheetDuplicateReport.leadDuplicates.length === 0 &&
        sheetDuplicateReport.postDuplicates.length === 0 ? (
          <p className="text-xs text-slate-600 dark:text-slate-300">
            All synced phone numbers, Facebook profile URLs, and Kawsar post links are unique across
            active records.
          </p>
        ) : (
          <div className="space-y-4">
            {sheetDuplicateReport.leadDuplicates.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  Flagged Lead Duplicates in Master_Data ({sheetDuplicateReport.leadDuplicates.length})
                </h3>
                <div className="overflow-x-auto rounded-xl border border-amber-300/60 dark:border-amber-500/30">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-amber-50/80 dark:bg-amber-500/10 text-slate-600 dark:text-slate-300 border-b border-amber-200/70 dark:border-amber-500/20">
                        <th className="py-2 px-3 font-semibold">Match</th>
                        <th className="py-2 px-3 font-semibold">Customer Name</th>
                        <th className="py-2 px-3 font-semibold">Phone / Link</th>
                        <th className="py-2 px-3 font-semibold">Assigned Agent</th>
                        <th className="py-2 px-3 font-semibold">Status</th>
                        <th className="py-2 px-3 font-semibold">Collector</th>
                        <th className="py-2 px-3 font-semibold">IDs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {sheetDuplicateReport.leadDuplicates.map((flag, i) => (
                        <tr key={`${flag.duplicateLeadId}-${flag.matchedBy}-${i}`}>
                          <td className="py-2 px-3 font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap">
                            {flag.matchedBy === 'phone' ? 'Phone' : 'Facebook URL'}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                            {flag.customerName}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300">
                            {flag.matchedBy === 'phone' ? flag.phone : flag.facebookLink}
                          </td>
                          <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                            {flag.assignedAgentName ?? 'Unassigned'}
                          </td>
                          <td className="py-2 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {flag.status}
                          </td>
                          <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                            {flag.collectorName}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {flag.duplicateLeadId} (orig: {flag.originalLeadId})
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {sheetDuplicateReport.postDuplicates.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  Flagged Link Duplicates in Kawsar_Posts_Log ({sheetDuplicateReport.postDuplicates.length})
                </h3>
                <div className="overflow-x-auto rounded-xl border border-amber-300/60 dark:border-amber-500/30">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-amber-50/80 dark:bg-amber-500/10 text-slate-600 dark:text-slate-300 border-b border-amber-200/70 dark:border-amber-500/20">
                        <th className="py-2 px-3 font-semibold">Field</th>
                        <th className="py-2 px-3 font-semibold">Duplicate URL</th>
                        <th className="py-2 px-3 font-semibold">Poster</th>
                        <th className="py-2 px-3 font-semibold">Note</th>
                        <th className="py-2 px-3 font-semibold">IDs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {sheetDuplicateReport.postDuplicates.map((flag, i) => (
                        <tr key={`${flag.duplicatePostId}-${flag.matchedField}-${i}`}>
                          <td className="py-2 px-3 font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap">
                            {flag.matchedField}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300 break-all">
                            {flag.url}
                          </td>
                          <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                            {flag.posterName}
                          </td>
                          <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                            {flag.note || '—'}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {flag.duplicatePostId} (orig: {flag.originalPostId})
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
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
            Upserts one daily executive row combining all 6 agents&apos; calls &amp; orders, Data
            Collectors (Farhan, Naim &amp; Kawsar) lead counts, and content post link totals.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">
            Core Tab 6: Paid_Customers
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
            1-Month Renewals (Two-Way)
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Auto-syncs Order Confirmed customers with 30-day renewal dates and pulls manual sheet
            status or renewal edits back into the app.
          </p>
        </div>
      </section>

      <section className="glass-panel rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Dedicated Per-Collector Tabs (Auto-Synced)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Each Data Collector&apos;s collected &amp; imported leads are automatically upserted into their own dedicated tab (including newly added collectors from Team Management).
            </p>
          </div>
        </div>
        <div
          data-testid="dedicated-collector-tabs-grid"
          className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
        >
          {(collectors && collectors.length > 0
            ? collectors.map((c) => c.name)
            : DEFAULT_COLLECTOR_NAMES
          ).map((name) => {
            const tabName = getCollectorTabName(name);
            return (
              <div
                key={tabName}
                className="rounded-xl px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800"
              >
                <p className="text-xs font-mono font-semibold text-amber-700 dark:text-amber-400 truncate">
                  {tabName}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {name}&apos;s collected leads
                </p>
              </div>
            );
          })}
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
        <div
          data-testid="dedicated-agent-tabs-grid"
          className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
        >
          {(agents && agents.length > 0
            ? agents.map((a) => a.name)
            : DEFAULT_AGENT_NAMES
          ).map((name) => {
            const tabName = getAgentTabName(name);
            return (
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
            );
          })}
        </div>
      </section>

      <section className="glass-panel rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Dedicated Per-Agent Paid Tabs (Auto-Synced)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Order Confirmed leads are automatically provisioned and upserted into each
              agent&apos;s <code className="font-mono text-[11px]">Paid_&lt;AgentName&gt;</code>{' '}
              sheet tab with Facebook links, collector details, package info, and phone deduplication.
            </p>
          </div>
        </div>
        <div
          data-testid="dedicated-paid-agent-tabs-grid"
          className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
        >
          {(agents && agents.length > 0
            ? agents.map((a) => a.name)
            : DEFAULT_AGENT_NAMES
          ).map((name) => {
            const tabName = getPaidAgentTabName(name);
            return (
              <div
                key={tabName}
                className="rounded-xl px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800"
              >
                <p className="text-xs font-mono font-semibold text-sky-700 dark:text-sky-400 truncate">
                  {tabName}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {name}&apos;s paid orders
                </p>
              </div>
            );
          })}
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

      {/* Supabase SQL Schema Modal */}
      {sqlModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="supabase-sql-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs"
        >
          <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
              <div>
                <h3
                  id="supabase-sql-modal-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  Supabase PostgreSQL Schema (supabase/schema.sql)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Run in Supabase Dashboard → SQL Editor to provision all indexed tables.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySupabaseSql}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Copied SQL' : 'Copy Supabase SQL'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSqlModalOpen(false)}
                  aria-label="Close Supabase SQL modal"
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-auto bg-slate-950 text-slate-200">
              <pre className="text-xs font-mono leading-relaxed whitespace-pre">
                <code>{supabaseSchemaSql}</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
