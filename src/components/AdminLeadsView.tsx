import { useMemo, useState } from 'react';
import {
  Download,
  ExternalLink,
  MessageCircle,
  PhoneCall,
  Repeat,
  Search,
} from 'lucide-react';
import { CALL_CENTER_AGENTS } from '../data/seedData';
import { CALL_STATUSES, CallStatus, Lead } from '../types';
import {
  buildTelUrl,
  filterTodayLeads,
  formatBdPhoneDisplay,
  formatShortDate,
  generateLeadsCsv,
  getActiveAgents,
  getLocalDateString,
  getNextRoundRobinAgent,
  openWhatsAppChat,
} from '../utils/leadLogic';
import { StatusBadge } from './StatusBadge';

interface AdminLeadsViewProps {
  leads: Lead[];
  autoAssignEnabled: boolean;
  roundRobinIndex: number;
  disabledAgentIds: string[];
  onToggleAutoAssign: (enabled: boolean) => void;
  onToggleAgentAvailability: (agentId: string) => void;
  onReassignLead: (leadId: string, newAgentId: string | null) => void;
  onUpdateLeadStatus: (leadId: string, newStatus: CallStatus) => void;
  onExportCsv: () => void;
}

export function AdminLeadsView({
  leads,
  autoAssignEnabled,
  roundRobinIndex,
  disabledAgentIds,
  onToggleAutoAssign,
  onToggleAgentAvailability,
  onReassignLead,
  onUpdateLeadStatus,
  onExportCsv,
}: AdminLeadsViewProps) {
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<CallStatus | 'ALL'>('ALL');

  const todayStr = getLocalDateString();

  // Hide 28k+ historical Master_Data rows: display ONLY leads collected Today (YYYY-MM-DD)
  const todayLeads = useMemo(() => filterTodayLeads(leads), [leads]);

  const disabledSet = useMemo(() => new Set(disabledAgentIds), [disabledAgentIds]);
  const activeAgents = useMemo(
    () => getActiveAgents(CALL_CENTER_AGENTS, disabledAgentIds),
    [disabledAgentIds]
  );
  const nextAgent =
    getNextRoundRobinAgent(CALL_CENTER_AGENTS, roundRobinIndex, disabledAgentIds)?.name ??
    'None';

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return todayLeads
      .filter((l) => {
        if (agentFilter === 'UNASSIGNED' && l.assignedAgentId !== null) return false;
        if (agentFilter !== 'ALL' && agentFilter !== 'UNASSIGNED' && l.assignedAgentId !== agentFilter)
          return false;
        if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
        if (!q) return true;
        return (
          l.customerName.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          l.collectorName.toLowerCase().includes(q) ||
          (l.assignedAgentName ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [todayLeads, search, agentFilter, statusFilter]);

  const handleDownloadCsv = () => {
    const csv = generateLeadsCsv(filteredLeads);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `runbd_leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onExportCsv();
  };

  return (
    <div className="space-y-6">
      {/* Header & Admin Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Centralized Lead Distribution (Today: {todayStr})
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Showing only today&apos;s collected leads ({todayLeads.length}). Historical Master_Data rows stay in Google Sheets for live duplicate checking.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadCsv}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap self-start cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export Today&apos;s CSV</span>
        </button>
      </div>

      {/* Round-Robin Control Panel */}
      <section className="glass-panel rounded-2xl p-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Repeat className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Automated Round-Robin Engine
            </h2>
            <p
              data-testid="round-robin-subtitle"
              className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed"
            >
              Equally distributes newly collected leads across{' '}
              <strong>
                {activeAgents.length > 0
                  ? activeAgents.map((a) => a.name).join(', ')
                  : 'No active agents'}
              </strong>
              . Next in queue:{' '}
              <strong
                data-testid="round-robin-next-agent"
                className="text-emerald-600 dark:text-emerald-400"
              >
                {nextAgent}
              </strong>
              .
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 xl:justify-end shrink-0">
          <div
            role="group"
            aria-label="Per-agent auto-assignment availability toggles"
            data-testid="agent-availability-toggles"
            className="flex flex-wrap items-center gap-1.5"
          >
            {CALL_CENTER_AGENTS.map((agent) => {
              const isActive = !disabledSet.has(agent.id);
              return (
                <button
                  key={agent.id}
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  aria-label={`Toggle ${agent.name} availability (${isActive ? 'ON' : 'OFF'})`}
                  data-testid={`agent-availability-toggle-${agent.id}`}
                  onClick={() => onToggleAgentAvailability(agent.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-300 hover:bg-emerald-500/20'
                      : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-900/70 dark:border-slate-800 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  <span className={isActive ? '' : 'line-through'}>{agent.name}</span>
                  <span
                    className={`text-[10px] font-bold ${
                      isActive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {isActive ? '● ON' : '○ OFF'}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-slate-800 shrink-0" />

          <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
              Auto-Assign: <strong>{autoAssignEnabled ? 'ON' : 'OFF'}</strong>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autoAssignEnabled}
              aria-label="Toggle Round-Robin Auto-Assign"
              onClick={() => onToggleAutoAssign(!autoAssignEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                autoAssignEnabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoAssignEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Leads Master Table */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search all leads"
              placeholder="Search customer, phone, collector, agent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filter by assigned agent"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">All Agents</option>
              <option value="UNASSIGNED">Unassigned</option>
              {CALL_CENTER_AGENTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by call status"
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

            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {filteredLeads.length} today lead{filteredLeads.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {filteredLeads.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {todayLeads.length === 0
              ? `No leads collected today (${todayStr}) yet. Add leads from Data Collection to distribute across the 6 agents.`
              : 'No leads match your current search or filter.'}
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 px-4 font-semibold">Customer</th>
                <th className="py-3 px-4 font-semibold">Phone</th>
                <th className="py-3 px-4 font-semibold">Collector</th>
                <th className="py-3 px-4 font-semibold">Assigned Agent</th>
                <th className="py-3 px-4 font-semibold">Status</th>
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
                  <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {lead.collectorName}
                  </td>
                  <td className="py-3 px-4">
                    <select
                      aria-label={`Assign agent for ${lead.customerName}`}
                      value={lead.assignedAgentId ?? ''}
                      onChange={(e) => onReassignLead(lead.id, e.target.value || null)}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    >
                      <option value="">Unassigned</option>
                      {CALL_CENTER_AGENTS.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                          {disabledSet.has(agent.id) ? ' (OFF)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={lead.status} compact />
                      <select
                        aria-label={`Update status for ${lead.customerName}`}
                        value={lead.status}
                        onChange={(e) =>
                          onUpdateLeadStatus(lead.id, e.target.value as CallStatus)
                        }
                        className="px-2 py-1 text-xs font-medium rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      >
                        {CALL_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>
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
    </div>
  );
}
