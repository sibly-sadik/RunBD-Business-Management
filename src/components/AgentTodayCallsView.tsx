import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  MessageCircle,
  PhoneCall,
  Search,
} from 'lucide-react';
import { CALL_STATUSES, CallLog, CallStatus, User } from '../types';
import {
  buildTelUrl,
  formatBdPhoneDisplay,
  formatDateTime,
  formatTime,
  getAgentTodayCallLogs,
  getLocalDateString,
  openWhatsAppChat,
} from '../utils/leadLogic';
import { StatusBadge } from './StatusBadge';
import { CopyPhoneButton } from './CopyPhoneButton';

interface AgentTodayCallsViewProps {
  agent: User;
  callLogs: CallLog[];
  onBackToQueue?: () => void;
  onPhoneCopied?: (cleanPhone: string) => void;
}

export function AgentTodayCallsView({
  agent,
  callLogs,
  onBackToQueue,
  onPhoneCopied,
}: AgentTodayCallsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CallStatus | 'ALL'>('ALL');

  const todayStr = getLocalDateString();

  // Strict Today-only & per-agent isolation
  const todayCalls = useMemo(
    () => getAgentTodayCallLogs(callLogs, agent.id),
    [callLogs, agent.id]
  );

  const confirmedTodayCount = useMemo(
    () => todayCalls.filter((c) => c.newStatus === 'Order Confirmed').length,
    [todayCalls]
  );

  const followUpsScheduledToday = useMemo(
    () => todayCalls.filter((c) => Boolean(c.followUpAt)).length,
    [todayCalls]
  );

  const filteredCalls = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return todayCalls.filter((c) => {
      if (statusFilter !== 'ALL' && c.newStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        c.customerName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.notes.toLowerCase().includes(q)
      );
    });
  }, [todayCalls, searchQuery, statusFilter]);

  return (
    <div className="space-y-6" data-testid="agent-today-calls-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Today calls
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {agent.name}&apos;s call log for Today ({todayStr}) &middot; Resets to 0 daily.
          </p>
        </div>

        {onBackToQueue && (
          <button
            type="button"
            onClick={onBackToQueue}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors self-start sm:self-auto cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to My Call Queue</span>
          </button>
        )}
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Calls Logged Today
          </p>
          <p
            data-testid="today-calls-total-count"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400"
          >
            {todayCalls.length}
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Orders Confirmed Today
          </p>
          <p
            data-testid="today-calls-confirmed-count"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400"
          >
            {confirmedTodayCount}
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Follow-ups Scheduled
          </p>
          <p
            data-testid="today-calls-followups-count"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400"
          >
            {followUpsScheduledToday}
          </p>
        </div>
      </div>

      {/* Call Logs Table / Cards */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {agent.name}&apos;s Today Call Logs
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              Showing {filteredCalls.length} of {todayCalls.length} call
              {todayCalls.length === 1 ? '' : 's'} logged today ({todayStr})
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Search today calls"
                placeholder="Search customer, phone, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-60 pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>

            <select
              aria-label="Filter today calls by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as CallStatus | 'ALL')}
              className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="ALL">All Outcomes</option>
              {CALL_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        {todayCalls.length === 0 ? (
          <div
            data-testid="today-calls-empty"
            className="p-10 text-center space-y-3"
          >
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No calls logged yet for Today ({todayStr}).
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Use &ldquo;Log Call&rdquo; in My Call Queue to record customer call outcomes and follow-ups.
            </p>
            {onBackToQueue && (
              <button
                type="button"
                onClick={onBackToQueue}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Open My Call Queue</span>
              </button>
            )}
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No call logs match your current search or outcome filter.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table
                data-testid="today-calls-table"
                className="w-full text-left border-collapse text-sm"
              >
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-4 font-semibold">Customer Name</th>
                    <th className="py-3 px-4 font-semibold">Phone &amp; Quick Actions</th>
                    <th className="py-3 px-4 font-semibold">Status Transition</th>
                    <th className="py-3 px-4 font-semibold">Follow-up Date/Time</th>
                    <th className="py-3 px-4 font-semibold">Notes</th>
                    <th className="py-3 px-4 font-semibold">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredCalls.map((log) => (
                    <tr
                      key={log.id}
                      data-testid={`today-call-row-${log.id}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        {log.customerName}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {formatBdPhoneDisplay(log.phone)}
                          </span>
                          <CopyPhoneButton
                            phone={log.phone}
                            customerName={log.customerName}
                            onCopied={onPhoneCopied}
                          />
                          <a
                            href={buildTelUrl(log.phone)}
                            aria-label={`Call ${log.customerName}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors whitespace-nowrap"
                          >
                            <PhoneCall className="w-3 h-3" />
                            <span>Call</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => openWhatsAppChat(log.phone)}
                            aria-label={`WhatsApp ${log.customerName}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
                          >
                            <MessageCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>WhatsApp</span>
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {log.previousStatus}
                          </span>
                          <span className="text-xs text-slate-400" aria-hidden="true">
                            →
                          </span>
                          <StatusBadge status={log.newStatus} compact />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono tabular-nums whitespace-nowrap">
                        {log.followUpAt ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded">
                            <CalendarClock className="w-3 h-3 shrink-0" />
                            <span>{formatDateTime(log.followUpAt)}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300 max-w-xs break-words">
                        {log.notes || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatTime(log.timestamp) || formatDateTime(log.timestamp)}
                        <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                          {formatDateTime(log.timestamp)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
              {filteredCalls.map((log) => (
                <div key={log.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {log.customerName}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {formatBdPhoneDisplay(log.phone)}
                        </p>
                        <CopyPhoneButton
                          phone={log.phone}
                          customerName={log.customerName}
                          onCopied={onPhoneCopied}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatTime(log.timestamp) || formatDateTime(log.timestamp)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {log.previousStatus}
                    </span>
                    <span className="text-xs text-slate-400" aria-hidden="true">
                      →
                    </span>
                    <StatusBadge status={log.newStatus} compact />
                  </div>

                  {log.followUpAt && (
                    <div className="text-xs font-mono text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                      <span>Follow-up: {formatDateTime(log.followUpAt)}</span>
                    </div>
                  )}

                  {log.notes && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100/70 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                      {log.notes}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <a
                      href={buildTelUrl(log.phone)}
                      className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Call</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => openWhatsAppChat(log.phone)}
                      aria-label={`WhatsApp ${log.customerName}`}
                      className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-xs font-semibold cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
