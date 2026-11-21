import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  PhoneCall,
  TrendingUp,
} from 'lucide-react';
import { CALL_CENTER_AGENTS, DATA_COLLECTORS } from '../data/seedData';
import {
  CallLog,
  CallStatus,
  ContentPost,
  DateRangeFilter,
  DateRangePreset,
  DuplicateAttempt,
  Lead,
} from '../types';
import {
  computeAgentPerformance,
  computeCollectorStats,
  computeDashboardMetrics,
  DueRenewalItem,
  generateDailyReportCsv,
  isWithinDateRange,
} from '../utils/leadLogic';
import { AdminAgentDetailSection } from './AdminAgentDetailSection';
import { KawsarPostsView } from './KawsarPostsView';
import { RenewalAlertBanner } from './RenewalAlertBanner';

interface AdminDashboardViewProps {
  leads: Lead[];
  callLogs: CallLog[];
  duplicateAttempts: DuplicateAttempt[];
  contentPosts: ContentPost[];
  dueRenewals: DueRenewalItem[];
  onMarkPaidCustomerRenewed: (customerId: string) => void;
  onOpenPaidCustomers: () => void;
  onDownloadDailyReport: (filename: string) => void;
}

const DONUT_COLORS: Record<CallStatus, string> = {
  'Order Confirmed': '#10b981', // emerald-500
  Interested: '#0ea5e9', // sky-500
  'Busy / Call Later': '#f59e0b', // amber-500
  Pending: '#64748b', // slate-500
  'Switched Off / No Answer': '#f97316', // orange-500
  'Not Interested': '#f43f5e', // rose-500
  'Wrong Number': '#ef4444', // red-500
};

export function AdminDashboardView({
  leads,
  callLogs,
  duplicateAttempts,
  contentPosts,
  dueRenewals,
  onMarkPaidCustomerRenewed,
  onOpenPaidCustomers,
  onDownloadDailyReport,
}: AdminDashboardViewProps) {
  const [selectedAgentTab, setSelectedAgentTab] = useState<string>('overview');
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>({
    preset: 'all',
    startDate: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
  });

  const activeAgent = useMemo(
    () => CALL_CENTER_AGENTS.find((a) => a.id === selectedAgentTab) ?? null,
    [selectedAgentTab]
  );

  const handleDownloadDailyReport = () => {
    const today = new Date();
    const dateStamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(today.getDate()).padStart(2, '0')}`;
    const filename = `runbd_daily_report_${dateStamp}.csv`;
    const csv = generateDailyReportCsv(CALL_CENTER_AGENTS, leads, callLogs, today);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    onDownloadDailyReport(filename);
  };

  const metrics = useMemo(
    () => computeDashboardMetrics(leads, callLogs, dateFilter),
    [leads, callLogs, dateFilter]
  );

  const agentPerf = useMemo(
    () => computeAgentPerformance(CALL_CENTER_AGENTS, leads, callLogs, dateFilter),
    [leads, callLogs, dateFilter]
  );

  const collectorStats = useMemo(
    () => computeCollectorStats(DATA_COLLECTORS, leads, duplicateAttempts),
    [leads, duplicateAttempts]
  );

  const statusBreakdown = useMemo(() => {
    const filtered = leads.filter((l) => isWithinDateRange(l.createdAt, dateFilter));
    const counts = new Map<CallStatus, number>();
    for (const l of filtered) {
      counts.set(l.status, (counts.get(l.status) ?? 0) + 1);
    }
    const total = filtered.length || 1;
    return Array.from(counts.entries())
      .map(([status, count]) => ({
        status,
        count,
        pct: Math.round((count / total) * 100),
        color: DONUT_COLORS[status],
      }))
      .sort((a, b) => b.count - a.count);
  }, [leads, dateFilter]);

  const maxBarValue = useMemo(() => {
    const vals = agentPerf.flatMap((a) => [a.totalCalls, a.conversions, a.assignedLeads]);
    return Math.max(4, ...vals);
  }, [agentPerf]);

  const presets: { id: DateRangePreset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'all', label: 'All Time' },
    { id: 'custom', label: 'Custom Date' },
  ];

  // Build SVG Donut segments
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <div className="space-y-6">
      {/* 2-Day Advance Renewal Notification Banner */}
      <RenewalAlertBanner
        dueItems={dueRenewals}
        audience="admin"
        onMarkRenewed={onMarkPaidCustomerRenewed}
        onViewAllPaidCustomers={onOpenPaidCustomers}
      />

      {/* Header & Date Filter Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {activeAgent ? `${activeAgent.name} — Agent Workspace Overview` : 'Operations Analytics & Performance'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {activeAgent
              ? `Dedicated view of ${activeAgent.name}'s assigned leads, follow-ups, metrics, and call log history.`
              : 'Real-time call center KPIs, 6-agent leaderboard, data collection, and Kawsar link posts.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadDailyReport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Download Daily Report (CSV/Excel)</span>
          </button>

          <div
            role="group"
            aria-label="Date range filter"
            className="inline-flex flex-wrap p-1 rounded-lg bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDateFilter((prev) => ({ ...prev, preset: p.id }))}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  dateFilter.preset === p.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {dateFilter.preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="Start date"
                value={dateFilter.startDate}
                onChange={(e) =>
                  setDateFilter((prev) => ({ ...prev, startDate: e.target.value }))
                }
                className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                aria-label="End date"
                value={dateFilter.endDate}
                onChange={(e) =>
                  setDateFilter((prev) => ({ ...prev, endDate: e.target.value }))
                }
                className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
          )}
        </div>
      </div>

      {/* Dedicated Agent Tab Switcher: [Overview] [Tanjin] [Kathy] [Tania] [Shanaz] [Sizon] [Sakib] */}
      <div
        role="tablist"
        aria-label="Dashboard agent tabs"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-800"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedAgentTab === 'overview'}
          onClick={() => setSelectedAgentTab('overview')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            selectedAgentTab === 'overview'
              ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-500/8'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
          }`}
        >
          Overview
        </button>

        {CALL_CENTER_AGENTS.map((agent) => {
          const count = leads.filter((l) => l.assignedAgentId === agent.id).length;
          const isSelected = selectedAgentTab === agent.id;
          return (
            <button
              key={agent.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedAgentTab(agent.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isSelected
                  ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-500/8'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
              }`}
            >
              <span>{agent.name}</span>
              <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {activeAgent ? (
        <AdminAgentDetailSection
          agent={activeAgent}
          leads={leads}
          callLogs={callLogs}
          dateFilter={dateFilter}
        />
      ) : (
        <>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Leads Collected
            </span>
            <Database className="w-4 h-4 text-slate-400" />
          </div>
          <p className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {metrics.totalLeads}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {metrics.interestedCount} currently interested
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Calls Made Today
            </span>
            <PhoneCall className="w-4 h-4 text-sky-500" />
          </div>
          <p className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
            {metrics.callsMadeToday}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {metrics.totalCallsInRange} calls in selected range
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Order Confirmed Count
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {metrics.orderConfirmedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Verified customer orders
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Conversion Rate
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {metrics.conversionRate}%
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Confirmed orders / total leads
          </p>
        </div>
      </div>

      {/* Visual Charts Row: Bar Chart + Donut Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Agent Comparison Bar Chart */}
        <section className="lg:col-span-7 glass-panel rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Agent Calls vs. Conversions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Comparing Tanjin, Kathy, Tania, Shanaz, Sizon, and Sakib
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-sky-500" />
                Total Calls
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                Conversions
              </span>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {agentPerf.map((agent) => {
              const callWidth = Math.round((agent.totalCalls / maxBarValue) * 100);
              const convWidth = Math.round((agent.conversions / maxBarValue) * 100);
              return (
                <div key={agent.agentId} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {agent.agentName}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {agent.totalCalls} calls · {agent.conversions} conv ({agent.successRate}%)
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all duration-300"
                        style={{ width: `${Math.max(callWidth, agent.totalCalls > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{
                          width: `${Math.max(convWidth, agent.conversions > 0 ? 6 : 0)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Lead Status Donut Chart */}
        <section className="lg:col-span-5 glass-panel rounded-2xl p-5 sm:p-6 flex flex-col">
          <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Lead Status Distribution
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Outcome breakdown across active pipeline
            </p>
          </div>

          <div className="flex-1 flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center justify-center gap-6 pt-5">
            <div className="relative w-36 h-36 shrink-0">
              <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90" aria-label="Lead status donut chart">
                <circle
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="16"
                  className="text-slate-100 dark:text-slate-800"
                />
                {statusBreakdown.map((seg) => {
                  const dashLength = (seg.pct / 100) * circumference;
                  const dashOffset = -cumulativeOffset;
                  cumulativeOffset += dashLength;
                  return (
                    <circle
                      key={seg.status}
                      cx="70"
                      cy="70"
                      r={radius}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="16"
                      strokeDasharray={`${dashLength} ${circumference}`}
                      strokeDashoffset={dashOffset}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {metrics.totalLeads}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Leads</span>
              </div>
            </div>

            <ul className="space-y-2 w-full max-w-[220px]">
              {statusBreakdown.length === 0 ? (
                <li className="text-xs text-slate-500 dark:text-slate-400">
                  No leads in selected date range.
                </li>
              ) : (
                statusBreakdown.map((seg) => (
                  <li key={seg.status} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="text-slate-700 dark:text-slate-300 truncate">
                        {seg.status}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {seg.count} ({seg.pct}%)
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      </div>

      {/* Leaderboard & Collector Stats Row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Agent Performance Leaderboard */}
        <section className="xl:col-span-7 glass-panel rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Agent Performance Leaderboard
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ranked by Conversions (Order Confirmed + Interested) and Call Activity
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4 font-semibold">Rank</th>
                  <th className="py-3 px-4 font-semibold">Agent</th>
                  <th className="py-3 px-4 font-semibold text-right">Assigned</th>
                  <th className="py-3 px-4 font-semibold text-right">Calls</th>
                  <th className="py-3 px-4 font-semibold text-right">Confirmed</th>
                  <th className="py-3 px-4 font-semibold text-right">Conversions</th>
                  <th className="py-3 px-4 font-semibold text-right">Success Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {agentPerf.map((agent, index) => (
                  <tr
                    key={agent.agentId}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-500">
                      #{index + 1}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {agent.agentName}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {agent.assignedLeads}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-sky-600 dark:text-sky-400 font-semibold">
                      {agent.totalCalls}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                      {agent.orderConfirmed}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 font-semibold">
                      {agent.conversions}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {agent.successRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Data Collector Stats */}
        <section className="xl:col-span-5 glass-panel rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Data Collector Stats
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Daily & total valid leads submitted per collector
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4 font-semibold">Collector</th>
                  <th className="py-3 px-4 font-semibold text-right">Today</th>
                  <th className="py-3 px-4 font-semibold text-right">Total Valid</th>
                  <th className="py-3 px-4 font-semibold text-right">Dup Blocked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {collectorStats.map((stat) => (
                  <tr
                    key={stat.collectorId}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                      {stat.collectorName}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                      +{stat.todayCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 font-semibold">
                      {stat.totalCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-amber-600 dark:text-amber-400">
                      {stat.duplicateBlockedCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Kawsar's Content & Link Posts Visibility */}
      <div className="pt-2 space-y-3" data-testid="admin-kawsar-section">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Kawsar — Content &amp; Link Posting Activity
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Live daily post counts and submitted Facebook &amp; Website links synced to Kawsar_Posts_Log.
          </p>
        </div>
        <KawsarPostsView posts={contentPosts} canSubmit={false} compact />
      </div>
        </>
      )}
    </div>
  );
}
