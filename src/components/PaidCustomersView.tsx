import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  BellRing,
  CalendarCheck2,
  CheckCircle2,
  Download,
  MessageCircle,
  Package,
  Pencil,
  PhoneCall,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { PaidCustomer, RENEWAL_STATUSES, RenewalStatus, User } from '../types';
import {
  addDaysToYmd,
  buildTelUrl,
  computeDaysRemaining,
  computeEffectiveRenewalStatus,
  formatBdPhoneDisplay,
  generatePaidCustomersCsv,
  getDhakaDateString,
  normalizeBdPhone,
  openWhatsAppChat,
  PAID_PACKAGE_PRESETS,
  PaidCustomerEditInput,
} from '../utils/leadLogic';
import { CopyPhoneButton } from './CopyPhoneButton';

interface PaidCustomersViewProps {
  currentUser: User;
  agents: User[];
  paidCustomers: PaidCustomer[];
  onMarkRenewed?: (customerId: string) => void;
  onUpdateRenewalStatus?: (customerId: string, status: RenewalStatus) => void;
  onUpdatePaidCustomer?: (customerId: string, updates: PaidCustomerEditInput) => void;
  onDeletePaidCustomer?: (customerId: string) => void;
  onExportCsv?: () => void;
  onPhoneCopied?: (cleanPhone: string) => void;
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

function PackageBadge({
  packageName,
  testId,
}: {
  packageName?: string;
  testId?: string;
}) {
  const trimmed = (packageName ?? '').trim();
  if (!trimmed) {
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/70 text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
      >
        Not Assigned
      </span>
    );
  }
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/12 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap"
    >
      <Package className="w-3 h-3 shrink-0" />
      <span>{trimmed}</span>
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
  onUpdatePaidCustomer,
  onDeletePaidCustomer,
  onExportCsv,
  onPhoneCopied,
}: PaidCustomersViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterMode>('ALL');
  const [agentFilter, setAgentFilter] = useState<string>('ALL');

  // Admin Edit / Set Package modal state
  const [editingCustomer, setEditingCustomer] = useState<PaidCustomer | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAgentId, setEditAgentId] = useState('');
  const [editPackage, setEditPackage] = useState('');
  const [editConfirmedDate, setEditConfirmedDate] = useState('');
  const [editRenewalDate, setEditRenewalDate] = useState('');
  const [editStatus, setEditStatus] = useState<RenewalStatus>('Active');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Admin Delete confirmation modal state
  const [deletingCustomer, setDeletingCustomer] = useState<PaidCustomer | null>(null);

  const isAdmin = currentUser.role === 'admin';

  useEffect(() => {
    if (!editingCustomer && !deletingCustomer) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingCustomer(null);
        setDeletingCustomer(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingCustomer, deletingCustomer]);

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
          (customer.packageName ?? '').toLowerCase().includes(q) ||
          (customer.assignedAgentName ?? '').toLowerCase().includes(q) ||
          (customer.notes ?? '').toLowerCase().includes(q)
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
    a.download = `runbd_paid_customers_${getDhakaDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onExportCsv?.();
  };

  const openEditModal = (customer: PaidCustomer) => {
    if (!isAdmin) return;
    setEditingCustomer(customer);
    setEditName(customer.customerName);
    setEditPhone(customer.phone);
    setEditAgentId(customer.assignedAgentId ?? '');
    setEditPackage(customer.packageName ?? '');
    setEditConfirmedDate(customer.confirmedDate);
    setEditRenewalDate(customer.renewalDate);
    setEditStatus(customer.renewalStatus);
    setEditNotes(customer.notes ?? '');
    setEditError(null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingCustomer || !onUpdatePaidCustomer) return;

    const cleanName = editName.trim();
    if (!cleanName) {
      setEditError('Customer name is required.');
      return;
    }

    const normalizedPhone = normalizeBdPhone(editPhone);
    if (!normalizedPhone) {
      setEditError('Enter a valid Bangladeshi phone number (e.g. 01712345678).');
      return;
    }

    const matchedAgent = editAgentId
      ? agents.find((a) => a.id === editAgentId) ?? null
      : null;

    const assignedAgentId = editAgentId ? matchedAgent?.id ?? editAgentId : null;
    const assignedAgentName = editAgentId
      ? matchedAgent?.name ?? editingCustomer.assignedAgentName ?? null
      : null;

    onUpdatePaidCustomer(editingCustomer.id, {
      customerName: cleanName,
      phone: normalizedPhone,
      assignedAgentId,
      assignedAgentName,
      confirmedDate: editConfirmedDate || editingCustomer.confirmedDate,
      renewalDate: editRenewalDate || editingCustomer.renewalDate,
      renewalStatus: editStatus,
      packageName: editPackage.trim(),
      notes: editNotes.trim(),
    });
    setEditingCustomer(null);
  };

  const handleConfirmDelete = () => {
    if (!isAdmin || !deletingCustomer || !onDeletePaidCustomer) return;
    onDeletePaidCustomer(deletingCustomer.id);
    setDeletingCustomer(null);
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
            {isAdmin
              ? 'Manage assigned packages, renewals, and customer details · Synced across Agent view, Supabase, and Google Sheets.'
              : 'Read-only view of your confirmed Paid Customers, assigned packages, and 1-month renewal schedule.'}
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
              placeholder="Search customer, phone, package, or agent..."
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
                    <th className="py-3 px-2.5 font-semibold">Customer</th>
                    <th className="py-3 px-2 font-semibold">Phone</th>
                    <th className="py-3 px-2 font-semibold">Agent</th>
                    <th className="py-3 px-2 font-semibold">Package</th>
                    <th className="py-3 px-2 font-semibold">Renewal / Confirmed</th>
                    <th className="py-3 px-2 font-semibold whitespace-nowrap">Days Left</th>
                    <th className="py-3 px-2 font-semibold whitespace-nowrap">Status</th>
                    {isAdmin && (
                      <th className="py-3 px-2.5 font-semibold text-right">Action</th>
                    )}
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
                        <td className="py-3 px-2.5 max-w-[155px]">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 leading-snug truncate">
                            {customer.customerName}
                          </div>
                          {customer.notes && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {customer.notes}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {formatBdPhoneDisplay(customer.phone)}
                            </span>
                            <CopyPhoneButton
                              phone={customer.phone}
                              customerName={customer.customerName}
                              onCopied={onPhoneCopied}
                            />
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
                        <td className="py-3 px-2 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {customer.assignedAgentName ?? 'Unassigned'}
                        </td>
                        <td className="py-3 px-2">
                          <PackageBadge
                            packageName={customer.packageName}
                            testId={`paid-package-${customer.id}`}
                          />
                        </td>
                        <td className="py-3 px-2 font-mono text-xs tabular-nums whitespace-nowrap">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {customer.renewalDate}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Conf: {customer.confirmedDate}
                          </div>
                        </td>
                        <td className="py-3 px-2 whitespace-nowrap">
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
                        <td className="py-3 px-2">
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
                              className="px-1.5 py-1 text-xs font-medium rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
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
                        {isAdmin && (
                          <td className="py-3 px-2.5 text-right">
                            <div className="flex flex-col items-end gap-1.5">
                              <div className="inline-flex items-center gap-1.5">
                                {onUpdatePaidCustomer && (
                                  <button
                                    type="button"
                                    data-testid={`edit-paid-btn-${customer.id}`}
                                    aria-label={`Edit and set package for ${customer.customerName}`}
                                    onClick={() => openEditModal(customer)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    <span>Edit / Package</span>
                                  </button>
                                )}
                                {onDeletePaidCustomer && (
                                  <button
                                    type="button"
                                    data-testid={`delete-paid-btn-${customer.id}`}
                                    aria-label={`Delete ${customer.customerName}`}
                                    onClick={() => setDeletingCustomer(customer)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-300/80 dark:border-rose-500/40 bg-rose-50/70 dark:bg-rose-500/10 hover:bg-rose-600 hover:text-white dark:hover:bg-rose-600 text-rose-700 dark:text-rose-300 text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Delete</span>
                                  </button>
                                )}
                              </div>
                              {onMarkRenewed && (
                                <button
                                  type="button"
                                  data-testid={`renew-btn-${customer.id}`}
                                  aria-label={`Mark ${customer.customerName} as renewed (+1 Month)`}
                                  onClick={() => onMarkRenewed(customer.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Mark as Renewed (+1 Month)</span>
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
              {filteredItems.map(({ customer, daysRemaining, effectiveStatus }) => (
                <div
                  key={customer.id}
                  data-testid={`paid-card-${customer.id}`}
                  className="p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {customer.customerName}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {formatBdPhoneDisplay(customer.phone)}
                        </p>
                        <CopyPhoneButton
                          phone={customer.phone}
                          customerName={customer.customerName}
                          onCopied={onPhoneCopied}
                        />
                      </div>
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
                    <div className="col-span-2 pt-1 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400">Package</span>
                      <PackageBadge
                        packageName={customer.packageName}
                        testId={`mobile-paid-package-${customer.id}`}
                      />
                    </div>
                    {customer.notes && (
                      <div className="col-span-2 text-[11px] text-slate-500 dark:text-slate-400">
                        {customer.notes}
                      </div>
                    )}
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

                  {isAdmin && (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        {onUpdatePaidCustomer && (
                          <button
                            type="button"
                            data-testid={`mobile-edit-paid-btn-${customer.id}`}
                            onClick={() => openEditModal(customer)}
                            className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit / Set Package</span>
                          </button>
                        )}
                        {onDeletePaidCustomer && (
                          <button
                            type="button"
                            data-testid={`mobile-delete-paid-btn-${customer.id}`}
                            onClick={() => setDeletingCustomer(customer)}
                            className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-rose-300 dark:border-rose-500/40 bg-rose-50/70 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs font-semibold cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                      {onMarkRenewed && (
                        <button
                          type="button"
                          data-testid={`mobile-renew-btn-${customer.id}`}
                          onClick={() => onMarkRenewed(customer.id)}
                          className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark as Renewed (+1 Month)</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Admin-Only Edit / Set Package Modal */}
      {isAdmin && editingCustomer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-paid-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingCustomer(null);
          }}
        >
          <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2
                  id="edit-paid-modal-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  Edit &amp; Set Package — {editingCustomer.customerName}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Updates sync immediately to Agent Paid Customers, Supabase, and Google Sheets.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                aria-label="Close edit paid customer modal"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {editError && (
                <div
                  role="alert"
                  className="rounded-lg px-3.5 py-2.5 text-xs font-medium bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300"
                >
                  {editError}
                </div>
              )}

              {/* Package Preset Selector + Custom Input */}
              <div className="rounded-xl p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="edit-paid-package"
                    className="text-xs font-semibold text-slate-800 dark:text-slate-200"
                  >
                    Assigned Package
                  </label>
                  {editPackage && (
                    <button
                      type="button"
                      onClick={() => setEditPackage('')}
                      className="text-[11px] font-medium text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {PAID_PACKAGE_PRESETS.map((preset) => {
                    const active = editPackage.trim() === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setEditPackage(preset)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                          active
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-emerald-500'
                        }`}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>

                <input
                  id="edit-paid-package"
                  type="text"
                  value={editPackage}
                  onChange={(e) => setEditPackage(e.target.value)}
                  placeholder="Or type custom package / price tier (e.g., 1-Month Pro - 1500 BDT)"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label
                    htmlFor="edit-paid-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Customer Name *
                  </label>
                  <input
                    id="edit-paid-name"
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-paid-phone"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Phone *
                  </label>
                  <input
                    id="edit-paid-phone"
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-paid-agent"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Assigned Agent
                  </label>
                  <select
                    id="edit-paid-agent"
                    value={editAgentId}
                    onChange={(e) => setEditAgentId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Unassigned</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="edit-paid-status"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Renewal Status
                  </label>
                  <select
                    id="edit-paid-status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as RenewalStatus)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {RENEWAL_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="edit-paid-confirmed-date"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Confirmed Date
                  </label>
                  <input
                    id="edit-paid-confirmed-date"
                    type="date"
                    value={editConfirmedDate}
                    onChange={(e) => setEditConfirmedDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="edit-paid-renewal-date"
                      className="text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Renewal Date
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setEditRenewalDate(
                          addDaysToYmd(
                            editConfirmedDate || editingCustomer.confirmedDate,
                            30
                          )
                        )
                      }
                      className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      +30d from Confirmed
                    </button>
                  </div>
                  <input
                    id="edit-paid-renewal-date"
                    type="date"
                    value={editRenewalDate}
                    onChange={(e) => setEditRenewalDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="edit-paid-notes"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Notes
                </label>
                <textarea
                  id="edit-paid-notes"
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Optional payment or package notes..."
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-paid-edit-btn"
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin-Only Delete Confirmation Modal */}
      {isAdmin && deletingCustomer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-paid-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeletingCustomer(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2
                id="delete-paid-modal-title"
                className="text-base font-semibold text-slate-900 dark:text-white"
              >
                Delete Paid Customer
              </h2>
              <button
                type="button"
                onClick={() => setDeletingCustomer(null)}
                aria-label="Close delete confirmation modal"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Remove{' '}
                <strong className="text-slate-900 dark:text-white">
                  {deletingCustomer.customerName}
                </strong>{' '}
                (<span className="font-mono">{formatBdPhoneDisplay(deletingCustomer.phone)}</span>)
                from Paid Customers?
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This deletes the entry from Admin &amp; Agent Paid Customers, Supabase, and Google
                Sheets (<code className="font-mono">Paid_Customers</code> and{' '}
                <code className="font-mono">Paid_&lt;Agent&gt;</code>) so it will not reappear on
                sync.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingCustomer(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-delete-paid-btn"
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Delete Paid Customer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
