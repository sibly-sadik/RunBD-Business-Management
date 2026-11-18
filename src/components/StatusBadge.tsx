import {
  CheckCircle2,
  Clock,
  PhoneMissed,
  PhoneOff,
  Sparkles,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { CallStatus } from '../types';

interface StatusBadgeProps {
  status: CallStatus;
  compact?: boolean;
}

const STATUS_STYLES: Record<
  CallStatus,
  {
    bg: string;
    text: string;
    border: string;
    Icon: typeof Clock;
  }
> = {
  Pending: {
    bg: 'bg-slate-100 dark:bg-slate-800/80',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
    Icon: Clock,
  },
  Interested: {
    bg: 'bg-sky-50 dark:bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-200 dark:border-sky-500/30',
    Icon: Sparkles,
  },
  'Order Confirmed': {
    bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-500/30',
    Icon: CheckCircle2,
  },
  'Busy / Call Later': {
    bg: 'bg-amber-50 dark:bg-amber-500/15',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-500/30',
    Icon: PhoneMissed,
  },
  'Not Interested': {
    bg: 'bg-rose-50 dark:bg-rose-500/15',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-500/30',
    Icon: XCircle,
  },
  'Switched Off / No Answer': {
    bg: 'bg-orange-50 dark:bg-orange-500/15',
    text: 'text-orange-700 dark:text-orange-300',
    border: 'border-orange-200 dark:border-orange-500/30',
    Icon: PhoneOff,
  },
  'Wrong Number': {
    bg: 'bg-red-50 dark:bg-red-500/15',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-500/30',
    Icon: AlertTriangle,
  },
};

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const style = STATUS_STYLES[status];
  const Icon = style.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap ${
        compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      } ${style.bg} ${style.text} ${style.border}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}
