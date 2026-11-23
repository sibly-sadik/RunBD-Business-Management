import { useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import { AuditAction, AuditLog } from '../types';
import { formatDateTime } from '../utils/leadLogic';

interface AdminAuditViewProps {
  auditLogs: AuditLog[];
}

const ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN: 'User Login',
  LOGOUT: 'User Logout',
  LEAD_CREATED: 'Lead Created',
  BULK_IMPORT: 'Bulk CSV Import',
  STATUS_UPDATED: 'Status Updated',
  LEAD_REASSIGNED: 'Lead Reassigned',
  SETTINGS_UPDATED: 'Settings Updated',
  SHEETS_SYNCED: 'Sheets Synced',
  POST_LINK_LOGGED: 'Post Link Logged',
  PAID_CUSTOMER_ADDED: 'Paid Customer Added',
  PAID_CUSTOMER_RENEWED: 'Customer Renewed (+1 Mo)',
  TEAM_MEMBER_ADDED: 'Team Member Added',
  TEAM_MEMBER_UPDATED: 'Team Member Updated',
  TEAM_MEMBER_PASSWORD_RESET: 'Password Reset',
  TEAM_MEMBER_STATUS_CHANGED: 'Member Status Changed',
  TEAM_MEMBER_REMOVED: 'Team Member Removed',
};

export function AdminAuditView({ auditLogs }: AdminAuditViewProps) {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<AuditAction | 'ALL'>('ALL');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...auditLogs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .filter((log) => {
        if (actionFilter !== 'ALL' && log.action !== actionFilter) return false;
        if (!q) return true;
        return (
          log.actorName.toLowerCase().includes(q) ||
          log.details.toLowerCase().includes(q) ||
          ACTION_LABELS[log.action].toLowerCase().includes(q)
        );
      });
  }, [auditLogs, search, actionFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          System Audit Logs
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Chronological record of user logins, lead creations, call status updates, and reassignments.
        </p>
      </div>

      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search audit logs"
              placeholder="Search actor or details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center gap-3">
            <select
              aria-label="Filter audit logs by action"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as AuditAction | 'ALL')}
              className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">All Events</option>
              {(Object.keys(ACTION_LABELS) as AuditAction[]).map((key) => (
                <option key={key} value={key}>
                  {ACTION_LABELS[key]}
                </option>
              ))}
            </select>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {filtered.length} entries
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            <History className="w-6 h-6 mx-auto mb-2 text-slate-400" />
            No audit entries match your current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4 font-semibold">Timestamp</th>
                  <th className="py-3 px-4 font-semibold">User</th>
                  <th className="py-3 px-4 font-semibold">Event</th>
                  <th className="py-3 px-4 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {log.actorName}
                      </span>
                      <span className="ml-2 text-xs text-slate-400 capitalize">
                        ({log.actorRole})
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      {ACTION_LABELS[log.action]}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                      {log.details}
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
