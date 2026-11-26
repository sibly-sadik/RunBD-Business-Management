import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckSquare,
  Download,
  ExternalLink,
  MessageCircle,
  PhoneCall,
  Repeat,
  Search,
  X,
} from 'lucide-react';
import { CALL_STATUSES, CallStatus, Lead, User } from '../types';
import {
  AdminLeadsScope,
  buildTelUrl,
  CarryOverAssignMode,
  CarryOverLeadsInput,
  filterAdminDistributionLeads,
  filterTodayLeads,
  formatBdPhoneDisplay,
  formatDateTime,
  formatShortDate,
  generateLeadsCsv,
  getActiveAgents,
  getLeadCollectedYmd,
  getLocalDateString,
  getNextDayYmd,
  getNextRoundRobinAgent,
  isPreviousDayLead,
  openWhatsAppChat,
  parseDateToYmd,
} from '../utils/leadLogic';
import { StatusBadge } from './StatusBadge';

interface AdminLeadsViewProps {
  agents: User[];
  leads: Lead[];
  autoAssignEnabled: boolean;
  roundRobinIndex: number;
  disabledAgentIds: string[];
  onToggleAutoAssign: (enabled: boolean) => void;
  onToggleAgentAvailability: (agentId: string) => void;
  onReassignLead: (leadId: string, newAgentId: string | null) => void;
  onUpdateLeadStatus: (leadId: string, newStatus: CallStatus) => void;
  onCarryOverLeads: (input: CarryOverLeadsInput) => void;
  onExportCsv: () => void;
}

export function AdminLeadsView({
  agents,
  leads,
  autoAssignEnabled,
  roundRobinIndex,
  disabledAgentIds,
  onToggleAutoAssign,
  onToggleAgentAvailability,
  onReassignLead,
  onUpdateLeadStatus,
  onCarryOverLeads,
  onExportCsv,
}: AdminLeadsViewProps) {
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<AdminLeadsScope>('today_and_carryover');
  const [agentFilter, setAgentFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<CallStatus | 'ALL'>('ALL');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  // Carry-Over Modal state
  const [carryOverLeadIds, setCarryOverLeadIds] = useState<string[] | null>(null);
  const [assignMode, setAssignMode] = useState<CarryOverAssignMode>('specific');
  const [targetAgentId, setTargetAgentId] = useState<string>('');
  const [targetDateYmd, setTargetDateYmd] = useState<string>(() => getNextDayYmd());
  const [followUpTime, setFollowUpTime] = useState<string>('10:00');
  const [carryOverNote, setCarryOverNote] = useState<string>('');

  const todayStr = getLocalDateString();
  const nextDayStr = getNextDayYmd();

  const disabledSet = useMemo(() => new Set(disabledAgentIds), [disabledAgentIds]);
  const activeAgents = useMemo(
    () => getActiveAgents(agents, disabledAgentIds),
    [agents, disabledAgentIds]
  );
  const nextAgent =
    getNextRoundRobinAgent(agents, roundRobinIndex, disabledAgentIds)?.name ??
    'None';

  const todayLeads = useMemo(() => filterTodayLeads(leads), [leads]);
  const previousPendingLeads = useMemo(
    () => leads.filter((l) => l.status === 'Pending' && isPreviousDayLead(l)),
    [leads]
  );
  const allPendingLeads = useMemo(
    () => leads.filter((l) => l.status === 'Pending'),
    [leads]
  );
  const scheduledCarryOverCount = useMemo(
    () => filterAdminDistributionLeads(leads, 'scheduled_carryover').length,
    [leads]
  );

  const scopedLeads = useMemo(
    () => filterAdminDistributionLeads(leads, scopeFilter),
    [leads, scopeFilter]
  );

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedLeads
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
          (l.assignedAgentName ?? '').toLowerCase().includes(q) ||
          l.notes.toLowerCase().includes(q) ||
          l.lastCallNotes.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [scopedLeads, search, agentFilter, statusFilter]);

  const visiblePendingIds = useMemo(
    () => filteredLeads.filter((l) => l.status === 'Pending').map((l) => l.id),
    [filteredLeads]
  );

  const selectedSet = useMemo(() => new Set(selectedLeadIds), [selectedLeadIds]);
  const allVisiblePendingSelected =
    visiblePendingIds.length > 0 && visiblePendingIds.every((id) => selectedSet.has(id));

  // Keep selectedLeadIds pruned to valid Pending lead IDs currently in `leads`
  useEffect(() => {
    const validPending = new Set(allPendingLeads.map((l) => l.id));
    setSelectedLeadIds((prev) => {
      const next = prev.filter((id) => validPending.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [allPendingLeads]);

  const toggleSelectLead = (leadId: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  };

  const toggleSelectAllVisiblePending = () => {
    if (allVisiblePendingSelected) {
      const visibleSet = new Set(visiblePendingIds);
      setSelectedLeadIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      setSelectedLeadIds((prev) => Array.from(new Set([...prev, ...visiblePendingIds])));
    }
  };

  const openCarryOverModal = (targetIds: string[]) => {
    const cleanIds = Array.from(new Set(targetIds.filter(Boolean)));
    if (cleanIds.length === 0) return;

    const firstLead = leads.find((l) => l.id === cleanIds[0]);
    const fallbackAgentId = activeAgents[0]?.id ?? agents[0]?.id ?? '';

    setCarryOverLeadIds(cleanIds);
    setAssignMode('specific');
    if (cleanIds.length === 1 && firstLead?.assignedAgentId) {
      setTargetAgentId(firstLead.assignedAgentId);
    } else {
      setTargetAgentId(fallbackAgentId);
    }
    setTargetDateYmd(nextDayStr);
    setFollowUpTime('10:00');
    setCarryOverNote('');
  };

  const handleConfirmCarryOver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!carryOverLeadIds || carryOverLeadIds.length === 0) return;

    onCarryOverLeads({
      leadIds: carryOverLeadIds,
      assignMode,
      targetAgentId: assignMode === 'specific' ? targetAgentId || null : undefined,
      targetDateYmd: targetDateYmd || nextDayStr,
      followUpTime: followUpTime || '10:00',
      note: carryOverNote.trim() || undefined,
    });

    const carriedSet = new Set(carryOverLeadIds);
    setSelectedLeadIds((prev) => prev.filter((id) => !carriedSet.has(id)));
    setCarryOverLeadIds(null);
  };

  const handleDownloadCsv = () => {
    const csv = generateLeadsCsv(filteredLeads);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `runbd_leads_${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onExportCsv();
  };

  const modalPreviewLead =
    carryOverLeadIds && carryOverLeadIds.length === 1
      ? leads.find((l) => l.id === carryOverLeadIds[0]) ?? null
      : null;

  return (
    <div className="space-y-6">
      {/* Header & Admin Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Centralized Lead Distribution (Today: {todayStr})
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Today&apos;s leads ({todayLeads.length}), active carry-overs ({scheduledCarryOverCount}), and uncontacted earlier-day Pending leads ({previousPendingLeads.length}).
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadCsv}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap self-start cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export Visible CSV</span>
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
            {agents.map((agent) => {
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

      {/* Previous-Day Pending Alert Banner */}
      {previousPendingLeads.length > 0 && (
        <section
          data-testid="previous-pending-banner"
          className="rounded-2xl p-4 sm:p-5 bg-amber-50/90 dark:bg-amber-500/10 border border-amber-300/80 dark:border-amber-500/35 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-200">
                {previousPendingLeads.length} Previous-Day Pending Lead
                {previousPendingLeads.length === 1 ? '' : 's'} Need Follow-Up
              </h2>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/85 mt-0.5">
                Uncontacted leads from earlier dates (e.g.,{' '}
                {formatShortDate(previousPendingLeads[0].createdAt)}) stay hidden from agents&apos;
                daily queue until you assign or carry them over.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setScopeFilter('pending_previous');
                setStatusFilter('ALL');
              }}
              className="px-3.5 py-2 rounded-lg border border-amber-400/70 dark:border-amber-500/40 bg-white/80 dark:bg-slate-900/80 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-white dark:hover:bg-slate-900 transition-colors cursor-pointer whitespace-nowrap"
            >
              Review Previous Pending
            </button>
            <button
              type="button"
              onClick={() => openCarryOverModal(previousPendingLeads.map((l) => l.id))}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>Carry Over All ({previousPendingLeads.length}) to Next Day</span>
            </button>
          </div>
        </section>
      )}

      {/* Leads Master Table */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
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
              aria-label="Filter leads by date scope"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as AdminLeadsScope)}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="today_and_carryover">Today + Active Carry-Over</option>
              <option value="today">Today Collected Only ({todayLeads.length})</option>
              <option value="pending_previous">
                Previous-Day Pending ({previousPendingLeads.length})
              </option>
              <option value="pending_all">
                All Pending (Today + Earlier) ({allPendingLeads.length})
              </option>
              <option value="scheduled_carryover">
                Scheduled / Carried Over ({scheduledCarryOverCount})
              </option>
              <option value="all">All Loaded Leads ({leads.length})</option>
            </select>

            <select
              aria-label="Filter by assigned agent"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">All Agents</option>
              <option value="UNASSIGNED">Unassigned</option>
              {agents.map((a) => (
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

            {visiblePendingIds.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAllVisiblePending}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {allVisiblePendingSelected ? 'Deselect Pending' : 'Select All Pending'}
                </span>
              </button>
            )}

            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {filteredLeads.length} lead{filteredLeads.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* Bulk Carry-Over Action Bar */}
        {selectedLeadIds.length > 0 && (
          <div
            data-testid="bulk-carryover-bar"
            className="px-4 sm:px-5 py-3 bg-emerald-50/90 dark:bg-emerald-500/10 border-b border-emerald-200 dark:border-emerald-500/30 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
              <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                {selectedLeadIds.length} Pending lead{selectedLeadIds.length === 1 ? '' : 's'}{' '}
                selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedLeadIds([])}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => openCarryOverModal(selectedLeadIds)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <CalendarClock className="w-3.5 h-3.5" />
                <span>Assign / Carry Over Selected ({selectedLeadIds.length})</span>
              </button>
            </div>
          </div>
        )}

        {filteredLeads.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {scopedLeads.length === 0
              ? scopeFilter === 'pending_previous'
                ? 'No uncontacted Pending leads from previous dates.'
                : `No leads collected today (${todayStr}) or scheduled yet. Switch scope to review earlier leads or add leads from Data Collection.`
              : 'No leads match your current search or filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 pl-3 pr-1.5 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all visible pending leads"
                      checked={allVisiblePendingSelected}
                      disabled={visiblePendingIds.length === 0}
                      onChange={toggleSelectAllVisiblePending}
                      className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40"
                    />
                  </th>
                  <th className="py-3 px-2.5 font-semibold">Customer</th>
                  <th className="py-3 px-2.5 font-semibold">Phone</th>
                  <th className="py-3 px-2.5 font-semibold">Collector</th>
                  <th className="py-3 px-2.5 font-semibold">Assigned Agent</th>
                  <th className="py-3 px-2.5 font-semibold">Status &amp; Schedule</th>
                  <th className="py-3 px-2.5 font-semibold">Added</th>
                  <th className="py-3 pl-2.5 pr-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredLeads.map((lead) => {
                  const isPrevPending = lead.status === 'Pending' && isPreviousDayLead(lead);
                  const followUpYmd = parseDateToYmd(lead.followUpAt);
                  const isPending = lead.status === 'Pending';
                  const isSelected = selectedSet.has(lead.id);
                  const collectedYmd = getLeadCollectedYmd(lead);

                  return (
                    <tr
                      key={lead.id}
                      data-testid={`admin-lead-row-${lead.id}`}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-emerald-50/60 dark:bg-emerald-500/10'
                          : isPrevPending
                          ? 'bg-amber-50/45 dark:bg-amber-500/5 border-l-4 border-l-amber-500 hover:bg-amber-50/75 dark:hover:bg-amber-500/10'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 pl-3 pr-1.5">
                        {isPending ? (
                          <input
                            type="checkbox"
                            aria-label={`Select pending lead ${lead.customerName} (${lead.phone})`}
                            checked={isSelected}
                            onChange={() => toggleSelectLead(lead.id)}
                            className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        ) : (
                          <span className="inline-block w-4" aria-hidden="true" />
                        )}
                      </td>
                      <td className="py-3 px-2.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {lead.customerName}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {isPrevPending && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 whitespace-nowrap">
                              Earlier Pending · {formatShortDate(collectedYmd || lead.createdAt)}
                            </span>
                          )}
                          {lead.facebookLink && (
                            <a
                              href={
                                lead.facebookLink.startsWith('http')
                                  ? lead.facebookLink
                                  : `https://${lead.facebookLink}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"
                            >
                              <span>Facebook</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2.5">
                        <div className="flex items-center gap-1.5">
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
                      <td className="py-3 px-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {lead.collectorName}
                      </td>
                      <td className="py-3 px-2.5">
                        <select
                          aria-label={`Assign agent for ${lead.customerName}`}
                          value={lead.assignedAgentId ?? ''}
                          onChange={(e) => onReassignLead(lead.id, e.target.value || null)}
                          className="max-w-[120px] px-2 py-1 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        >
                          <option value="">Unassigned</option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}
                              {disabledSet.has(agent.id) ? ' (OFF)' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-2.5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={lead.status} compact />
                            <select
                              aria-label={`Update status for ${lead.customerName}`}
                              value={lead.status}
                              onChange={(e) =>
                                onUpdateLeadStatus(lead.id, e.target.value as CallStatus)
                              }
                              className="max-w-[132px] px-2 py-1 text-xs font-medium rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                            >
                              {CALL_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </div>
                          {lead.followUpAt && followUpYmd && (
                            <span className="text-[11px] font-mono tabular-nums text-sky-700 dark:text-sky-300 whitespace-nowrap">
                              {followUpYmd === nextDayStr
                                ? `Carry-Over → Next Day (${formatShortDate(lead.followUpAt)})`
                                : followUpYmd === todayStr
                                ? `Target: Today (${formatDateTime(lead.followUpAt)})`
                                : `Scheduled: ${formatDateTime(lead.followUpAt)}`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatShortDate(lead.createdAt)}
                      </td>
                      <td className="py-3 pl-2.5 pr-3 text-right whitespace-nowrap">
                        {isPending ? (
                          <button
                            type="button"
                            onClick={() => openCarryOverModal([lead.id])}
                            aria-label={`Assign / Carry Over ${lead.customerName} (${lead.phone})`}
                            data-testid={`carryover-btn-${lead.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 hover:bg-amber-600 text-amber-800 dark:text-amber-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <CalendarClock className="w-3.5 h-3.5" />
                            <span>Carry Over</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Assign / Carry Over to Next Day Modal */}
      {carryOverLeadIds && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="carryover-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3
                  id="carryover-modal-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  Assign / Carry Over to Next Day
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {modalPreviewLead
                    ? `${modalPreviewLead.customerName} · ${formatBdPhoneDisplay(
                        modalPreviewLead.phone
                      )}`
                    : `${carryOverLeadIds.length} selected Pending leads`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCarryOverLeadIds(null)}
                aria-label="Close carry-over modal"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmCarryOver} className="p-6 space-y-4">
              {/* Agent Assignment Mode */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Call Center Agent Assignment
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'specific', label: 'Choose Agent' },
                      { id: 'keep', label: 'Keep Current' },
                      { id: 'round-robin', label: 'Round-Robin' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAssignMode(opt.id)}
                      className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                        assignMode === opt.id
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {assignMode === 'specific' && (
                  <div className="mt-2.5">
                    <select
                      aria-label="Target Call Center Agent"
                      value={targetAgentId}
                      onChange={(e) => setTargetAgentId(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    >
                      <option value="">Unassigned</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                          {disabledSet.has(agent.id) ? ' (OFF)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {assignMode === 'round-robin' && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Distributes sequentially across active agents:{' '}
                    <strong>
                      {activeAgents.length > 0
                        ? activeAgents.map((a) => a.name).join(', ')
                        : 'No active agents (existing assignments preserved)'}
                    </strong>
                    .
                  </p>
                )}
              </div>

              {/* Target Schedule Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Target Schedule Date
                </label>
                <div className="flex flex-wrap items-center gap-2 mb-2.5">
                  <button
                    type="button"
                    data-testid="carryover-quick-nextday"
                    onClick={() => setTargetDateYmd(nextDayStr)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                      targetDateYmd === nextDayStr
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    Next Day (+1 · {nextDayStr})
                  </button>
                  <button
                    type="button"
                    data-testid="carryover-quick-today"
                    onClick={() => setTargetDateYmd(todayStr)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                      targetDateYmd === todayStr
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    Today ({todayStr})
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="carryover-target-date"
                      className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                    >
                      Custom Target Date
                    </label>
                    <input
                      id="carryover-target-date"
                      aria-label="Target schedule date"
                      type="date"
                      required
                      value={targetDateYmd}
                      onChange={(e) => setTargetDateYmd(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="carryover-target-time"
                      className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                    >
                      Schedule Time
                    </label>
                    <input
                      id="carryover-target-time"
                      aria-label="Schedule time"
                      type="time"
                      value={followUpTime}
                      onChange={(e) => setFollowUpTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Carry-Over Note */}
              <div>
                <label
                  htmlFor="carryover-note-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Carry-Over Note (Optional)
                </label>
                <input
                  id="carryover-note-input"
                  type="text"
                  placeholder="Optional instruction for the agent (collector notes are preserved)..."
                  value={carryOverNote}
                  onChange={(e) => setCarryOverNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setCarryOverLeadIds(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-carryover-btn"
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Confirm Carry Over
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

