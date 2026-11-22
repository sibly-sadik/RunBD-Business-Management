import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Database,
  Download,
  FileText,
  Globe,
  Headphones,
  Link2,
  PhoneCall,
  Printer,
  Share2,
  X,
} from 'lucide-react';
import { CALL_CENTER_AGENTS, DATA_COLLECTORS } from '../data/seedData';
import { CallLog, ContentPost, Lead } from '../types';
import {
  attemptNativePrint,
  downloadFinalDailySummaryPdf,
} from '../utils/dailySummaryPdf';
import {
  computeFinalDailySummary,
  formatBdPhoneDisplay,
  formatTime,
  generateFinalDailySummaryCsv,
  getLeadCollectedYmd,
  getLocalDateString,
  parseDateToYmd,
} from '../utils/leadLogic';
import { StatusBadge } from './StatusBadge';

interface AdminFinalDailySummaryViewProps {
  leads: Lead[];
  callLogs: CallLog[];
  contentPosts: ContentPost[];
  onDownloadCsv: (filename: string) => void;
}

export function AdminFinalDailySummaryView({
  leads,
  callLogs,
  contentPosts,
  onDownloadCsv,
}: AdminFinalDailySummaryViewProps) {
  const todayStr = getLocalDateString();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printBlockedNotice, setPrintBlockedNotice] = useState(false);
  const isTodaySelected = selectedDate === todayStr;

  useEffect(() => {
    if (!showPrintModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPrintModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showPrintModal]);

  const summary = useMemo(
    () =>
      computeFinalDailySummary(
        CALL_CENTER_AGENTS,
        DATA_COLLECTORS,
        leads,
        callLogs,
        contentPosts,
        selectedDate
      ),
    [leads, callLogs, contentPosts, selectedDate]
  );

  const dateCalls = useMemo(
    () =>
      callLogs
        .filter((c) => parseDateToYmd(c.timestamp) === selectedDate)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [callLogs, selectedDate]
  );

  const dateLeads = useMemo(
    () =>
      leads
        .filter((l) => getLeadCollectedYmd(l) === selectedDate)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [leads, selectedDate]
  );

  const datePosts = useMemo(
    () =>
      contentPosts
        .filter((p) => parseDateToYmd(p.createdAt) === selectedDate)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [contentPosts, selectedDate]
  );

  const handleDownloadCsv = () => {
    const filename = `RunBD_Final_Daily_Summary_${summary.date}.csv`;
    const csv = generateFinalDailySummaryCsv(summary);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    onDownloadCsv(filename);
  };

  const handleDownloadPdf = () => {
    const filename = downloadFinalDailySummaryPdf(
      summary,
      dateCalls,
      dateLeads,
      datePosts
    );
    onDownloadCsv(filename);
  };

  const handlePrint = () => {
    const result = attemptNativePrint(window);
    if (!result.nativePrintTriggered) {
      setPrintBlockedNotice(true);
      setShowPrintModal(true);
    }
  };

  return (
    <div className="space-y-6 print:space-y-4 print-report-root">
      {/* Print-Only Formal Report Header */}
      <div className="hidden print:block border-b-2 border-slate-900 pb-3 mb-2">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              RunBD Business Management — Final Daily Summary
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Today&apos;s Completed Work &amp; Performance Report ({summary.date})
            </p>
          </div>
          <div className="text-right text-xs font-mono text-slate-700">
            <p>Report Date: {summary.date}</p>
            <p>Printed: {new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Screen Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Final Daily Summary ({isTodaySelected ? `Today: ${summary.date}` : summary.date})
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Strictly {isTodaySelected ? "today's" : `${summary.date}'s`} performance and completed
            work across all 6 Call Center Agents, Data Collectors (Farhan &amp; Naim), and Kawsar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="date"
              aria-label="Select summary date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || todayStr)}
              className="text-xs font-mono bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none"
            />
            {!isTodaySelected && (
              <button
                type="button"
                onClick={() => setSelectedDate(todayStr)}
                className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Today
              </button>
            )}
          </div>

          <button
            type="button"
            data-testid="print-final-daily-summary-btn"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>Print Today&apos;s Summary</span>
          </button>

          <button
            type="button"
            data-testid="download-final-daily-summary-btn"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Download Final Daily Summary (CSV)</span>
          </button>
        </div>
      </div>

      {/* Top Executive KPI Cards (Strictly Selected Date / Today Only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 print:grid-cols-4 print:gap-3">
        <div className="glass-panel rounded-2xl p-5 print:p-3 print:rounded-lg print:border print:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Agent Calls ({summary.date})
            </span>
            <PhoneCall className="w-4 h-4 text-sky-500 print:hidden" />
          </div>
          <p
            data-testid="final-summary-total-calls"
            className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400 print:text-2xl print:mt-1"
          >
            {summary.agentTotals.callsMade}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Calls logged on {summary.date}
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5 print:p-3 print:rounded-lg print:border print:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Orders Confirmed
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500 print:hidden" />
          </div>
          <p
            data-testid="final-summary-total-orders"
            className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 print:text-2xl print:mt-1"
          >
            {summary.agentTotals.orderConfirmed}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Confirmed deals on {summary.date}
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5 print:p-3 print:rounded-lg print:border print:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Leads Collected (Farhan + Naim)
            </span>
            <Database className="w-4 h-4 text-amber-500 print:hidden" />
          </div>
          <p
            data-testid="final-summary-total-collected"
            className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 print:text-2xl print:mt-1"
          >
            {summary.totalCollectedOnDate}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Assigned today: {summary.agentTotals.assignedLeads}
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5 print:p-3 print:rounded-lg print:border print:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Kawsar Links Posted
            </span>
            <Link2 className="w-4 h-4 text-violet-500 print:hidden" />
          </div>
          <p
            data-testid="final-summary-kawsar-links"
            className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-violet-600 dark:text-violet-400 print:text-2xl print:mt-1"
          >
            {summary.kawsar.facebookLinks + summary.kawsar.websiteLinks}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summary.kawsar.facebookLinks} FB · {summary.kawsar.websiteLinks} Website
          </p>
        </div>
      </div>

      {/* Section 1: Call Center Agents Performance */}
      <section className="glass-panel rounded-2xl overflow-hidden print:rounded-lg print:border print:border-slate-300 print:break-inside-avoid">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 print:py-2.5 print:px-4">
          <div className="flex items-center gap-2.5">
            <Headphones className="w-4 h-4 text-sky-500 shrink-0 print:hidden" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Call Center Agents Performance ({summary.date})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Leads assigned, calls made &amp; call outcomes recorded strictly on {summary.date}.
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 px-4 font-semibold">Agent</th>
                <th className="py-3 px-4 font-semibold text-right">
                  {isTodaySelected ? 'Assigned Today' : `Assigned (${summary.date})`}
                </th>
                <th className="py-3 px-4 font-semibold text-right">Calls Made</th>
                <th className="py-3 px-4 font-semibold text-right">Order Confirmed</th>
                <th className="py-3 px-4 font-semibold text-right">Interested</th>
                <th className="py-3 px-4 font-semibold text-right">Follow-up</th>
                <th className="py-3 px-4 font-semibold text-right">No Response</th>
                <th className="py-3 px-4 font-semibold text-right">Cancelled</th>
                <th className="py-3 px-4 font-semibold text-right">Done</th>
                <th className="py-3 px-4 font-semibold text-right">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {summary.agents.map((row) => (
                <tr
                  key={row.agentId}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                    {row.agentName}
                  </td>
                  <td
                    data-testid={`agent-assigned-today-${row.agentId}`}
                    className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300"
                  >
                    {row.assignedLeads}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums font-semibold text-sky-600 dark:text-sky-400">
                    {row.callsMade}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                    {row.orderConfirmed}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                    {row.interested}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-amber-600 dark:text-amber-400">
                    {row.followUp}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400">
                    {row.noResponse}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-rose-600 dark:text-rose-400">
                    {row.cancelled}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-teal-600 dark:text-teal-400">
                    {row.done}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {row.pending}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/80 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 font-semibold">
                <td className="py-3 px-4 text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                  TOTAL
                </td>
                <td
                  data-testid="agent-assigned-today-total"
                  className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white"
                >
                  {summary.agentTotals.assignedLeads}
                </td>
                <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-sky-600 dark:text-sky-400">
                  {summary.agentTotals.callsMade}
                </td>
                <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                  {summary.agentTotals.orderConfirmed}
                </td>
                <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white">
                  {summary.agentTotals.interested}
                </td>
                <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-amber-600 dark:text-amber-400">
                  {summary.agentTotals.followUp}
                </td>
                <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400">
                  {summary.agentTotals.noResponse}
                </td>
                <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-rose-600 dark:text-rose-400">
                  {summary.agentTotals.cancelled}
                </td>
                <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-teal-600 dark:text-teal-400">
                  {summary.agentTotals.done}
                </td>
                <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                  {summary.agentTotals.pending}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Section 2 & 3: Data Collectors + Kawsar Content Poster (Selected Date Only) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:grid-cols-12 print:gap-4 print:break-inside-avoid">
        {/* Data Collectors Today */}
        <section className="lg:col-span-6 print:col-span-6 glass-panel rounded-2xl overflow-hidden print:rounded-lg print:border print:border-slate-300">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5 print:py-2.5 print:px-4">
            <Database className="w-4 h-4 text-amber-500 shrink-0 print:hidden" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Data Collectors (Farhan &amp; Naim)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Valid leads collected and entered on {summary.date}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4 font-semibold">Collector</th>
                  <th className="py-3 px-4 font-semibold text-right">
                    Collected ({summary.date})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {summary.collectors.map((c) => (
                  <tr
                    key={c.collectorId}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {c.collectorName}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                      {c.leadsCollectedOnDate}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100/80 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 font-semibold">
                  <td className="py-3 px-4 text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                    TOTAL
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                    {summary.totalCollectedOnDate}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Content & Link Poster (Kawsar) */}
        <section className="lg:col-span-6 print:col-span-6 glass-panel rounded-2xl p-5 sm:p-6 flex flex-col justify-between print:p-4 print:rounded-lg print:border print:border-slate-300">
          <div>
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-200 dark:border-slate-800 print:pb-2.5">
              <Link2 className="w-4 h-4 text-violet-500 shrink-0 print:hidden" />
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Content &amp; Link Poster (Kawsar)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Facebook &amp; Website links submitted on {summary.date}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3.5 print:grid-cols-3 print:mt-3 print:gap-2.5">
              <div className="rounded-xl p-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 print:p-2.5 print-card-surface">
                <span className="text-xs text-slate-500 dark:text-slate-400">Total Entries</span>
                <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white print:text-xl">
                  {summary.kawsar.entriesCount}
                </p>
              </div>

              <div className="rounded-xl p-4 bg-sky-500/5 border border-sky-500/20 print:p-2.5 print-card-surface">
                <div className="flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300 font-medium">
                  <Share2 className="w-3.5 h-3.5 print:hidden" />
                  <span>Facebook Links</span>
                </div>
                <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400 print:text-xl">
                  {summary.kawsar.facebookLinks}
                </p>
              </div>

              <div className="rounded-xl p-4 bg-emerald-500/5 border border-emerald-500/20 print:p-2.5 print-card-surface">
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                  <Globe className="w-3.5 h-3.5 print:hidden" />
                  <span>Website Links</span>
                </div>
                <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 print:text-xl">
                  {summary.kawsar.websiteLinks}
                </p>
              </div>
            </div>
          </div>

          <p className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 print:hidden">
            Consolidated daily metrics sync automatically to the{' '}
            <code className="font-mono text-emerald-600 dark:text-emerald-400">
              Final_Daily_Summary
            </code>{' '}
            tab in Google Sheets.
          </p>
        </section>
      </div>

      {/* Section 4: Today's Work Breakdown (Strictly Selected Date / Today Actions for Screen & Print) */}
      <section
        data-testid="final-summary-today-activity"
        className="glass-panel rounded-2xl overflow-hidden print:rounded-lg print:border print:border-slate-300"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 print:py-2.5 print:px-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {isTodaySelected ? "Today's Work Activity" : `Work Activity on ${summary.date}`} (
            {summary.date})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Only calls logged, leads collected, and links posted on {summary.date} are listed and
            printed below.
          </p>
        </div>

        <div className="p-5 space-y-6 print:p-4 print:space-y-4">
          {/* Today's Calls Logged */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
              Calls Logged on {summary.date} ({dateCalls.length})
            </h3>
            {dateCalls.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No calls logged on {summary.date}.
              </p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl print:rounded-md">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2 px-3 font-semibold">Time</th>
                      <th className="py-2 px-3 font-semibold">Agent</th>
                      <th className="py-2 px-3 font-semibold">Customer</th>
                      <th className="py-2 px-3 font-semibold">Phone</th>
                      <th className="py-2 px-3 font-semibold">Status</th>
                      <th className="py-2 px-3 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {dateCalls.map((call) => (
                      <tr key={call.id}>
                        <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">
                          {formatTime(call.timestamp)}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {call.agentName}
                        </td>
                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200">
                          {call.customerName}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatBdPhoneDisplay(call.phone)}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <StatusBadge status={call.newStatus} />
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                          {call.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Today's Leads Collected */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
              Leads Collected on {summary.date} ({dateLeads.length})
            </h3>
            {dateLeads.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No leads collected on {summary.date}.
              </p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl print:rounded-md">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2 px-3 font-semibold">Time</th>
                      <th className="py-2 px-3 font-semibold">Collector</th>
                      <th className="py-2 px-3 font-semibold">Customer</th>
                      <th className="py-2 px-3 font-semibold">Phone</th>
                      <th className="py-2 px-3 font-semibold">Assigned Agent</th>
                      <th className="py-2 px-3 font-semibold">Current Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {dateLeads.map((lead) => (
                      <tr key={lead.id}>
                        <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">
                          {formatTime(lead.createdAt) || summary.date}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {lead.collectorName}
                        </td>
                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200">
                          {lead.customerName}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatBdPhoneDisplay(lead.phone)}
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {lead.assignedAgentName ?? 'Unassigned'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <StatusBadge status={lead.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Today's Kawsar Links Posted */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
              Kawsar Links Posted on {summary.date} ({datePosts.length})
            </h3>
            {datePosts.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No links posted on {summary.date}.
              </p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl print:rounded-md">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2 px-3 font-semibold">Time</th>
                      <th className="py-2 px-3 font-semibold">Title / Note</th>
                      <th className="py-2 px-3 font-semibold">Facebook Link</th>
                      <th className="py-2 px-3 font-semibold">Website Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {datePosts.map((post) => (
                      <tr key={post.id}>
                        <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">
                          {formatTime(post.createdAt)}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                          {post.note || 'Post Entry'}
                        </td>
                        <td className="py-2 px-3 font-mono text-sky-600 dark:text-sky-400 break-all">
                          {post.facebookLink || '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-emerald-600 dark:text-emerald-400 break-all">
                          {post.websiteLink || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Print Preview & Printable PDF Modal (Automatically shown when embedded iframe blocks window.print()) */}
      {showPrintModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Printable Final Daily Summary for ${summary.date}`}
          data-testid="print-summary-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs print:hidden"
        >
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white text-slate-900 border border-slate-200 shadow-2xl overflow-hidden">
            {/* Modal Toolbar */}
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Print &amp; PDF Report — {summary.date}
                </h3>
                {printBlockedNotice && (
                  <p className="text-xs text-amber-700 mt-0.5">
                    Browser preview iframe restricts direct Print dialog — download the formatted
                    printable PDF below or press <kbd className="px-1 py-0.5 rounded bg-slate-200 font-mono text-[10px]">Ctrl+P</kbd>.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="download-final-daily-pdf-btn"
                  onClick={handleDownloadPdf}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span>Download Printable PDF</span>
                </button>
                <button
                  type="button"
                  data-testid="retry-browser-print-btn"
                  onClick={() => {
                    try {
                      window.print();
                    } catch {
                      // ignore
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Browser Print</span>
                </button>
                <button
                  type="button"
                  data-testid="close-print-modal-btn"
                  onClick={() => setShowPrintModal(false)}
                  aria-label="Close print preview"
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* White-Paper Report Preview Body (Today-Only Scope) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-white text-slate-900">
              <div className="flex items-baseline justify-between border-b-2 border-slate-900 pb-3">
                <div>
                  <h4 className="text-lg font-bold text-slate-900">
                    RunBD Business Management — Final Daily Summary
                  </h4>
                  <p className="text-xs text-slate-600">
                    Today&apos;s Completed Work &amp; Performance Report ({summary.date})
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-600">Date: {summary.date}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-slate-300 p-3 bg-slate-50">
                  <p className="text-[11px] text-slate-600">Total Agent Calls</p>
                  <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                    {summary.agentTotals.callsMade}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-300 p-3 bg-slate-50">
                  <p className="text-[11px] text-slate-600">Orders Confirmed</p>
                  <p className="text-xl font-bold font-mono text-emerald-700 mt-1">
                    {summary.agentTotals.orderConfirmed}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-300 p-3 bg-slate-50">
                  <p className="text-[11px] text-slate-600">Leads Collected</p>
                  <p className="text-xl font-bold font-mono text-amber-700 mt-1">
                    {summary.totalCollectedOnDate}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-300 p-3 bg-slate-50">
                  <p className="text-[11px] text-slate-600">Kawsar Links</p>
                  <p className="text-xl font-bold font-mono text-violet-700 mt-1">
                    {summary.kawsar.facebookLinks + summary.kawsar.websiteLinks}
                  </p>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Call Center Agents ({summary.date})
                </h5>
                <div className="overflow-x-auto border border-slate-300 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                        <th className="py-2 px-3">Agent</th>
                        <th className="py-2 px-3 text-right">Assigned</th>
                        <th className="py-2 px-3 text-right">Calls</th>
                        <th className="py-2 px-3 text-right">Confirmed</th>
                        <th className="py-2 px-3 text-right">Interested</th>
                        <th className="py-2 px-3 text-right">Follow-up</th>
                        <th className="py-2 px-3 text-right">No Resp</th>
                        <th className="py-2 px-3 text-right">Cancelled</th>
                        <th className="py-2 px-3 text-right">Done</th>
                        <th className="py-2 px-3 text-right">Pending</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {summary.agents.map((row) => (
                        <tr key={row.agentId}>
                          <td className="py-1.5 px-3 font-semibold">{row.agentName}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{row.assignedLeads}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{row.callsMade}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{row.orderConfirmed}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{row.interested}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{row.followUp}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{row.noResponse}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{row.cancelled}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{row.done}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{row.pending}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-200/80 border-t border-slate-300 font-bold">
                        <td className="py-2 px-3">TOTAL</td>
                        <td className="py-2 px-3 text-right font-mono">{summary.agentTotals.assignedLeads}</td>
                        <td className="py-2 px-3 text-right font-mono">{summary.agentTotals.callsMade}</td>
                        <td className="py-2 px-3 text-right font-mono">{summary.agentTotals.orderConfirmed}</td>
                        <td className="py-2 px-3 text-right font-mono">{summary.agentTotals.interested}</td>
                        <td className="py-2 px-3 text-right font-mono">{summary.agentTotals.followUp}</td>
                        <td className="py-2 px-3 text-right font-mono">{summary.agentTotals.noResponse}</td>
                        <td className="py-2 px-3 text-right font-mono">{summary.agentTotals.cancelled}</td>
                        <td className="py-2 px-3 text-right font-mono">{summary.agentTotals.done}</td>
                        <td className="py-2 px-3 text-right font-mono">{summary.agentTotals.pending}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-slate-300 rounded-lg overflow-hidden">
                  <div className="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800 border-b border-slate-300">
                    Data Collectors ({summary.date})
                  </div>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-200">
                      {summary.collectors.map((c) => (
                        <tr key={c.collectorId}>
                          <td className="py-1.5 px-3 font-medium">{c.collectorName}</td>
                          <td className="py-1.5 px-3 text-right font-mono font-bold">
                            {c.leadsCollectedOnDate}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-200/70 font-bold">
                        <td className="py-1.5 px-3">TOTAL</td>
                        <td className="py-1.5 px-3 text-right font-mono">
                          {summary.totalCollectedOnDate}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="border border-slate-300 rounded-lg overflow-hidden">
                  <div className="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800 border-b border-slate-300">
                    Content &amp; Link Poster — Kawsar ({summary.date})
                  </div>
                  <div className="p-3 grid grid-cols-3 gap-2 text-center">
                    <div className="border border-slate-200 rounded p-2">
                      <p className="text-[11px] text-slate-600">Entries</p>
                      <p className="text-base font-bold font-mono">{summary.kawsar.entriesCount}</p>
                    </div>
                    <div className="border border-slate-200 rounded p-2">
                      <p className="text-[11px] text-slate-600">Facebook</p>
                      <p className="text-base font-bold font-mono">{summary.kawsar.facebookLinks}</p>
                    </div>
                    <div className="border border-slate-200 rounded p-2">
                      <p className="text-[11px] text-slate-600">Website</p>
                      <p className="text-base font-bold font-mono">{summary.kawsar.websiteLinks}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-700 space-y-2">
                <h5 className="font-bold uppercase tracking-wider">
                  Work Completed on {summary.date}
                </h5>
                <p>
                  Calls Logged: <strong>{dateCalls.length}</strong> · Leads Collected:{' '}
                  <strong>{dateLeads.length}</strong> · Kawsar Links:{' '}
                  <strong>{datePosts.length}</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
