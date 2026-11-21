import { AlertTriangle, ArrowRight, BellRing, CheckCircle2, PhoneCall } from 'lucide-react';
import { DueRenewalItem, formatBdPhoneDisplay } from '../utils/leadLogic';

interface RenewalAlertBannerProps {
  dueItems: DueRenewalItem[];
  audience: 'admin' | 'agent';
  onMarkRenewed: (customerId: string) => void;
  onViewAllPaidCustomers: () => void;
}

function formatDueLabel(daysRemaining: number): string {
  if (daysRemaining <= 0) return 'Due Today';
  if (daysRemaining === 1) return '1 Day Left';
  return `${daysRemaining} Days Left`;
}

export function RenewalAlertBanner({
  dueItems,
  audience,
  onMarkRenewed,
  onViewAllPaidCustomers,
}: RenewalAlertBannerProps) {
  if (dueItems.length === 0) return null;

  return (
    <section
      role="region"
      aria-label="2-Day Advance Renewal Alerts"
      data-testid="renewal-alert-banner"
      className="rounded-2xl border border-amber-300 dark:border-amber-500/40 bg-amber-50/90 dark:bg-amber-950/35 p-4 sm:p-5 shadow-xs space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-amber-950 dark:text-amber-100">
                2-Day Advance Renewal Alert
              </h2>
              <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-amber-800 dark:text-amber-200 bg-amber-500/20 px-2 py-0.5 rounded">
                <AlertTriangle className="w-3 h-3" />
                <span>
                  {dueItems.length} customer{dueItems.length === 1 ? '' : 's'} due
                </span>
              </span>
            </div>
            <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mt-0.5">
              {audience === 'admin'
                ? 'Active paid customers within 2 days of completing their 1-month subscription cycle.'
                : 'Your assigned paid customers within 2 days of their 1-month renewal date. Contact them to renew.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onViewAllPaidCustomers}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-400/60 dark:border-amber-500/40 bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-900 text-xs font-semibold text-amber-900 dark:text-amber-200 transition-colors whitespace-nowrap self-start cursor-pointer"
        >
          <span>Open Paid Customers</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {dueItems.map(({ customer, daysRemaining }) => (
          <div
            key={customer.id}
            data-testid={`banner-item-${customer.id}`}
            className="rounded-xl bg-white/95 dark:bg-slate-900/90 border border-amber-200 dark:border-amber-500/30 p-3.5 flex flex-col justify-between gap-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {customer.customerName}
                </p>
                <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <PhoneCall className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{formatBdPhoneDisplay(customer.phone)}</span>
                </p>
              </div>
              <span
                className={`text-[11px] font-mono font-semibold tabular-nums px-2 py-0.5 rounded whitespace-nowrap shrink-0 ${
                  daysRemaining <= 0
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                    : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                }`}
              >
                {formatDueLabel(daysRemaining)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                Renewal: <strong className="font-mono text-slate-700 dark:text-slate-200">{customer.renewalDate}</strong>
              </span>
              {audience === 'admin' && (
                <span className="truncate">
                  Agent: <strong className="text-slate-700 dark:text-slate-200">{customer.assignedAgentName ?? 'Unassigned'}</strong>
                </span>
              )}
            </div>

            <button
              type="button"
              data-testid={`banner-renew-${customer.id}`}
              onClick={() => onMarkRenewed(customer.id)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Mark as Renewed (+1 Month)</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
