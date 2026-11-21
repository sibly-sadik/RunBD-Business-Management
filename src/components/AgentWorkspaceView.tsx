import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  MessageCircle,
  PhoneCall,
  Save,
  Search,
  X,
} from 'lucide-react';
import { CALL_STATUSES, CallLog, CallStatus, Lead, User } from '../types';
import {
  buildTelUrl,
  buildWhatsAppUrl,
  DueRenewalItem,
  filterTodayLeads,
  formatBdPhoneDisplay,
  formatDateTime,
  formatShortDate,
  formatTime,
  getAgentTodayCallLogs,
  getLocalDateString,
  getScheduledFollowUps,
  isFollowUpDueToday,
} from '../utils/leadLogic';
import { RenewalAlertBanner } from './RenewalAlertBanner';
import { StatusBadge } from './StatusBadge';

interface AgentWorkspaceViewProps {
  agent: User;
  leads: Lead[];
  callLogs: CallLog[];
  callScript: string;
  dueRenewals: DueRenewalItem[];
  onMarkPaidCustomerRenewed: (customerId: string) => void;
  onOpenPaidCustomers: () => void;
  onOpenTodayCalls?: () => void;
  onUpdateCallScript: (script: string) => void;
  onLogCall: (input: {
    leadId: string;
    newStatus: CallStatus;
    followUpAt: string | null;
    notes: string;
  }) => void;
}

export function AgentWorkspaceView({
  agent,
  leads,
  callLogs,
  callScript,
  dueRenewals,
  onMarkPaidCustomerRenewed,
  onOpenPaidCustomers,
  onOpenTodayCalls,
  onUpdateCallScript,
  onLogCall,
}: AgentWorkspaceViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CallStatus | 'ALL'>('ALL');
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptDraft, setScriptDraft] = useState(callScript);

  // Call Logging Modal state
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [modalStatus, setModalStatus] = useState<CallStatus>('Pending');
  const [modalFollowUpDate, setModalFollowUpDate] = useState('');
  const [modalFollowUpTime, setModalFollowUpTime] = useState('');
  const [modalNotes, setModalNotes] = useState('');

  const todayStr = getLocalDateString();

  // Strict Today-only visibility: Agents only see leads assigned Today and Today's call logs
  const myLeads = useMemo(
    () =>
      filterTodayLeads(leads)
        .filter((l) => l.assignedAgentId === agent.id)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [leads, agent.id]
  );

  const myCallHistory = useMemo(
    () => getAgentTodayCallLogs(callLogs, agent.id),
    [callLogs, agent.id]
  );

  const myCallsToday = myCallHistory.length;

  const scheduledFollowUps = useMemo(
    () => getScheduledFollowUps(myLeads, agent.id),
    [myLeads, agent.id]
  );

  const todayFollowUpsCount = useMemo(
    () => scheduledFollowUps.filter((l) => isFollowUpDueToday(l.followUpAt)).length,
    [scheduledFollowUps]
  );

  const pendingFollowUpCount = useMemo(
    () =>
      myLeads.filter(
        (l) =>
          l.status === 'Pending' ||
          l.status === 'Busy / Call Later' ||
          l.status === 'Interested' ||
          Boolean(l.followUpAt)
      ).length,
    [myLeads]
  );

  const confirmedCount = useMemo(
    () => myLeads.filter((l) => l.status === 'Order Confirmed').length,
    [myLeads]
  );

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return myLeads.filter((l) => {
      if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
      if (!q) return true;
      return (
        l.customerName.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.lastCallNotes.toLowerCase().includes(q)
      );
    });
  }, [myLeads, searchQuery, statusFilter]);

  const openCallModal = (lead: Lead) => {
    setActiveLead(lead);
    setModalStatus(lead.status);
    setModalNotes(lead.lastCallNotes || '');
    if (lead.followUpAt) {
      const dt = new Date(lead.followUpAt);
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      const hh = String(dt.getHours()).padStart(2, '0');
      const min = String(dt.getMinutes()).padStart(2, '0');
      setModalFollowUpDate(`${yyyy}-${mm}-${dd}`);
      setModalFollowUpTime(`${hh}:${min}`);
    } else {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setModalFollowUpDate(`${yyyy}-${mm}-${dd}`);
      setModalFollowUpTime('16:00');
    }
  };

  const highlightFollowUp =
    modalStatus === 'Busy / Call Later' || modalStatus === 'Interested';

  const handleSaveCallLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLead) return;

    let followUpIso: string | null = null;
    if (
      modalStatus !== 'Done' &&
      (highlightFollowUp || modalStatus === 'Switched Off / No Answer') &&
      modalFollowUpDate
    ) {
      const safeTime = modalFollowUpTime || '10:00';
      const parsed = new Date(`${modalFollowUpDate}T${safeTime}:00`);
      if (!Number.isNaN(parsed.getTime())) {
        followUpIso = parsed.toISOString();
      }
    }

    onLogCall({
      leadId: activeLead.id,
      newStatus: modalStatus,
      followUpAt: followUpIso,
      notes: modalNotes.trim(),
    });
    setActiveLead(null);
  };

  const handleSaveScript = () => {
    onUpdateCallScript(scriptDraft);
  };

  return (
    <div className="space-y-6">
      {/* 2-Day Advance Renewal Notification Banner */}
      <RenewalAlertBanner
        dueItems={dueRenewals}
        audience="agent"
        onMarkRenewed={onMarkPaidCustomerRenewed}
        onViewAllPaidCustomers={onOpenPaidCustomers}
      />

      {/* Dedicated Agent Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            My Call Queue &middot; {agent.name}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Today ({todayStr}) &middot; Assigned leads, calls, and callbacks reset daily.
          </p>
        </div>

        {onOpenTodayCalls && (
          <button
            type="button"
            onClick={onOpenTodayCalls}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors self-start sm:self-auto cursor-pointer whitespace-nowrap"
          >
            <PhoneCall className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Today calls</span>
            <span className="font-mono text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              {myCallsToday}
            </span>
          </button>
        )}
      </div>

      {/* Personal Today-Only KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Assigned Leads</p>
          <p
            data-testid="agent-assigned-counter"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white"
          >
            {myLeads.length}
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Calls Made</p>
          <p
            data-testid="agent-calls-counter"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400"
          >
            {myCallsToday}
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Confirmed Orders</p>
          <p
            data-testid="agent-confirmed-counter"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400"
          >
            {confirmedCount}
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Pending / Follow-up
          </p>
          <p
            data-testid="agent-followup-counter"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400"
          >
            {pendingFollowUpCount}
          </p>
          {scheduledFollowUps.length > 0 && (
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {scheduledFollowUps.length} scheduled callback{scheduledFollowUps.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </div>

      {/* Scheduled Follow-ups Queue */}
      <section
        data-testid="scheduled-followups-panel"
        className="glass-panel rounded-2xl p-5 border-amber-300/60 dark:border-amber-500/30"
      >
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Scheduled Follow-ups
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Active callbacks for {agent.name} ({todayFollowUpsCount} due today)
              </p>
            </div>
          </div>
          <span className="font-mono text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-md whitespace-nowrap">
            {scheduledFollowUps.length} scheduled
          </span>
        </div>

        {scheduledFollowUps.length === 0 ? (
          <p className="pt-4 text-sm text-slate-500 dark:text-slate-400">
            No follow-up callbacks scheduled yet. Log a call as &ldquo;Interested&rdquo; or
            &ldquo;Busy / Call Later&rdquo; with a follow-up date to add it here.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {scheduledFollowUps.map((lead) => {
              const isToday = isFollowUpDueToday(lead.followUpAt);
              const isOverdue =
                lead.followUpAt ? new Date(lead.followUpAt).getTime() < Date.now() : false;
              const badgeLabel = lead.followUpAt
                ? isToday
                  ? `Today · ${formatTime(lead.followUpAt)}`
                  : formatDateTime(lead.followUpAt)
                : 'Scheduled';
              return (
              <div
                key={lead.id}
                className="rounded-xl p-4 bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {lead.customerName}
                    </p>
                    <span
                      className={`text-xs font-mono font-semibold tabular-nums px-2 py-0.5 rounded whitespace-nowrap ${
                        isOverdue
                          ? 'text-rose-700 dark:text-rose-300 bg-rose-500/15'
                          : isToday
                          ? 'text-amber-700 dark:text-amber-300 bg-amber-500/15'
                          : 'text-sky-700 dark:text-sky-300 bg-sky-500/15'
                      }`}
                    >
                      {badgeLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {formatBdPhoneDisplay(lead.phone)}
                    </p>
                    <StatusBadge status={lead.status} compact />
                  </div>
                  {lead.lastCallNotes && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">
                      {lead.lastCallNotes}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <a
                    href={buildTelUrl(lead.phone)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Call</span>
                  </a>
                  <a
                    href={buildWhatsAppUrl(lead.phone, lead.customerName)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>WhatsApp</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => openCallModal(lead)}
                    className="py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Log
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Collapsible Editable Call Script Panel */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setScriptOpen((prev) => !prev)}
          aria-expanded={scriptOpen}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <ClipboardList className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              Call Script Reference (Editable)
            </span>
          </div>
          {scriptOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {scriptOpen && (
          <div className="px-5 pb-5 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <label htmlFor="call-script-textarea" className="sr-only">
              Editable Call Script
            </label>
            <textarea
              id="call-script-textarea"
              rows={7}
              value={scriptDraft}
              onChange={(e) => setScriptDraft(e.target.value)}
              className="w-full p-3.5 rounded-xl text-sm leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveScript}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Script</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Assigned Leads Section */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              My Assigned Leads
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              Showing {filteredLeads.length} of {myLeads.length} assigned leads
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Search assigned leads"
                placeholder="Search name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-56 pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>

            <select
              aria-label="Filter leads by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as CallStatus | 'ALL')}
              className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
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
            No leads match your current filter.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-4 font-semibold">Customer</th>
                    <th className="py-3 px-4 font-semibold">Phone & Quick Contact</th>
                    <th className="py-3 px-4 font-semibold">Added Date</th>
                    <th className="py-3 px-4 font-semibold">Current Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {lead.customerName}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {lead.facebookLink && (
                            <a
                              href={
                                lead.facebookLink.startsWith('http')
                                  ? lead.facebookLink
                                  : `https://${lead.facebookLink}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline"
                            >
                              <span>Facebook</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {lead.lastCallNotes && (
                            <>
                              {lead.facebookLink && <span aria-hidden="true">·</span>}
                              <span className="truncate max-w-[220px]">{lead.lastCallNotes}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {formatBdPhoneDisplay(lead.phone)}
                          </span>
                          <a
                            href={buildTelUrl(lead.phone)}
                            aria-label={`Call ${lead.customerName}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors whitespace-nowrap"
                          >
                            <PhoneCall className="w-3 h-3" />
                            <span>Call</span>
                          </a>
                          <a
                            href={buildWhatsAppUrl(lead.phone, lead.customerName)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`WhatsApp ${lead.customerName}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-medium transition-colors whitespace-nowrap"
                          >
                            <MessageCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {formatShortDate(lead.createdAt)}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={lead.status} compact />
                        {lead.followUpAt && (
                          <div className="text-[11px] font-mono text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                            Follow-up: {formatDateTime(lead.followUpAt)}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openCallModal(lead)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Log Call
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
              {filteredLeads.map((lead) => (
                <div key={lead.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {lead.customerName}
                      </p>
                      <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 mt-0.5">
                        {formatBdPhoneDisplay(lead.phone)}
                      </p>
                    </div>
                    <StatusBadge status={lead.status} compact />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Added {formatShortDate(lead.createdAt)}</span>
                    {lead.facebookLink && (
                      <a
                        href={
                          lead.facebookLink.startsWith('http')
                            ? lead.facebookLink
                            : `https://${lead.facebookLink}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium"
                      >
                        <span>Facebook</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {lead.lastCallNotes && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100/70 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                      {lead.lastCallNotes}
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <a
                      href={buildTelUrl(lead.phone)}
                      className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Call</span>
                    </a>
                    <a
                      href={buildWhatsAppUrl(lead.phone, lead.customerName)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>WhatsApp</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => openCallModal(lead)}
                      className="inline-flex items-center justify-center py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
                    >
                      Log Call
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Call Logging & Status Update Modal */}
      {activeLead && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="log-call-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3
                  id="log-call-modal-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  Log Call — {activeLead.customerName}
                </h3>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                  {formatBdPhoneDisplay(activeLead.phone)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveLead(null)}
                aria-label="Close call logging modal"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCallLog} className="p-6 space-y-4">
              <div>
                <label
                  htmlFor="call-status-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Call Status *
                </label>
                <select
                  id="call-status-select"
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value as CallStatus)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  {CALL_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {/* Follow-up Scheduler */}
              {modalStatus === 'Done' ? (
                <div
                  data-testid="no-followup-notice"
                  className="rounded-xl p-4 border bg-teal-50/80 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/30"
                >
                  <p className="text-xs font-semibold text-teal-800 dark:text-teal-300">
                    No Follow-up Scheduled
                  </p>
                  <p className="text-[11px] text-teal-700/90 dark:text-teal-300/80 mt-0.5">
                    Calls marked <span className="font-semibold">Done</span> are recorded directly
                    in <span className="font-semibold">Today calls</span> without adding a
                    follow-up schedule.
                  </p>
                </div>
              ) : (
                <div
                  className={`rounded-xl p-4 border transition-colors ${
                    highlightFollowUp
                      ? 'bg-amber-50/80 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/40'
                      : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Follow-up Scheduler
                    </span>
                    {highlightFollowUp && (
                      <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                        Recommended for {modalStatus}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="followup-date"
                        className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                      >
                        Date
                      </label>
                      <input
                        id="followup-date"
                        type="date"
                        value={modalFollowUpDate}
                        onChange={(e) => setModalFollowUpDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="followup-time"
                        className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                      >
                        Time
                      </label>
                      <input
                        id="followup-time"
                        type="time"
                        value={modalFollowUpTime}
                        onChange={(e) => setModalFollowUpTime(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="call-notes-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Call Notes
                </label>
                <textarea
                  id="call-notes-input"
                  rows={3}
                  placeholder="Summarize customer response, delivery address, or next steps..."
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveLead(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Save Call Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
