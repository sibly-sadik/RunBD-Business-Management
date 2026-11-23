import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  BellRing,
  CalendarCheck2,
  CheckCircle2,
  Download,
  MessageCircle,
  PhoneCall,
  RefreshCw,
  Search,
} from 'lucide-react';
import { PaidCustomer, RENEWAL_STATUSES, RenewalStatus, User } from '../types';
import {
  buildTelUrl,
  computeDaysRemaining,
  computeEffectiveRenewalStatus,
  formatBdPhoneDisplay,
  generatePaidCustomersCsv,
  openWhatsAppChat,
} from '../utils/leadLogic';

interface PaidCustomersViewProps {
  currentUser: User;
  agents: User[];
  paidCustomers: PaidCustomer[];
  onMarkRenewed: (customerId: string) => void;
  onUpdateRenewalStatus?: (customerId: string, status: RenewalStatus) => void;
  onExportCsv?: () => void;
}

type FilterMode = 'ALL' | 'DUE_SOON' | RenewalStatus;

function RenewalStatusBadge({ status }: { status: RenewalStatus }) {
  const styles =
    status === 'Active'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
      : status === 'Renewed'
      ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${styles}`}
    >
      {status}
    </span>
  );
}

function formatDaysRemainingLabel(daysRemaining: number): string {
  if (daysRemaining < 0) {
    const overdue = Math.abs(daysRemaining);
    return `Overdue (${overdue}d)`;
  }
  if (daysRemaining === 0) return 'Due Today (0d)';
  if (daysRemaining === 1) return '1 day left';
  return `${daysRemaining} days left`;
}

export function PaidCustomersView({
  currentUser,
  agents,
  paidCustomers,
  onMarkRenewed,
  onUpdateRenewalStatus,
  onExportCsv,
}: PaidCustomersViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterMode>('ALL');
  const [agentFilter, setAgentFilter] = useState<string>('ALL');

  const isAdmin = currentUser.role === 'admin';

  // Scope Paid Customers to the logged-in Agent, or show all for Admin
  const scopedCustomers = useMemo(() => {
    const base = isAdmin
      ? paidCustomers
      : paidCustomers.filter((c) => c.assignedAgentId === currentUser.id);
    return base.map((customer) => {
      const daysRemaining = computeDaysRemaining(customer.renewalDate);
      const effectiveStatus = computeEffectiveRenewalStatus(customer);
      return { customer, daysRemaining, effectiveStatus };
    });
  }, [paidCustomers, isAdmin, currentUser.id]);

  const stats = useMemo(() => {
    let activeCount = 0;
    let dueSoonCount = 0;
    let renewedCount = 0;
    let expiredCount = 0;

    for (const item of scopedCustomers) {
      if (item.effectiveStatus === 'Active') activeCount++;
      if (item.effectiveStatus === 'Renewed') renewedCount++;
      if (item.effectiveStatus === 'Expired') expiredCount++;
      if (item.effectiveStatus !== 'Expired' && item.daysRemaining <= 2) {
        dueSoonCount++;
      }
    }

    return {
      total: scopedCustomers.length,
      activeCount,
      dueSoonCount,
      renewedCount,
      expiredCount,
    };
  }, [scopedCustomers]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedCustomers
      .filter(({ customer, daysRemaining, effectiveStatus }) => {
        if (isAdmin && agentFilter !== 'ALL') {
          if (agentFilter === 'UNASSIGNED' && customer.assignedAgentId !== null) return false;
          if (agentFilter !== 'UNASSIGNED' && customer.assignedAgentId !== agentFilter)
            return false;
        }
        if (statusFilter === 'DUE_SOON') {
          if (!(effectiveStatus !== 'Expired' && daysRemaining <= 2)) return false;
        } else if (statusFilter !== 'ALL' && effectiveStatus !== statusFilter) {
          return false;
        }
        if (!q) return true;
        return (
          customer.customerName.toLowerCase().includes(q) ||
          customer.phone.includes(q) ||
          (customer.assignedAgentName ?? '').toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          a.daysRemaining - b.daysRemaining ||
          (Date.parse(b.customer.updatedAt) || 0) - (Date.parse(a.customer.updatedAt) || 0)
      );
  }, [scopedCustomers, search, statusFilter, agentFilter, isAdmin]);

  const handleDownloadCsv = () => {
    const csv = generatePaidCustomersCsv(filteredItems.map((i) => i.customer));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `runbd_paid_customers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onExportCsv?.();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Paid Customers &amp; 1-Month Renewals
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Auto-created whenever an Order is Confirmed (+30 days renewal cycle) · Two-way synced with Google Sheets{' '}
            <code className="font-mono text-xs">Paid_Customers</code>.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadCsv}
          disabled={filteredItems.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap self-start cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export Paid Customers CSV</span>
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-panel rounded-xl p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Paid Customers
            </span>
            <BadgeCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>
          <p
            data-testid="paid-total-count"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white"
          >
            {stats.total}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Active Subscriptions
            </span>
            <CalendarCheck2 className="w-4 h-4 text-sky-500 shrink-0" />
          </div>
          <p
            data-testid="paid-active-count"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400"
          >
            {stats.activeCount}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-3.5 sm:p-4 border-amber-300/60 dark:border-amber-500/30">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
              Due Within 2 Days
            </span>
            <BellRing className="w-4 h-4 text-amber-500 shrink-0" />
          </div>
          <p
            data-testid="paid-due-soon-count"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400"
          >
            {stats.dueSoonCount}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Renewed / Expired
            </span>
            <RefreshCw className="w-4 h-4 text-sky-500 shrink-0" />
          </div>
          <p
            data-testid="paid-renewed-count"
            className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400"
          >
            {stats.renewedCount}{' '}
            <span className="text-sm font-normal text-rose-500 dark:text-rose-400">
              / {stats.expiredCount} exp
            </span>
          </p>
        </div>
      </div>

      {/* Filters & Table */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search paid customers"
              placeholder="Search customer, phone, or agent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isAdmin && (
              <select
                aria-label="Filter paid customers by agent"
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
            )}

            <select
              aria-label="Filter paid customers by renewal status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FilterMode)}
              className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">All Statuses</option>
              <option value="DUE_SOON">Due Within 2 Days</option>
              {RENEWAL_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {filteredItems.length} customer{filteredItems.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {scopedCustomers.length === 0
              ? 'No Paid Customers yet. When an Agent or Admin marks any lead as "Order Confirmed", it will automatically appear here with a 30-day renewal date.'
              : 'No paid customers match your current filter.'}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-4 font-semibold">Customer Name</th>
                    <th className="py-3 px-4 font-semibold">Phone</th>
                    <th className="py-3 px-4 font-semibold">Assigned Agent</th>
                    <th className="py-3 px-4 font-semibold">Confirmed Date</th>
                    <th className="py-3 px-4 font-semibold">Renewal Date</th>
                    <th className="py-3 px-4 font-semibold">Days Remaining</th>
                    <th className="py-3 px-4 font-semibold">Renewal Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredItems.map(({ customer, daysRemaining, effectiveStatus }) => {
                    const isDueSoon = effectiveStatus !== 'Expired' && daysRemaining <= 2;
                    return (
                      <tr
                        key={customer.id}
                        data-testid={`paid-row-${customer.id}`}
                        className={`transition-colors ${
                          isDueSoon
                            ? 'bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {customer.customerName}
                          </div>
                          {customer.notes && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px] mt-0.5">
                              {customer.notes}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {formatBdPhoneDisplay(customer.phone)}
                            </span>
                            <a
                              href={buildTelUrl(customer.phone)}
                              aria-label={`Call ${customer.customerName}`}
                              className="p-1 rounded bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors"
                            >
                              <PhoneCall className="w-3 h-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => openWhatsAppChat(customer.phone)}
                              aria-label={`WhatsApp ${customer.customerName}`}
                              className="p-1 rounded bg-slate-200/80 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors cursor-pointer"
                            >
                              <MessageCircle className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {customer.assignedAgentName ?? 'Unassigned'}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {customer.confirmedDate}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {customer.renewalDate}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`font-mono text-xs font-semibold tabular-nums ${
                              daysRemaining < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : daysRemaining <= 2
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {formatDaysRemainingLabel(daysRemaining)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {isAdmin && onUpdateRenewalStatus ? (
                            <select
                              aria-label={`Renewal status for ${customer.customerName}`}
                              value={effectiveStatus}
                              onChange={(e) =>
                                onUpdateRenewalStatus(
                                  customer.id,
                                  e.target.value as RenewalStatus
                                )
                              }
                              className="px-2 py-1 text-xs font-medium rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                            >
                              {RENEWAL_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <RenewalStatusBadge status={effectiveStatus} />
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            data-testid={`renew-btn-${customer.id}`}
                            onClick={() => onMarkRenewed(customer.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark as Renewed (+1 Month)</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
              {filteredItems.map(({ customer, daysRemaining, effectiveStatus }) => (
                <div key={customer.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {customer.customerName}
                      </p>
                      <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 mt-0.5">
                        {formatBdPhoneDisplay(customer.phone)}
                      </p>
                    </div>
                    <RenewalStatusBadge status={effectiveStatus} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/60 rounded-lg p-3 border border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-[11px] text-slate-400 block">Agent</span>
                      <span className="font-medium">{customer.assignedAgentName ?? 'Unassigned'}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Days Remaining</span>
                      <span
                        className={`font-mono font-semibold ${
                          daysRemaining < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : daysRemaining <= 2
                            ? 'text-amber-600 dark:text-amber-300'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {formatDaysRemainingLabel(daysRemaining)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Confirmed</span>
                      <span className="font-mono">{customer.confirmedDate}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Renewal Date</span>
                      <span className="font-mono font-semibold">{customer.renewalDate}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={buildTelUrl(customer.phone)}
                      aria-label={`Call ${customer.customerName}`}
                      className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Call</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => openWhatsAppChat(customer.phone)}
                      aria-label={`WhatsApp ${customer.customerName}`}
                      className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-xs font-semibold cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>WhatsApp</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onMarkRenewed(customer.id)}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Mark as Renewed (+1 Month)</span>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
