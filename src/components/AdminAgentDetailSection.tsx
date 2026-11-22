import { useMemo, useState } from 'react';
import {
  CalendarClock,
  ExternalLink,
  History,
  MessageCircle,
  PhoneCall,
  Search,
} from 'lucide-react';
import { CALL_STATUSES, CallLog, CallStatus, DateRangeFilter, Lead, User } from '../types';
import {
  buildTelUrl,
  formatBdPhoneDisplay,
  formatDateTime,
  formatShortDate,
  formatTime,
  isFollowUpDueToday,
  isWithinDateRange,
  openWhatsAppChat,
} from '../utils/leadLogic';
import { StatusBadge } from './StatusBadge';

interface AdminAgentDetailSectionProps {
  agent: User;
  leads: Lead[];
  callLogs: CallLog[];
  dateFilter: DateRangeFilter;
}

export function AdminAgentDetailSection({
  agent,
  leads,
  callLogs,
  dateFilter,
}: AdminAgentDetailSectionProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CallStatus | 'ALL'>('ALL');

  const agentLeads = useMemo(
    () =>
      leads
        .filter((l) => l.assignedAgentId === agent.id)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [leads, agent.id]
  );

  const rangeLeads = useMemo(
    () => agentLeads.filter((l) => isWithinDateRange(l.createdAt, dateFilter)),
    [agentLeads, dateFilter]
  );

  const agentCallLogs = useMemo(
    () =>
      callLogs
        .filter((c) => c.agentId === agent.id && isWithinDateRange(c.timestamp, dateFilter))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [callLogs, agent.id, dateFilter]
  );

  const followUps = useMemo(
    () =>
      agentLeads
        .filter((l) => Boolean(l.followUpAt))
        .sort(
          (a, b) =>
            new Date(a.followUpAt ?? 0).getTime() - new Date(b.followUpAt ?? 0).getTime()
        ),
    [agentLeads]
  );

  const dueTodayCount = useMemo(
    () => followUps.filter((l) => isFollowUpDueToday(l.followUpAt)).length,
    [followUps]
  );

  const confirmedCount = useMemo(
    () => rangeLeads.filter((l) => l.status === 'Order Confirmed').length,
    [rangeLeads]
  );

  const interestedCount = useMemo(
    () => rangeLeads.filter((l) => l.status === 'Interested').length,
    [rangeLeads]
  );

  const conversions = confirmedCount + interestedCount;
  const denominator = Math.max(agentCallLogs.length, rangeLeads.length);
  const successRate =
    denominator > 0 ? Number(((conversions / denominator) * 100).toFixed(1)) : 0;

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agentLeads.filter((l) => {
      if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
      if (!q) return true;
      return (
        l.customerName.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.lastCallNotes.toLowerCase().includes(q)
      );
    });
  }, [agentLeads, search, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Agent Performance KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Assigned Leads</p>
          <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {agentLeads.length}
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Calls Logged</p>
          <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
            {agentCallLogs.length}
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Order Confirmed</p>
          <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {confirmedCount}
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Interested</p>
          <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
            {interestedCount}
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Scheduled Follow-ups
          </p>
          <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
            {followUps.length}
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Success Rate</p>
          <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {successRate}%
          </p>
        </div>
      </div>

      {/* Scheduled Follow-ups for this Agent */}
      <section className="glass-panel rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {agent.name}&apos;s Scheduled Follow-ups
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {dueTodayCount} due today · {followUps.length} total scheduled
              </p>
            </div>
          </div>
        </div>

        {followUps.length === 0 ? (
          <p className="pt-4 text-sm text-slate-500 dark:text-slate-400">
            No follow-ups currently scheduled for {agent.name}.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {followUps.map((lead) => (
              <div
                key={lead.id}
                className="rounded-xl p-4 bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2.5"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {lead.customerName}
                    </p>
                    <span className="text-xs font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded whitespace-nowrap">
                      {lead.followUpAt
                        ? isFollowUpDueToday(lead.followUpAt)
                          ? `Today ${formatTime(lead.followUpAt)}`
                          : formatDateTime(lead.followUpAt)
                        : ''}
                    </span>
                  </div>
                  <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 mt-1">
                    {formatBdPhoneDisplay(lead.phone)}
                  </p>
                  {lead.lastCallNotes && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2">
                      {lead.lastCallNotes}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                  <StatusBadge status={lead.status} compact />
                  <div className="flex items-center gap-1.5">
                    <a
                      href={buildTelUrl(lead.phone)}
                      aria-label={`Call ${lead.customerName}`}
                      className="p-1.5 rounded-md bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => openWhatsAppChat(lead.phone)}
                      aria-label={`WhatsApp ${lead.customerName}`}
                      className="p-1.5 rounded-md bg-slate-200/80 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Assigned Leads Table */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {agent.name}&apos;s Assigned Leads
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              Showing {filteredLeads.length} of {agentLeads.length} leads assigned to {agent.name}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label={`Search ${agent.name}'s leads`}
                placeholder="Search customer or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-56 pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>

            <select
              aria-label={`Filter ${agent.name}'s leads by status`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as CallStatus | 'ALL')}
              className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">All Statuses</option>
              {CALL_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredLeads.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {agentLeads.length === 0
              ? `No leads are assigned to ${agent.name} yet.`
              : 'No leads match your current filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4 font-semibold">Customer</th>
                  <th className="py-3 px-4 font-semibold">Phone</th>
                  <th className="py-3 px-4 font-semibold">Call Status</th>
                  <th className="py-3 px-4 font-semibold">Latest Notes</th>
                  <th className="py-3 px-4 font-semibold">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {lead.customerName}
                      </div>
                      {lead.facebookLink && (
                        <a
                          href={
                            lead.facebookLink.startsWith('http')
                              ? lead.facebookLink
                              : `https://${lead.facebookLink}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline mt-0.5"
                        >
                          <span>Facebook</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {formatBdPhoneDisplay(lead.phone)}
                        </span>
                        <a
                          href={buildTelUrl(lead.phone)}
                          aria-label={`Call ${lead.customerName}`}
                          className="p-1 rounded bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors"
                        >
                          <PhoneCall className="w-3 h-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => openWhatsAppChat(lead.phone)}
                          aria-label={`WhatsApp ${lead.customerName}`}
                          className="p-1 rounded bg-slate-200/80 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors cursor-pointer"
                        >
                          <MessageCircle className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={lead.status} compact />
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {lead.lastCallNotes || lead.notes || '—'}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatShortDate(lead.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Agent Call Log History */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-sky-500" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {agent.name}&apos;s Call Log History
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {agentCallLogs.length} call log{agentCallLogs.length === 1 ? '' : 's'} in selected
                date range
              </p>
            </div>
          </div>
        </div>

        {agentCallLogs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No call logs recorded for {agent.name} yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4 font-semibold">Timestamp</th>
                  <th className="py-3 px-4 font-semibold">Customer</th>
                  <th className="py-3 px-4 font-semibold">Status Update</th>
                  <th className="py-3 px-4 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {agentCallLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {log.customerName}
                      </div>
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {formatBdPhoneDisplay(log.phone)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {log.previousStatus}
                        </span>
                        <span className="text-xs text-slate-400" aria-hidden="true">
                          →
                        </span>
                        <StatusBadge status={log.newStatus} compact />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {log.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
