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
  buildWhatsAppUrl,
  formatBdPhoneDisplay,
  formatShortDate,
  generateLeadsCsv,
} from '../utils/leadLogic';
import { StatusBadge } from './StatusBadge';

interface AdminLeadsViewProps {
  leads: Lead[];
  autoAssignEnabled: boolean;
  roundRobinIndex: number;
  onToggleAutoAssign: (enabled: boolean) => void;
  onReassignLead: (leadId: string, newAgentId: string | null) => void;
  onExportCsv: () => void;
}

export function AdminLeadsView({
  leads,
  autoAssignEnabled,
  roundRobinIndex,
  onToggleAutoAssign,
  onReassignLead,
  onExportCsv,
}: AdminLeadsViewProps) {
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<CallStatus | 'ALL'>('ALL');

  const nextAgent =
    CALL_CENTER_AGENTS[roundRobinIndex % CALL_CENTER_AGENTS.length]?.name ?? 'Tanjin';

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads
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
  }, [leads, search, agentFilter, statusFilter]);

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
            Centralized Lead Distribution
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Control Round-Robin automation, manually reassign leads, or export master CSV.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadCsv}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap self-start cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export Master CSV</span>
        </button>
      </div>

      {/* Round-Robin Control Panel */}
      <section className="glass-panel rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Repeat className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Automated Round-Robin Engine
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Equally distributes newly collected leads across{' '}
              <strong>Tanjin, Kathy, Tania, Shanaz, Sizon, Sakib</strong>. Next in queue:{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">{nextAgent}</strong>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
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
              {filteredLeads.length} leads
            </span>
          </div>
        </div>

        {filteredLeads.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {leads.length === 0
              ? 'No leads in the database yet. Add leads from the Data Collection module to begin Round-Robin distribution.'
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
                      <a
                        href={buildWhatsAppUrl(lead.phone, lead.customerName)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`WhatsApp ${lead.customerName}`}
                        className="p-1 rounded bg-slate-200/80 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors"
                      >
                        <MessageCircle className="w-3 h-3" />
                      </a>
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
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={lead.status} compact />
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
