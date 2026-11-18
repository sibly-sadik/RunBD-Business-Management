import { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Database,
  Download,
  Globe,
  Headphones,
  Link2,
  PhoneCall,
  Share2,
} from 'lucide-react';
import { CALL_CENTER_AGENTS, DATA_COLLECTORS } from '../data/seedData';
import { CallLog, ContentPost, Lead } from '../types';
import {
  computeFinalDailySummary,
  generateFinalDailySummaryCsv,
  getLocalDateString,
} from '../utils/leadLogic';

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

  const totalCollectorsAllTime = summary.collectors.reduce(
    (sum, c) => sum + c.totalLeadsAllTime,
    0
  );

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Final Daily Summary
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Consolidated daily performance across all 6 Call Center Agents, Data Collectors (Farhan
            &amp; Naim), and Content Poster (Kawsar).
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
            {selectedDate !== todayStr && (
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
            data-testid="download-final-daily-summary-btn"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Download Final Daily Summary (CSV)</span>
          </button>
        </div>
      </div>

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Agent Calls ({summary.date})
            </span>
            <PhoneCall className="w-4 h-4 text-sky-500" />
          </div>
          <p
            data-testid="final-summary-total-calls"
            className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400"
          >
            {summary.agentTotals.callsMade}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Across 6 call center agents
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Orders Confirmed
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p
            data-testid="final-summary-total-orders"
            className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400"
          >
            {summary.agentTotals.orderConfirmed}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Confirmed deals on {summary.date}
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Leads Collected (Farhan + Naim)
            </span>
            <Database className="w-4 h-4 text-amber-500" />
          </div>
          <p
            data-testid="final-summary-total-collected"
            className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400"
          >
            {summary.totalCollectedOnDate}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {totalCollectorsAllTime} total leads all time
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Kawsar Links Posted
            </span>
            <Link2 className="w-4 h-4 text-violet-500" />
          </div>
          <p
            data-testid="final-summary-kawsar-links"
            className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-violet-600 dark:text-violet-400"
          >
            {summary.kawsar.facebookLinks + summary.kawsar.websiteLinks}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summary.kawsar.facebookLinks} FB · {summary.kawsar.websiteLinks} Website
          </p>
        </div>
      </div>

      {/* Section 1: Call Center Agents Performance */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Headphones className="w-4 h-4 text-sky-500 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Call Center Agents Performance (6 Agents)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Assigned leads, calls made &amp; orders confirmed on {summary.date}, plus current
                lead status breakdown.
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 px-4 font-semibold">Agent</th>
                <th className="py-3 px-4 font-semibold text-right">Assigned Leads</th>
                <th className="py-3 px-4 font-semibold text-right">Calls Made</th>
                <th className="py-3 px-4 font-semibold text-right">Order Confirmed</th>
                <th className="py-3 px-4 font-semibold text-right">Interested</th>
                <th className="py-3 px-4 font-semibold text-right">Follow-up</th>
                <th className="py-3 px-4 font-semibold text-right">No Response</th>
                <th className="py-3 px-4 font-semibold text-right">Cancelled</th>
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
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
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
                <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white">
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
                <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                  {summary.agentTotals.pending}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Section 2 & 3: Data Collectors + Kawsar Content Poster */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Data Collectors History */}
        <section className="lg:col-span-6 glass-panel rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
            <Database className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Data Collectors History (Farhan &amp; Naim)
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
                  <th className="py-3 px-4 font-semibold text-right">All-Time Total</th>
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
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {c.totalLeadsAllTime}
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
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white">
                    {totalCollectorsAllTime}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Content & Link Poster (Kawsar) */}
        <section className="lg:col-span-6 glass-panel rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-200 dark:border-slate-800">
              <Link2 className="w-4 h-4 text-violet-500 shrink-0" />
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Content &amp; Link Poster (Kawsar)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Facebook &amp; Website links submitted on {summary.date}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="rounded-xl p-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400">Total Entries</span>
                <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {summary.kawsar.entriesCount}
                </p>
              </div>

              <div className="rounded-xl p-4 bg-sky-500/5 border border-sky-500/20">
                <div className="flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300 font-medium">
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Facebook Links</span>
                </div>
                <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
                  {summary.kawsar.facebookLinks}
                </p>
              </div>

              <div className="rounded-xl p-4 bg-emerald-500/5 border border-emerald-500/20">
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Website Links</span>
                </div>
                <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {summary.kawsar.websiteLinks}
                </p>
              </div>
            </div>
          </div>

          <p className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            Consolidated daily metrics sync automatically to the{' '}
            <code className="font-mono text-emerald-600 dark:text-emerald-400">
              Final_Daily_Summary
            </code>{' '}
            tab in Google Sheets.
          </p>
        </section>
      </div>
    </div>
  );
}
