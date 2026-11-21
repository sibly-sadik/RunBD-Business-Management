import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminAuditView } from './components/AdminAuditView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AdminFinalDailySummaryView } from './components/AdminFinalDailySummaryView';
import { AdminLeadsView } from './components/AdminLeadsView';
import { AdminSheetsView } from './components/AdminSheetsView';
import { AgentTodayCallsView } from './components/AgentTodayCallsView';
import { AgentWorkspaceView } from './components/AgentWorkspaceView';
import { DataCollectionView } from './components/DataCollectionView';
import { KawsarPostsView } from './components/KawsarPostsView';
import { Layout, NavTab } from './components/Layout';
import { LoginScreen } from './components/LoginScreen';
import { PaidCustomersView } from './components/PaidCustomersView';
import { ToastContainer } from './components/ToastContainer';
import { CALL_CENTER_AGENTS, DATA_COLLECTORS, DEMO_USERS } from './data/seedData';
import {
  AppSettings,
  AuditAction,
  AuditLog,
  CallLog,
  CallStatus,
  ContentPost,
  CsvPreviewRow,
  DuplicateAttempt,
  Lead,
  PaidCustomer,
  RenewalStatus,
  SyncStatus,
  ToastMessage,
  User,
} from './types';
import {
  assignLeadsRoundRobin,
  computeDashboardMetrics,
  computeFinalDailySummary,
  computeKawsarPostStats,
  createPaidCustomerFromLead,
  filterTodayCallLogs,
  filterTodayLeads,
  filterTodayPosts,
  findDuplicateLead,
  findDuplicatePost,
  formatShortDate,
  getAgentTodayCallLogs,
  getDueRenewalCustomers,
  getLocalDateString,
  getScheduledFollowUps,
  isValidPostUrl,
  normalizeBdPhone,
  normalizeFacebookUrl,
  normalizePostUrl,
  renewPaidCustomer,
} from './utils/leadLogic';
import {
  logoutFromServer,
  restoreServerSession,
} from './utils/apiSync';
import {
  checkLeadDuplicateInSupabase,
  checkPostDuplicateInSupabase,
  createLeadInSupabase,
  createPostInSupabase,
  fetchBootstrapFromSupabase,
  importLeadsBatchInSupabase,
  saveAuditLogInSupabase,
  saveCallLogInSupabase,
  saveDuplicateAttemptInSupabase,
  saveSettingsInSupabase,
  syncPulledRecordsToSupabase,
  updateLeadInSupabase,
  upsertPaidCustomerInSupabase,
} from './utils/supabaseSync';
import {
  detectLeadDuplicatesInList,
  detectPostDuplicatesInList,
  isLegacyWebhookUrl,
  mergeRemoteCallLogs,
  mergeRemoteContentPosts,
  mergeRemoteDuplicateAttempts,
  mergeRemoteLeads,
  mergeRemotePaidCustomers,
  resolveWebhookUrl,
  SheetDuplicateReport,
} from './utils/sheetsSync';
import {
  checkLeadDuplicateInSheets,
  checkPostDuplicateInSheets,
  DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL,
  pullFromGoogleSheetsWebhook,
  pushToGoogleSheetsWebhook,
  SheetsSyncPayload,
  storage,
} from './utils/storage';

function defaultTabForRole(role: User['role']): NavTab {
  if (role === 'admin') return 'admin-overview';
  if (role === 'agent') return 'agent-workspace';
  if (role === 'poster') return 'kawsar-posts';
  return 'data-collection';
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => storage.getTheme());
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('admin-overview');

  const [leads, setLeads] = useState<Lead[]>(() => storage.getLeads());
  const [callLogs, setCallLogs] = useState<CallLog[]>(() => storage.getCallLogs());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => storage.getAuditLogs());
  const [duplicateAttempts, setDuplicateAttempts] = useState<DuplicateAttempt[]>(() =>
    storage.getDuplicates()
  );
  const [contentPosts, setContentPosts] = useState<ContentPost[]>(() =>
    storage.getContentPosts()
  );
  const [paidCustomers, setPaidCustomers] = useState<PaidCustomer[]>(() =>
    storage.getPaidCustomers()
  );
  const [settings, setSettings] = useState<AppSettings>(() => storage.getSettings());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    storage.getSettings().googleSheetsWebhookUrl ? 'synced' : 'offline'
  );
  const [sheetDuplicateReport, setSheetDuplicateReport] = useState<SheetDuplicateReport | null>(
    null
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const leadsRef = useRef(leads);
  const callLogsRef = useRef(callLogs);
  const contentPostsRef = useRef(contentPosts);
  const paidCustomersRef = useRef(paidCustomers);

  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

  useEffect(() => {
    callLogsRef.current = callLogs;
  }, [callLogs]);

  useEffect(() => {
    contentPostsRef.current = contentPosts;
  }, [contentPosts]);

  useEffect(() => {
    paidCustomersRef.current = paidCustomers;
  }, [paidCustomers]);

  // Sync theme class onto <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    storage.saveTheme(theme);
  }, [theme]);

  // Persist core collections whenever they change
  useEffect(() => {
    storage.saveLeads(leads);
  }, [leads]);

  useEffect(() => {
    storage.saveCallLogs(callLogs);
  }, [callLogs]);

  useEffect(() => {
    storage.saveAuditLogs(auditLogs);
  }, [auditLogs]);

  useEffect(() => {
    storage.saveDuplicates(duplicateAttempts);
  }, [duplicateAttempts]);

  useEffect(() => {
    storage.saveContentPosts(contentPosts);
  }, [contentPosts]);

  useEffect(() => {
    storage.savePaidCustomers(paidCustomers);
  }, [paidCustomers]);

  useEffect(() => {
    storage.saveSettings(settings);
  }, [settings]);

  const addToast = useCallback(
    (type: ToastMessage['type'], title: string, message?: string) => {
      const id = makeId('TST');
      setToasts((prev) => [...prev.slice(-1), { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3200);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Restore verified server session on reload without storing tokens in localStorage
  useEffect(() => {
    if (!storage.getSessionUserId()) return;
    let active = true;
    void restoreServerSession().then((serverUser) => {
      if (!active) return;
      if (serverUser) {
        setCurrentUser(serverUser);
        setActiveTab(defaultTabForRole(serverUser.role));
      } else {
        storage.saveSessionUserId(null);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Load role-scoped workspace data directly from Supabase PostgreSQL when signed in
  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    const todayYmd = getLocalDateString();

    void fetchBootstrapFromSupabase(currentUser.role, todayYmd).then((res) => {
      if (!active) return;
      if (!res.ok) {
        if (res.schemaMissing && currentUser.role === 'admin') {
          addToast(
            'warning',
            'Supabase Schema Setup Needed',
            'Run supabase/schema.sql in Supabase SQL Editor (copy from Sync & Database Settings).'
          );
        }
        return;
      }

      const isAdmin = currentUser.role === 'admin';
      if (res.leads) {
        setLeads((prev) => {
          const base = isAdmin ? prev : filterTodayLeads(prev);
          const merged = mergeRemoteLeads(base, res.leads!);
          leadsRef.current = merged;
          return merged;
        });
      }
      if (res.callLogs) {
        setCallLogs((prev) => {
          const base = isAdmin ? prev : filterTodayCallLogs(prev);
          const merged = mergeRemoteCallLogs(base, res.callLogs!);
          callLogsRef.current = merged;
          return merged;
        });
      }
      if (res.contentPosts) {
        setContentPosts((prev) => {
          const base = isAdmin ? prev : filterTodayPosts(prev);
          const merged = mergeRemoteContentPosts(base, res.contentPosts!);
          contentPostsRef.current = merged;
          return merged;
        });
      }
      if (res.paidCustomers) {
        setPaidCustomers((prev) => {
          const merged = mergeRemotePaidCustomers(prev, res.paidCustomers!);
          paidCustomersRef.current = merged;
          return merged;
        });
      }
      if (res.duplicateAttempts) {
        setDuplicateAttempts((prev) =>
          mergeRemoteDuplicateAttempts(prev, res.duplicateAttempts!)
        );
      }
      if (res.auditLogs && res.auditLogs.length > 0 && isAdmin) {
        setAuditLogs(res.auditLogs);
      }
      if (res.settings) {
        const remoteUrl = res.settings.googleSheetsWebhookUrl?.trim() ?? '';
        setSettings((prev) => ({
          ...prev,
          ...res.settings,
          googleSheetsWebhookUrl:
            remoteUrl && !isLegacyWebhookUrl(remoteUrl)
              ? remoteUrl
              : resolveWebhookUrl(
                  prev.googleSheetsWebhookUrl,
                  DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL
                ),
        }));
      }
    });

    return () => {
      active = false;
    };
  }, [addToast, currentUser]);

  const appendAudit = useCallback(
    (actor: User, action: AuditAction, details: string) => {
      const entry: AuditLog = {
        id: makeId('AUD'),
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action,
        details,
        timestamp: new Date().toISOString(),
      };
      setAuditLogs((prev) => [entry, ...prev]);
      void saveAuditLogInSupabase(entry).catch(() => {});
    },
    []
  );

  const buildDailySummary = useCallback(
    (nextLeads: Lead[], nextCallLogs: CallLog[]) => {
      const m = computeDashboardMetrics(nextLeads, nextCallLogs, {
        preset: 'today',
        startDate: '',
        endDate: '',
      });
      return {
        date: getLocalDateString(),
        totalLeads: m.totalLeads,
        callsMadeToday: m.callsMadeToday,
        orderConfirmedCount: m.orderConfirmedCount,
        interestedCount: m.interestedCount,
        conversionRate: m.conversionRate,
      };
    },
    []
  );

  const syncRequestIdRef = useRef(0);

  const triggerRealtimeSync = useCallback(
    async (
      webhookUrl: string,
      payload: Omit<SheetsSyncPayload, 'dailySummary' | 'finalDailySummary'>,
      nextLeads: Lead[],
      nextCallLogs: CallLog[],
      nextContentPosts: ContentPost[] = contentPosts
    ) => {
      if (!webhookUrl.trim()) {
        setSyncStatus('offline');
        return { ok: false };
      }

      const reqId = ++syncRequestIdRef.current;
      setSyncStatus('syncing');
      try {
        const res = await pushToGoogleSheetsWebhook(webhookUrl, {
          ...payload,
          dailySummary: buildDailySummary(nextLeads, nextCallLogs),
          finalDailySummary: computeFinalDailySummary(
            CALL_CENTER_AGENTS,
            DATA_COLLECTORS,
            nextLeads,
            nextCallLogs,
            nextContentPosts
          ),
        });

        if (reqId === syncRequestIdRef.current) {
          if (res.ok) {
            setSyncStatus('synced');
            setSettings((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
          } else {
            setSyncStatus('error');
          }
        }
        return res;
      } catch (err) {
        if (reqId === syncRequestIdRef.current) {
          setSyncStatus('error');
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Network error syncing to Google Sheets',
        };
      }
    },
    [buildDailySummary, contentPosts]
  );

  const applyPulledSheetData = useCallback(
    (
      remoteLeads: Partial<Lead>[],
      remoteCallLogs: Partial<CallLog>[],
      remotePosts: Partial<ContentPost>[],
      remotePaidCustomers: Partial<PaidCustomer>[] = []
    ) => {
      const baseLeads = mergeRemoteLeads(leadsRef.current, storage.getLeads());
      const baseCallLogs = mergeRemoteCallLogs(callLogsRef.current, storage.getCallLogs());
      const basePosts = mergeRemoteContentPosts(
        contentPostsRef.current,
        storage.getContentPosts()
      );
      const basePaid = mergeRemotePaidCustomers(
        paidCustomersRef.current,
        storage.getPaidCustomers()
      );

      const mergedLeads =
        remoteLeads.length > 0 ? mergeRemoteLeads(baseLeads, remoteLeads) : baseLeads;
      const mergedCallLogs =
        remoteCallLogs.length > 0
          ? mergeRemoteCallLogs(baseCallLogs, remoteCallLogs)
          : baseCallLogs;
      const mergedPosts =
        remotePosts.length > 0 ? mergeRemoteContentPosts(basePosts, remotePosts) : basePosts;
      const mergedPaidCustomers =
        remotePaidCustomers.length > 0
          ? mergeRemotePaidCustomers(basePaid, remotePaidCustomers)
          : basePaid;

      // Persist newly pulled leads/logs/posts/paidCustomers from Google Sheets to PostgreSQL
      const baseLeadMap = new Map(baseLeads.map((l) => [l.id, l]));
      const leadsToSave = mergedLeads.filter((lead) => {
        if (!lead.customerName.trim()) return false;
        const prev = baseLeadMap.get(lead.id);
        return !prev || prev.updatedAt !== lead.updatedAt;
      });

      const baseLogIds = new Set(baseCallLogs.map((c) => c.id));
      const logsToSave = mergedCallLogs.filter((log) => !baseLogIds.has(log.id));

      const basePostIds = new Set(basePosts.map((p) => p.id));
      const postsToSave = mergedPosts.filter(
        (post) =>
          !basePostIds.has(post.id) &&
          (post.facebookLink.length > 0 || post.websiteLink.length > 0)
      );

      const basePaidMap = new Map(basePaid.map((c) => [c.id, c]));
      const paidToSave = mergedPaidCustomers.filter((customer) => {
        if (!customer.customerName.trim()) return false;
        const prev = basePaidMap.get(customer.id);
        return !prev || prev.updatedAt !== customer.updatedAt;
      });

      if (
        leadsToSave.length > 0 ||
        logsToSave.length > 0 ||
        postsToSave.length > 0 ||
        paidToSave.length > 0
      ) {
        void syncPulledRecordsToSupabase({
          leads: leadsToSave,
          callLogs: logsToSave,
          contentPosts: postsToSave,
          paidCustomers: paidToSave,
        }).catch(() => {});
      }

      leadsRef.current = mergedLeads;
      callLogsRef.current = mergedCallLogs;
      contentPostsRef.current = mergedPosts;
      paidCustomersRef.current = mergedPaidCustomers;
      setLeads(mergedLeads);
      setCallLogs(mergedCallLogs);
      setContentPosts(mergedPosts);
      setPaidCustomers(mergedPaidCustomers);

      const report: SheetDuplicateReport = {
        checkedAt: new Date().toISOString(),
        leadDuplicates: detectLeadDuplicatesInList(mergedLeads),
        postDuplicates: detectPostDuplicatesInList(mergedPosts),
      };
      setSheetDuplicateReport(report);

      return { mergedLeads, mergedCallLogs, mergedPosts, mergedPaidCustomers, report };
    },
    []
  );

  const syncFromSheets = useCallback(
    async (
      webhookUrl: string,
      options?: { notify?: boolean; scope?: 'today' | 'all' }
    ) => {
      const targetUrl = webhookUrl.trim();
      if (!targetUrl) {
        setSyncStatus('offline');
        return { ok: false, pulledData: false };
      }

      const reqId = ++syncRequestIdRef.current;
      const scope = options?.scope ?? 'today';
      setSyncStatus('syncing');

      try {
        const pullRes = await pullFromGoogleSheetsWebhook(targetUrl, { scope });

        if (pullRes.ok && pullRes.pulledData && pullRes.data) {
          const {
            leads: remoteLeads,
            callLogs: remoteCallLogs,
            contentPosts: remotePosts,
            paidCustomers: remotePaidCustomers,
          } = pullRes.data;
          const { report } = applyPulledSheetData(
            remoteLeads,
            remoteCallLogs,
            remotePosts,
            remotePaidCustomers
          );
          const dupTotal = report.leadDuplicates.length + report.postDuplicates.length;

          if (reqId === syncRequestIdRef.current) {
            setSyncStatus('synced');
          }
          setSettings((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
          if (options?.notify) {
            addToast(
              'success',
              "Synced Today's Leads & Paid Customers",
              `Pulled ${remoteLeads.length} today lead(s), ${remoteCallLogs.length} log(s), and ${remotePaidCustomers.length} paid customer(s).`
            );
            if (dupTotal > 0) {
              addToast(
                'warning',
                'Sheet Duplicates Flagged',
                `Found ${report.leadDuplicates.length} duplicate lead(s) and ${report.postDuplicates.length} duplicate link(s) in synced data.`
              );
            }
          }
          return { ok: true, pulledData: true };
        }

        // Fallback to a non-destructive connectivity check when doGet is not deployed yet
        const pingRes = await pushToGoogleSheetsWebhook(targetUrl, {
          event: 'CONNECT_CHECK',
          dailySummary: {
            date: getLocalDateString(),
            totalLeads: 0,
            callsMadeToday: 0,
            orderConfirmedCount: 0,
            interestedCount: 0,
            conversionRate: 0,
          },
        });

        if (pingRes.ok) {
          if (reqId === syncRequestIdRef.current) {
            setSyncStatus('synced');
          }
          setSettings((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
          if (options?.notify) {
            addToast(
              'success',
              'Google Sheets Connected',
              'Webhook connection verified. Deploy doGet in Code.gs to enable two-way pull.'
            );
          }
          return { ok: true, pulledData: false };
        }

        if (reqId === syncRequestIdRef.current) {
          setSyncStatus('error');
        }
        if (options?.notify) {
          addToast(
            'error',
            'Sync Failed',
            pingRes.error ?? pullRes.error ?? 'Unable to reach Google Sheets webhook.'
          );
        }
        return { ok: false, pulledData: false };
      } catch (err) {
        if (reqId === syncRequestIdRef.current) {
          setSyncStatus('error');
        }
        if (options?.notify) {
          addToast(
            'error',
            'Sync Failed',
            err instanceof Error ? err.message : 'Unable to reach Google Sheets webhook.'
          );
        }
        return { ok: false, pulledData: false };
      }
    },
    [addToast, applyPulledSheetData]
  );

  const handleClearLocalCacheAndSyncToday = useCallback(
    async (webhookUrl: string) => {
      storage.clearLeadsCache();
      leadsRef.current = [];
      callLogsRef.current = [];
      contentPostsRef.current = [];
      setLeads([]);
      setCallLogs([]);
      setContentPosts([]);
      setDuplicateAttempts([]);
      setSheetDuplicateReport({
        checkedAt: new Date().toISOString(),
        leadDuplicates: [],
        postDuplicates: [],
      });

      const targetUrl = webhookUrl.trim() || settings.googleSheetsWebhookUrl;
      const res = await syncFromSheets(targetUrl, { notify: false, scope: 'today' });
      if (res.ok && res.pulledData) {
        addToast(
          'success',
          'Local Cache Cleared & Synced Today',
          `Loaded ${leadsRef.current.length} Today lead(s) (${getLocalDateString()}).`
        );
      } else if (res.ok) {
        addToast(
          'info',
          'Local Cache Cleared',
          'Stale cached leads removed. Connected to Google Sheets.'
        );
      } else {
        addToast(
          'warning',
          'Local Cache Cleared',
          'Stale cached leads removed, but live Google Sheets pull could not complete.'
        );
      }
    },
    [addToast, settings.googleSheetsWebhookUrl, syncFromSheets]
  );

  // When an authenticated session is already restored on mount, sync ONLY Today's active records
  useEffect(() => {
    if (!currentUser) return;
    const initialUrl = storage.getSettings().googleSheetsWebhookUrl;
    if (initialUrl) {
      void syncFromSheets(initialUrl, { scope: 'today' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth handlers
  const handleLogin = (user: User) => {
    setCurrentUser(user);
    storage.saveSessionUserId(user.id);
    setActiveTab(defaultTabForRole(user.role));
    appendAudit(user, 'LOGIN', `Signed into ${user.role} workspace`);
    addToast('success', `Welcome back, ${user.name}`, `Signed in as ${user.title}`);
    if (settings.googleSheetsWebhookUrl) {
      void syncFromSheets(settings.googleSheetsWebhookUrl, { scope: 'today' });
    }
  };

  const handleLogout = () => {
    if (currentUser) {
      appendAudit(currentUser, 'LOGOUT', 'Signed out of session');
    }
    void logoutFromServer();
    setCurrentUser(null);
    storage.saveSessionUserId(null);
    addToast('info', 'Signed out', 'Your session has been closed.');
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Data Collection handlers
  const handleRecordDuplicateAttempt = (
    attempt: Omit<DuplicateAttempt, 'id' | 'timestamp'>,
    existingLeadId = ''
  ) => {
    const record: DuplicateAttempt = {
      ...attempt,
      id: makeId('DUP'),
      timestamp: new Date().toISOString(),
    };
    setDuplicateAttempts((prev) => [record, ...prev]);
    void saveDuplicateAttemptInSupabase(record, existingLeadId).catch(() => {});
    addToast(
      'warning',
      'Duplicate Lead Blocked',
      `Already added by ${attempt.existingCollectorName} on ${formatShortDate(
        attempt.existingDate
      )}`
    );
  };

  const buildLeadFromSheetSummary = (
    fallbackPhone: string,
    summary: NonNullable<Awaited<ReturnType<typeof checkLeadDuplicateInSheets>>['existingLead']>
  ): Lead => {
    const existingPhone =
      normalizeBdPhone(summary.phone) || summary.phone || fallbackPhone;
    return {
      id: summary.id,
      customerName: summary.customerName,
      phone: existingPhone,
      rawPhone: existingPhone,
      facebookLink: summary.facebookLink,
      normalizedFacebookLink: normalizeFacebookUrl(summary.facebookLink),
      notes: '',
      collectorId: `collector-${summary.collectorName.toLowerCase()}`,
      collectorName: summary.collectorName,
      assignedAgentId: summary.assignedAgentName
        ? `agent-${summary.assignedAgentName.toLowerCase()}`
        : null,
      assignedAgentName: summary.assignedAgentName,
      status: summary.status,
      followUpAt: null,
      lastCallNotes: '',
      createdAt: summary.createdAt,
      updatedAt: summary.createdAt,
    };
  };

  const handleCheckPhoneDuplicate = async (
    rawPhone: string
  ): Promise<{
    ok: boolean;
    isDuplicate: boolean;
    duplicate?: { lead: Lead; matchedBy: 'phone' | 'facebook' };
    error?: string;
  }> => {
    const normalizedPhone = normalizeBdPhone(rawPhone);
    if (!normalizedPhone) {
      return {
        ok: false,
        isDuplicate: false,
        error:
          'Enter a valid Bangladeshi phone number (e.g. 01712345678, 8801712345678, or +8801712345678).',
      };
    }

    const currentLeads = mergeRemoteLeads(leadsRef.current, storage.getLeads());
    const localDup = findDuplicateLead(currentLeads, normalizedPhone, '');
    if (localDup) {
      return {
        ok: true,
        isDuplicate: true,
        duplicate: localDup,
      };
    }

    // Fast (<100ms) indexed Supabase PostgreSQL duplicate check first
    const dbDup = await checkLeadDuplicateInSupabase(normalizedPhone, '');
    if (dbDup.ok && dbDup.isDuplicate && dbDup.existingLead) {
      return {
        ok: true,
        isDuplicate: true,
        duplicate: {
          lead: dbDup.existingLead,
          matchedBy: dbDup.matchedBy ?? 'phone',
        },
      };
    }

    const webhookUrl = settings.googleSheetsWebhookUrl.trim();
    const sheetDup = await checkLeadDuplicateInSheets(
      webhookUrl,
      normalizedPhone,
      '',
      { timeoutMs: 15000 }
    );

    if (!sheetDup.ok) {
      const errMsg =
        sheetDup.error ??
        'Unable to verify phone number against Google Sheets Master_Data.';
      console.error('[RunBD] Early Google Sheets phone check failed:', errMsg);
      setSyncStatus('error');
      return {
        ok: false,
        isDuplicate: false,
        error: errMsg,
      };
    }

    setSyncStatus('synced');

    if (sheetDup.isDuplicate && sheetDup.existingLead) {
      const existingLead = buildLeadFromSheetSummary(
        normalizedPhone,
        sheetDup.existingLead
      );
      return {
        ok: true,
        isDuplicate: true,
        duplicate: { lead: existingLead, matchedBy: sheetDup.matchedBy ?? 'phone' },
      };
    }

    return {
      ok: true,
      isDuplicate: false,
    };
  };

  const handleAddSingleLead = async (input: {
    customerName: string;
    rawPhone: string;
    facebookLink: string;
    notes: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    duplicate?: { lead: Lead; matchedBy: 'phone' | 'facebook' };
  }> => {
    if (!currentUser) return { ok: false, error: 'Not authenticated' };

    const normalizedPhone = normalizeBdPhone(input.rawPhone);
    if (!normalizedPhone) {
      return { ok: false, error: 'Invalid Bangladeshi phone number.' };
    }

    const currentLeads = mergeRemoteLeads(leadsRef.current, storage.getLeads());
    const localDup = findDuplicateLead(currentLeads, input.rawPhone, input.facebookLink);
    if (localDup) {
      handleRecordDuplicateAttempt({
        collectorId: currentUser.id,
        collectorName: currentUser.name,
        attemptedName: input.customerName,
        attemptedPhone: input.rawPhone,
        attemptedFacebook: input.facebookLink,
        matchedBy: localDup.matchedBy,
        existingCollectorName: localDup.lead.collectorName,
        existingDate: localDup.lead.createdAt,
      });
      const agentLabel = localDup.lead.assignedAgentName ?? 'Unassigned';
      return {
        ok: false,
        error: `Duplicate Found: ${localDup.lead.customerName} · Agent: ${agentLabel} · Status: ${localDup.lead.status} · Collector: ${localDup.lead.collectorName} (${formatShortDate(
          localDup.lead.createdAt
        )})`,
        duplicate: localDup,
      };
    }

    // Fast (<100ms) indexed duplicate check against Supabase PostgreSQL
    const dbDup = await checkLeadDuplicateInSupabase(
      normalizedPhone,
      input.facebookLink.trim()
    );
    if (dbDup.ok && dbDup.isDuplicate && dbDup.existingLead) {
      const matchedBy = dbDup.matchedBy ?? 'phone';
      handleRecordDuplicateAttempt(
        {
          collectorId: currentUser.id,
          collectorName: currentUser.name,
          attemptedName: input.customerName,
          attemptedPhone: input.rawPhone,
          attemptedFacebook: input.facebookLink,
          matchedBy,
          existingCollectorName: dbDup.existingLead.collectorName,
          existingDate: dbDup.existingLead.createdAt,
        },
        dbDup.existingLead.id
      );
      const agentLabel = dbDup.existingLead.assignedAgentName ?? 'Unassigned';
      return {
        ok: false,
        error: `Duplicate Found: ${dbDup.existingLead.customerName} · Agent: ${agentLabel} · Status: ${dbDup.existingLead.status} · Collector: ${dbDup.existingLead.collectorName} (${formatShortDate(
          dbDup.existingLead.createdAt
        )})`,
        duplicate: { lead: dbDup.existingLead, matchedBy },
      };
    }

    // On-demand lightweight live check against Google Sheets Master_Data without loading historical rows
    const webhookUrl = settings.googleSheetsWebhookUrl.trim();
    if (webhookUrl) {
      const sheetDup = await checkLeadDuplicateInSheets(
        webhookUrl,
        normalizedPhone,
        input.facebookLink.trim(),
        { timeoutMs: 15000 }
      );
      if (!sheetDup.ok) {
        const errMsg =
          sheetDup.error ??
          'Unable to verify lead uniqueness against Google Sheets Master_Data.';
        console.error('[RunBD] Live Google Sheets lead duplicate check failed:', errMsg);
        setSyncStatus('error');
        addToast('error', 'Google Sheets Duplicate Check Failed', errMsg);
        return {
          ok: false,
          error: `Live Google Sheets duplicate check failed: ${errMsg} Lead was NOT saved so duplicates are never missed.`,
        };
      }
      if (sheetDup.isDuplicate && sheetDup.existingLead) {
        const existingLead = buildLeadFromSheetSummary(
          normalizedPhone,
          sheetDup.existingLead
        );
        const matchedBy = sheetDup.matchedBy ?? 'phone';
        handleRecordDuplicateAttempt(
          {
            collectorId: currentUser.id,
            collectorName: currentUser.name,
            attemptedName: input.customerName,
            attemptedPhone: input.rawPhone,
            attemptedFacebook: input.facebookLink,
            matchedBy,
            existingCollectorName: existingLead.collectorName,
            existingDate: existingLead.createdAt,
          },
          existingLead.id
        );
        const agentLabel = existingLead.assignedAgentName ?? 'Unassigned';
        return {
          ok: false,
          error: `Duplicate Found in Google Sheets: ${existingLead.customerName} · Agent: ${agentLabel} · Status: ${existingLead.status} · Collector: ${existingLead.collectorName} (${formatShortDate(
            existingLead.createdAt
          )})`,
          duplicate: { lead: existingLead, matchedBy },
        };
      }
      setSyncStatus('synced');
    }

    const nowIso = new Date().toISOString();
    const baseLead = {
      id: makeId('RBD'),
      customerName: input.customerName,
      phone: normalizedPhone,
      rawPhone: input.rawPhone,
      facebookLink: input.facebookLink,
      normalizedFacebookLink: normalizeFacebookUrl(input.facebookLink),
      notes: input.notes,
      collectorId: currentUser.id,
      collectorName: currentUser.name,
      status: 'Pending' as const,
      followUpAt: null,
      lastCallNotes: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const { assignedLeads, nextIndex } = assignLeadsRoundRobin(
      [baseLead],
      CALL_CENTER_AGENTS,
      settings.roundRobinIndex,
      settings.autoAssignEnabled
    );

    const created = assignedLeads[0];
    const dbCreateRes = await createLeadInSupabase(created, nextIndex);
    if (!dbCreateRes.ok && dbCreateRes.isDuplicate && dbCreateRes.existingLead) {
      const matchedBy = dbCreateRes.matchedBy ?? 'phone';
      handleRecordDuplicateAttempt(
        {
          collectorId: currentUser.id,
          collectorName: currentUser.name,
          attemptedName: input.customerName,
          attemptedPhone: input.rawPhone,
          attemptedFacebook: input.facebookLink,
          matchedBy,
          existingCollectorName: dbCreateRes.existingLead.collectorName,
          existingDate: dbCreateRes.existingLead.createdAt,
        },
        dbCreateRes.existingLead.id
      );
      const agentLabel = dbCreateRes.existingLead.assignedAgentName ?? 'Unassigned';
      return {
        ok: false,
        error: `Duplicate Found: ${dbCreateRes.existingLead.customerName} · Agent: ${agentLabel} · Status: ${dbCreateRes.existingLead.status} · Collector: ${dbCreateRes.existingLead.collectorName} (${formatShortDate(
          dbCreateRes.existingLead.createdAt
        )})`,
        duplicate: { lead: dbCreateRes.existingLead, matchedBy },
      };
    }

    const nextLeads = [created, ...currentLeads];
    const nextSettings: AppSettings = { ...settings, roundRobinIndex: nextIndex };
    leadsRef.current = nextLeads;
    setLeads(nextLeads);
    setSettings(nextSettings);

    appendAudit(
      currentUser,
      'LEAD_CREATED',
      `Added lead ${created.customerName} (${created.phone}) -> ${
        created.assignedAgentName ? `Auto-assigned to ${created.assignedAgentName}` : 'Unassigned'
      }`
    );

    addToast(
      'success',
      'Lead Added Successfully',
      created.assignedAgentName
        ? `Assigned to ${created.assignedAgentName} via Round-Robin.`
        : 'Saved to unassigned lead queue.'
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      { event: 'LEAD_UPSERT', lead: created },
      nextLeads,
      callLogsRef.current
    );

    return { ok: true };
  };

  const handleImportBulkLeads = async (validRows: CsvPreviewRow[]) => {
    if (!currentUser || validRows.length === 0) return;

    const currentLeads = mergeRemoteLeads(leadsRef.current, storage.getLeads());
    const nowIso = new Date().toISOString();
    const workingLeads = [...currentLeads];
    const localAcceptedRows: CsvPreviewRow[] = [];
    let skippedCount = 0;

    for (const r of validRows) {
      if (!r.normalizedPhone) continue;
      const dup = findDuplicateLead(workingLeads, r.rawPhone, r.facebookLink);
      if (dup) {
        skippedCount++;
        handleRecordDuplicateAttempt({
          collectorId: currentUser.id,
          collectorName: currentUser.name,
          attemptedName: r.customerName,
          attemptedPhone: r.rawPhone,
          attemptedFacebook: r.facebookLink,
          matchedBy: dup.matchedBy,
          existingCollectorName: dup.lead.collectorName,
          existingDate: dup.lead.createdAt,
        });
        continue;
      }
      localAcceptedRows.push(r);
      workingLeads.push({
        id: 'TMP',
        customerName: r.customerName,
        phone: r.normalizedPhone,
        rawPhone: r.rawPhone,
        facebookLink: r.facebookLink,
        normalizedFacebookLink: normalizeFacebookUrl(r.facebookLink),
        notes: '',
        collectorId: currentUser.id,
        collectorName: currentUser.name,
        assignedAgentId: null,
        assignedAgentName: null,
        status: 'Pending',
        followUpAt: null,
        lastCallNotes: '',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    // Indexed Supabase + live Google Sheets check per row without loading historical rows
    const supabaseAcceptedRows: CsvPreviewRow[] = [];
    for (const row of localAcceptedRows) {
      const sbDup = await checkLeadDuplicateInSupabase(
        row.normalizedPhone ?? row.rawPhone,
        row.facebookLink
      );
      if (sbDup.ok && sbDup.isDuplicate && sbDup.existingLead) {
        skippedCount++;
        handleRecordDuplicateAttempt(
          {
            collectorId: currentUser.id,
            collectorName: currentUser.name,
            attemptedName: row.customerName,
            attemptedPhone: row.rawPhone,
            attemptedFacebook: row.facebookLink,
            matchedBy: sbDup.matchedBy ?? 'phone',
            existingCollectorName: sbDup.existingLead.collectorName,
            existingDate: sbDup.existingLead.createdAt,
          },
          sbDup.existingLead.id
        );
      } else {
        supabaseAcceptedRows.push(row);
      }
    }

    const acceptedRows: CsvPreviewRow[] = [];
    const webhookUrl = settings.googleSheetsWebhookUrl.trim();
    let checkFailureCount = 0;
    let firstCheckError = '';
    if (webhookUrl && supabaseAcceptedRows.length > 0) {
      const CONCURRENCY = 2;
      for (let i = 0; i < supabaseAcceptedRows.length; i += CONCURRENCY) {
        const chunk = supabaseAcceptedRows.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          chunk.map((row) =>
            checkLeadDuplicateInSheets(
              webhookUrl,
              row.normalizedPhone ?? row.rawPhone,
              row.facebookLink,
              { timeoutMs: 15000 }
            )
          )
        );
        chunk.forEach((row, idx) => {
          const checkRes = results[idx];
          if (!checkRes.ok) {
            checkFailureCount++;
            if (!firstCheckError && checkRes.error) {
              firstCheckError = checkRes.error;
            }
          } else if (checkRes.isDuplicate && checkRes.existingLead) {
            skippedCount++;
            handleRecordDuplicateAttempt({
              collectorId: currentUser.id,
              collectorName: currentUser.name,
              attemptedName: row.customerName,
              attemptedPhone: row.rawPhone,
              attemptedFacebook: row.facebookLink,
              matchedBy: checkRes.matchedBy ?? 'phone',
              existingCollectorName: checkRes.existingLead.collectorName,
              existingDate: checkRes.existingLead.createdAt,
            });
          } else {
            acceptedRows.push(row);
          }
        });
      }
      if (checkFailureCount > 0) {
        console.error('[RunBD] Bulk Google Sheets duplicate check error:', firstCheckError);
        setSyncStatus('error');
        addToast(
          'error',
          `Sheet Duplicate Check Failed (${checkFailureCount} row${checkFailureCount === 1 ? '' : 's'})`,
          firstCheckError || 'Could not verify rows against Master_Data; unverified rows were skipped.'
        );
      } else {
        setSyncStatus('synced');
      }
    } else {
      acceptedRows.push(...supabaseAcceptedRows);
    }

    if (acceptedRows.length === 0) {
      if (checkFailureCount === 0) {
        addToast(
          'warning',
          'Import Blocked',
          'All rows were duplicates already in Google Sheets or Supabase database.'
        );
      }
      return;
    }

    const baseLeads = acceptedRows.map((r) => ({
      id: makeId('RBD'),
      customerName: r.customerName,
      phone: r.normalizedPhone as string,
      rawPhone: r.rawPhone,
      facebookLink: r.facebookLink,
      normalizedFacebookLink: normalizeFacebookUrl(r.facebookLink),
      notes: 'Imported via Bulk CSV',
      collectorId: currentUser.id,
      collectorName: currentUser.name,
      status: 'Pending' as const,
      followUpAt: null,
      lastCallNotes: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    }));

    const { assignedLeads, nextIndex } = assignLeadsRoundRobin(
      baseLeads,
      CALL_CENTER_AGENTS,
      settings.roundRobinIndex,
      settings.autoAssignEnabled
    );

    const nextLeads = [...assignedLeads, ...currentLeads];
    const nextSettings: AppSettings = { ...settings, roundRobinIndex: nextIndex };
    leadsRef.current = nextLeads;
    setLeads(nextLeads);
    setSettings(nextSettings);
    void importLeadsBatchInSupabase(assignedLeads, nextIndex).catch(() => {});

    appendAudit(
      currentUser,
      'BULK_IMPORT',
      `Imported ${assignedLeads.length} valid leads via CSV (${
        settings.autoAssignEnabled ? 'Round-Robin distributed' : 'Unassigned'
      })${skippedCount > 0 ? `, blocked ${skippedCount} duplicate(s)` : ''}`
    );

    addToast(
      'success',
      `Imported ${assignedLeads.length} Leads`,
      skippedCount > 0
        ? `Blocked ${skippedCount} duplicate row(s) found against existing/sheet records.`
        : settings.autoAssignEnabled
        ? 'Distributed equally across the 6 call center agents.'
        : 'Added to the unassigned queue.'
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      {
        event: 'LEADS_BATCH_UPSERT',
        leads: assignedLeads,
      },
      nextLeads,
      callLogsRef.current
    );
  };

  // Kawsar Content & Link Poster handler
  const handleAddContentPost = async (input: {
    facebookLink: string;
    websiteLink: string;
    note: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    duplicate?: { post: ContentPost; matchedField: 'Facebook Link' | 'Website Link' };
  }> => {
    if (!currentUser) return { ok: false, error: 'Not authenticated' };

    const trimmedFb = input.facebookLink.trim();
    const trimmedWeb = input.websiteLink.trim();

    if (!trimmedFb && !trimmedWeb) {
      return {
        ok: false,
        error: 'Please enter at least one link (Facebook Post Link or Website Link).',
      };
    }

    if (trimmedFb && !isValidPostUrl(trimmedFb)) {
      return { ok: false, error: 'Please enter a valid Facebook Post URL.' };
    }

    if (trimmedWeb && !isValidPostUrl(trimmedWeb)) {
      return { ok: false, error: 'Please enter a valid Website URL.' };
    }

    const currentPosts = mergeRemoteContentPosts(
      contentPostsRef.current,
      storage.getContentPosts()
    );
    const localDup = findDuplicatePost(currentPosts, trimmedFb, trimmedWeb);
    if (localDup) {
      addToast(
        'warning',
        `Duplicate ${localDup.matchedField} Blocked`,
        `Already submitted by ${localDup.post.posterName} on ${formatShortDate(
          localDup.post.createdAt
        )}.`
      );
      return {
        ok: false,
        error: `Duplicate ${localDup.matchedField}: already submitted by ${localDup.post.posterName} on ${formatShortDate(
          localDup.post.createdAt
        )}.`,
        duplicate: localDup,
      };
    }

    // Instant indexed duplicate check against Supabase kawsar_posts
    const dbPostDup = await checkPostDuplicateInSupabase(trimmedFb, trimmedWeb);
    if (dbPostDup.ok && dbPostDup.isDuplicate && dbPostDup.existingPost) {
      const matchedField = dbPostDup.matchedField ?? 'Facebook Link';
      addToast(
        'warning',
        `Duplicate ${matchedField} Blocked`,
        `Already submitted by ${dbPostDup.existingPost.posterName} on ${formatShortDate(
          dbPostDup.existingPost.createdAt
        )}.`
      );
      return {
        ok: false,
        error: `Duplicate ${matchedField}: already submitted by ${dbPostDup.existingPost.posterName} on ${formatShortDate(
          dbPostDup.existingPost.createdAt
        )}.`,
        duplicate: { post: dbPostDup.existingPost, matchedField },
      };
    }

    // On-demand lightweight live check against Google Sheets Kawsar_Posts_Log
    const webhookUrl = settings.googleSheetsWebhookUrl.trim();
    if (webhookUrl) {
      const sheetPostDup = await checkPostDuplicateInSheets(
        webhookUrl,
        trimmedFb,
        trimmedWeb,
        { timeoutMs: 15000 }
      );
      if (!sheetPostDup.ok) {
        const errMsg =
          sheetPostDup.error ??
          'Unable to verify link uniqueness against Google Sheets Kawsar_Posts_Log.';
        console.error('[RunBD] Live Google Sheets post duplicate check failed:', errMsg);
        setSyncStatus('error');
        addToast('error', 'Google Sheets Link Check Failed', errMsg);
        return {
          ok: false,
          error: `Live Google Sheets link check failed: ${errMsg} Entry was NOT saved.`,
        };
      }
      if (sheetPostDup.isDuplicate && sheetPostDup.existingPost) {
        const existingPost: ContentPost = {
          id: sheetPostDup.existingPost.id,
          facebookLink: sheetPostDup.existingPost.facebookLink,
          normalizedFacebookLink: sheetPostDup.existingPost.facebookLink
            ? normalizePostUrl(sheetPostDup.existingPost.facebookLink)
            : '',
          websiteLink: sheetPostDup.existingPost.websiteLink,
          normalizedWebsiteLink: sheetPostDup.existingPost.websiteLink
            ? normalizePostUrl(sheetPostDup.existingPost.websiteLink)
            : '',
          note: sheetPostDup.existingPost.note,
          posterId: 'poster-kawsar',
          posterName: sheetPostDup.existingPost.posterName,
          createdAt: sheetPostDup.existingPost.createdAt,
        };
        const matchedField = sheetPostDup.matchedField ?? 'Facebook Link';
        addToast(
          'warning',
          `Duplicate ${matchedField} Blocked`,
          `Already logged in Google Sheets by ${existingPost.posterName} on ${formatShortDate(
            existingPost.createdAt
          )}.`
        );
        return {
          ok: false,
          error: `Duplicate ${matchedField}: already submitted in Google Sheets by ${existingPost.posterName} on ${formatShortDate(
            existingPost.createdAt
          )}.`,
          duplicate: { post: existingPost, matchedField },
        };
      }
      setSyncStatus('synced');
    }

    const fbUrl = trimmedFb
      ? /^https?:\/\//i.test(trimmedFb)
        ? trimmedFb
        : `https://${trimmedFb}`
      : '';
    const webUrl = trimmedWeb
      ? /^https?:\/\//i.test(trimmedWeb)
        ? trimmedWeb
        : `https://${trimmedWeb}`
      : '';

    const created: ContentPost = {
      id: makeId('PST'),
      facebookLink: fbUrl,
      normalizedFacebookLink: fbUrl ? normalizePostUrl(fbUrl) : '',
      websiteLink: webUrl,
      normalizedWebsiteLink: webUrl ? normalizePostUrl(webUrl) : '',
      note: input.note.trim(),
      posterId: currentUser.id,
      posterName: currentUser.name,
      createdAt: new Date().toISOString(),
    };

    const dbPostRes = await createPostInSupabase(created);
    if (!dbPostRes.ok && dbPostRes.isDuplicate && dbPostRes.existingPost) {
      const matchedField = dbPostRes.matchedField ?? 'Facebook Link';
      return {
        ok: false,
        error: `Duplicate ${matchedField}: already submitted by ${dbPostRes.existingPost.posterName}.`,
        duplicate: { post: dbPostRes.existingPost, matchedField },
      };
    }

    const nextPosts = [created, ...currentPosts];
    contentPostsRef.current = nextPosts;
    setContentPosts(nextPosts);

    const linkSummary = [
      fbUrl ? `FB: ${fbUrl}` : '',
      webUrl ? `Web: ${webUrl}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    appendAudit(
      currentUser,
      'POST_LINK_LOGGED',
      `Logged post links (${linkSummary})${created.note ? ` — ${created.note}` : ''}`
    );

    addToast(
      'success',
      'Post Entry Submitted',
      'Saved and queued for Kawsar_Posts_Log sync.'
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      { event: 'KAWSAR_POST_LOGGED', post: created },
      leadsRef.current,
      callLogsRef.current,
      nextPosts
    );

    return { ok: true };
  };

  // Paid Customers auto-creation & renewal handlers
  const upsertPaidCustomerForOrderConfirmed = useCallback(
    (lead: Lead, actor: User): PaidCustomer => {
      const basePaid = mergeRemotePaidCustomers(
        paidCustomersRef.current,
        storage.getPaidCustomers()
      );
      const existing = basePaid.find(
        (c) => c.leadId === lead.id || c.id === `PC-${lead.id}`
      );
      const nowIso = new Date().toISOString();

      let record: PaidCustomer;
      let nextPaid: PaidCustomer[];
      if (existing) {
        record = {
          ...existing,
          customerName: lead.customerName,
          phone: normalizeBdPhone(lead.phone || lead.rawPhone) || lead.phone || existing.phone,
          assignedAgentId: lead.assignedAgentId,
          assignedAgentName: lead.assignedAgentName,
          notes: lead.lastCallNotes || lead.notes || existing.notes,
          updatedAt: nowIso,
        };
        nextPaid = basePaid.map((c) => (c.id === existing.id ? record : c));
      } else {
        record = createPaidCustomerFromLead(lead);
        nextPaid = [record, ...basePaid];
        appendAudit(
          actor,
          'PAID_CUSTOMER_ADDED',
          `Auto-added ${record.customerName} (${record.phone}) to Paid Customers · Renewal on ${record.renewalDate}`
        );
      }

      paidCustomersRef.current = nextPaid;
      setPaidCustomers(nextPaid);
      void upsertPaidCustomerInSupabase(record, lead.facebookLink).catch(() => {});
      return record;
    },
    [appendAudit]
  );

  // Agent Call Logging handler
  const handleLogCall = (input: {
    leadId: string;
    newStatus: CallStatus;
    followUpAt: string | null;
    notes: string;
  }) => {
    if (!currentUser) return;
    const target = leadsRef.current.find((l) => l.id === input.leadId);
    if (!target) return;

    const nowIso = new Date().toISOString();
    const updatedLead: Lead = {
      ...target,
      status: input.newStatus,
      followUpAt: input.followUpAt,
      lastCallNotes: input.notes,
      updatedAt: nowIso,
    };

    const newLog: CallLog = {
      id: makeId('CL'),
      leadId: target.id,
      customerName: target.customerName,
      phone: target.phone,
      agentId: currentUser.id,
      agentName: currentUser.name,
      previousStatus: target.status,
      newStatus: input.newStatus,
      notes: input.notes,
      followUpAt: input.followUpAt,
      timestamp: nowIso,
    };

    const nextLeads = leadsRef.current.map((l) => (l.id === target.id ? updatedLead : l));
    const nextCallLogs = [newLog, ...callLogsRef.current];
    leadsRef.current = nextLeads;
    callLogsRef.current = nextCallLogs;

    setLeads(nextLeads);
    setCallLogs(nextCallLogs);

    let paidCustomer: PaidCustomer | undefined;
    if (input.newStatus === 'Order Confirmed') {
      paidCustomer = upsertPaidCustomerForOrderConfirmed(updatedLead, currentUser);
    }

    void saveCallLogInSupabase(updatedLead, newLog, paidCustomer).catch(() => {});

    appendAudit(
      currentUser,
      'STATUS_UPDATED',
      `Updated ${target.customerName} from ${target.status} to ${input.newStatus}`
    );

    addToast(
      'success',
      input.newStatus === 'Order Confirmed' ? 'Order Confirmed & Paid Customer Logged' : 'Call Logged',
      input.newStatus === 'Order Confirmed' && paidCustomer
        ? `${target.customerName} added to Paid Customers (Renewal: ${paidCustomer.renewalDate}).`
        : `${target.customerName} marked as ${input.newStatus}.`
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      { event: 'CALL_LOGGED', lead: updatedLead, callLog: newLog, paidCustomer },
      nextLeads,
      nextCallLogs
    );
  };

  // Admin inline Lead Status Update handler (also auto-triggers Paid Customers on Order Confirmed)
  const handleAdminUpdateLeadStatus = (leadId: string, newStatus: CallStatus) => {
    if (!currentUser) return;
    const target = leadsRef.current.find((l) => l.id === leadId);
    if (!target || target.status === newStatus) return;

    const nowIso = new Date().toISOString();
    const updatedLead: Lead = {
      ...target,
      status: newStatus,
      updatedAt: nowIso,
    };

    const nextLeads = leadsRef.current.map((l) => (l.id === leadId ? updatedLead : l));
    leadsRef.current = nextLeads;
    setLeads(nextLeads);

    let paidCustomer: PaidCustomer | undefined;
    if (newStatus === 'Order Confirmed') {
      paidCustomer = upsertPaidCustomerForOrderConfirmed(updatedLead, currentUser);
    }

    void updateLeadInSupabase(updatedLead, paidCustomer).catch(() => {});

    appendAudit(
      currentUser,
      'STATUS_UPDATED',
      `Admin changed ${target.customerName} status from ${target.status} to ${newStatus}`
    );

    addToast(
      'success',
      newStatus === 'Order Confirmed' ? 'Order Confirmed · Added to Paid Customers' : 'Status Updated',
      newStatus === 'Order Confirmed' && paidCustomer
        ? `${target.customerName} renewal scheduled for ${paidCustomer.renewalDate}.`
        : `${target.customerName} is now ${newStatus}.`
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      { event: 'LEAD_UPSERT', lead: updatedLead, paidCustomer },
      nextLeads,
      callLogsRef.current
    );
  };

  const handleMarkPaidCustomerRenewed = (customerId: string) => {
    if (!currentUser) return;
    const basePaid = mergeRemotePaidCustomers(
      paidCustomersRef.current,
      storage.getPaidCustomers()
    );
    const target = basePaid.find((c) => c.id === customerId);
    if (!target) return;

    const renewed = renewPaidCustomer(target);
    const nextPaid = basePaid.map((c) => (c.id === customerId ? renewed : c));
    paidCustomersRef.current = nextPaid;
    setPaidCustomers(nextPaid);
    void upsertPaidCustomerInSupabase(renewed).catch(() => {});

    appendAudit(
      currentUser,
      'PAID_CUSTOMER_RENEWED',
      `Marked ${renewed.customerName} (${renewed.phone}) as Renewed (+1 Month) -> Next renewal ${renewed.renewalDate}`
    );

    addToast(
      'success',
      'Renewal Confirmed (+1 Month)',
      `${renewed.customerName} extended to ${renewed.renewalDate}.`
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      { event: 'PAID_CUSTOMER_UPSERT', paidCustomer: renewed },
      leadsRef.current,
      callLogsRef.current
    );
  };

  const handleUpdatePaidCustomerStatus = (customerId: string, status: RenewalStatus) => {
    if (!currentUser) return;
    const basePaid = mergeRemotePaidCustomers(
      paidCustomersRef.current,
      storage.getPaidCustomers()
    );
    const target = basePaid.find((c) => c.id === customerId);
    if (!target || target.renewalStatus === status) return;

    const nowIso = new Date().toISOString();
    const updated: PaidCustomer = {
      ...target,
      renewalStatus: status,
      lastRenewedAt: status === 'Renewed' ? nowIso : target.lastRenewedAt,
      updatedAt: nowIso,
    };

    const nextPaid = basePaid.map((c) => (c.id === customerId ? updated : c));
    paidCustomersRef.current = nextPaid;
    setPaidCustomers(nextPaid);
    void upsertPaidCustomerInSupabase(updated).catch(() => {});

    appendAudit(
      currentUser,
      status === 'Renewed' ? 'PAID_CUSTOMER_RENEWED' : 'STATUS_UPDATED',
      `Updated Paid Customer ${updated.customerName} status to ${status}`
    );

    addToast(
      'success',
      'Renewal Status Updated',
      `${updated.customerName} marked as ${status}.`
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      { event: 'PAID_CUSTOMER_UPSERT', paidCustomer: updated },
      leadsRef.current,
      callLogsRef.current
    );
  };

  const handleUpdateCallScript = (script: string) => {
    const nextSettings: AppSettings = { ...settings, callScript: script };
    setSettings(nextSettings);
    void saveSettingsInSupabase(nextSettings).catch(() => {});
    addToast('success', 'Call Script Saved', 'Your updated script is ready for reference.');
  };

  // Admin handlers
  const handleToggleAutoAssign = (enabled: boolean) => {
    const nextSettings: AppSettings = { ...settings, autoAssignEnabled: enabled };
    setSettings(nextSettings);
    void saveSettingsInSupabase(nextSettings).catch(() => {});
    if (currentUser) {
      appendAudit(
        currentUser,
        'SETTINGS_UPDATED',
        `Turned Round-Robin Auto-Assign ${enabled ? 'ON' : 'OFF'}`
      );
    }
    addToast(
      'info',
      `Auto-Assign ${enabled ? 'Enabled' : 'Paused'}`,
      enabled
        ? 'New leads will automatically distribute across the 6 agents.'
        : 'New leads will remain unassigned until manually assigned.'
    );
  };

  const handleReassignLead = (leadId: string, newAgentId: string | null) => {
    if (!currentUser) return;
    const target = leadsRef.current.find((l) => l.id === leadId);
    if (!target) return;

    const agent = CALL_CENTER_AGENTS.find((a) => a.id === newAgentId) ?? null;
    const updated: Lead = {
      ...target,
      assignedAgentId: agent ? agent.id : null,
      assignedAgentName: agent ? agent.name : null,
      updatedAt: new Date().toISOString(),
    };

    const nextLeads = leadsRef.current.map((l) => (l.id === leadId ? updated : l));
    leadsRef.current = nextLeads;
    setLeads(nextLeads);
    void updateLeadInSupabase(updated).catch(() => {});

    appendAudit(
      currentUser,
      'LEAD_REASSIGNED',
      `Reassigned ${target.customerName} from ${target.assignedAgentName ?? 'Unassigned'} to ${
        agent?.name ?? 'Unassigned'
      }`
    );

    addToast(
      'success',
      'Lead Reassigned',
      `${target.customerName} is now assigned to ${agent?.name ?? 'Unassigned'}.`
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      { event: 'LEAD_UPSERT', lead: updated },
      nextLeads,
      callLogsRef.current
    );
  };

  const handleSaveWebhookUrl = (url: string) => {
    const nextSettings: AppSettings = { ...settings, googleSheetsWebhookUrl: url };
    setSettings(nextSettings);
    void saveSettingsInSupabase(nextSettings).catch(() => {});
    setSyncStatus(url ? 'synced' : 'offline');
    if (currentUser) {
      appendAudit(
        currentUser,
        'SETTINGS_UPDATED',
        url ? 'Configured Google Sheets Webhook URL' : 'Cleared Google Sheets Webhook URL'
      );
    }
    addToast(
      'success',
      url ? 'Webhook URL Saved' : 'Offline Local Mode Active',
      url
        ? 'Real-time sync will now push lead & call updates to Google Sheets.'
        : 'Data will continue saving locally in your browser.'
    );
  };

  const handleTestAndSyncSheets = async (url: string) => {
    setSettings((prev) => ({ ...prev, googleSheetsWebhookUrl: url }));
    const todayLeads = filterTodayLeads(leads);
    const todayCallLogs = filterTodayCallLogs(callLogs);
    const todayPosts = filterTodayPosts(contentPosts);
    const res = await triggerRealtimeSync(
      url,
      {
        event: 'TEST_SYNC',
        leads: todayLeads,
        callLogs: todayCallLogs,
        contentPosts: todayPosts,
        paidCustomers,
      },
      todayLeads,
      todayCallLogs
    );
    if (res.ok) {
      if (currentUser) {
        appendAudit(
          currentUser,
          'SHEETS_SYNCED',
          `Synced ${todayLeads.length} today leads, ${todayCallLogs.length} call logs, ${todayPosts.length} posts, and ${paidCustomers.length} paid customers to Google Sheets`
        );
      }
      addToast(
        'success',
        'Google Sheets Synced',
        'Master_Data, Agent_Logs, Daily_Summary, Kawsar_Posts_Log, and Paid_Customers synced.'
      );
    } else {
      addToast(
        'error',
        'Sync Failed',
        res.error ?? 'Check your Google Apps Script Web App URL and deployment permissions.'
      );
    }
  };

  // 2-Day Advance Renewal Notification List (scoped to Admin = all, Agent = assigned, others = [])
  const dueRenewals = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') {
      return getDueRenewalCustomers(paidCustomers);
    }
    if (currentUser.role === 'agent') {
      return getDueRenewalCustomers(paidCustomers, new Date(), currentUser.id);
    }
    return [];
  }, [currentUser, paidCustomers]);

  const agentTodayCallsCount = useMemo(() => {
    if (!currentUser || currentUser.role !== 'agent') return 0;
    return getAgentTodayCallLogs(callLogs, currentUser.id).length;
  }, [currentUser, callLogs]);

  // Top bar contextual quick stat per role (strict Today-only for Agents, Collectors, Poster; All-time for Admin)
  const quickStat = useMemo(() => {
    if (!currentUser) return { label: '', value: '' };
    if (currentUser.role === 'admin') {
      const todayLeads = filterTodayLeads(leads);
      const confirmedToday = todayLeads.filter((l) => l.status === 'Order Confirmed').length;
      return { label: 'Today Confirmed', value: `${confirmedToday} / ${todayLeads.length}` };
    }
    if (currentUser.role === 'agent') {
      const todayLeads = filterTodayLeads(leads);
      const scheduled = getScheduledFollowUps(todayLeads, currentUser.id).length;
      return { label: 'Today Follow-ups', value: String(scheduled) };
    }
    if (currentUser.role === 'poster') {
      const postStats = computeKawsarPostStats(contentPosts);
      return { label: 'Entries Today', value: String(postStats.todayCount) };
    }
    const mineToday = filterTodayLeads(leads).filter(
      (l) => l.collectorId === currentUser.id
    ).length;
    return { label: 'Collected Today', value: String(mineToday) };
  }, [currentUser, leads, contentPosts]);

  if (!currentUser) {
    return (
      <>
        <LoginScreen
          onLogin={handleLogin}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <>
      <Layout
        user={currentUser}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        syncStatus={syncStatus}
        quickStatLabel={quickStat.label}
        quickStatValue={quickStat.value}
        todayCallsCount={agentTodayCallsCount}
        dueRenewals={dueRenewals}
        onMarkPaidCustomerRenewed={handleMarkPaidCustomerRenewed}
      >
        {currentUser.role === 'admin' && activeTab === 'admin-overview' && (
          <AdminDashboardView
            leads={leads}
            callLogs={callLogs}
            duplicateAttempts={duplicateAttempts}
            contentPosts={contentPosts}
            dueRenewals={dueRenewals}
            onMarkPaidCustomerRenewed={handleMarkPaidCustomerRenewed}
            onOpenPaidCustomers={() => setActiveTab('paid-customers')}
            onDownloadDailyReport={(filename) =>
              addToast(
                'success',
                'Daily Report Downloaded',
                `Exported ${filename} with today's agent calls, orders, and follow-ups.`
              )
            }
          />
        )}

        {currentUser.role === 'admin' && activeTab === 'admin-final-summary' && (
          <AdminFinalDailySummaryView
            leads={leads}
            callLogs={callLogs}
            contentPosts={contentPosts}
            onDownloadCsv={(filename) =>
              addToast(
                'success',
                'Final Daily Summary Downloaded',
                `Exported ${filename} with full team metrics.`
              )
            }
          />
        )}

        {currentUser.role === 'admin' && activeTab === 'admin-leads' && (
          <AdminLeadsView
            leads={leads}
            autoAssignEnabled={settings.autoAssignEnabled}
            roundRobinIndex={settings.roundRobinIndex}
            onToggleAutoAssign={handleToggleAutoAssign}
            onReassignLead={handleReassignLead}
            onUpdateLeadStatus={handleAdminUpdateLeadStatus}
            onExportCsv={() =>
              addToast('success', 'CSV Exported', "Today's leads database downloaded.")
            }
          />
        )}

        {(currentUser.role === 'admin' || currentUser.role === 'agent') &&
          activeTab === 'paid-customers' && (
            <PaidCustomersView
              currentUser={currentUser}
              paidCustomers={paidCustomers}
              onMarkRenewed={handleMarkPaidCustomerRenewed}
              onUpdateRenewalStatus={
                currentUser.role === 'admin' ? handleUpdatePaidCustomerStatus : undefined
              }
              onExportCsv={() =>
                addToast('success', 'CSV Exported', 'Paid Customers & Renewals report downloaded.')
              }
            />
          )}

        {(currentUser.role === 'collector' ||
          (currentUser.role === 'admin' && activeTab === 'data-collection')) && (
          <DataCollectionView
            currentUser={currentUser}
            allLeads={leads}
            duplicateAttempts={duplicateAttempts}
            autoAssignEnabled={settings.autoAssignEnabled}
            onCheckPhoneDuplicate={handleCheckPhoneDuplicate}
            onAddSingleLead={handleAddSingleLead}
            onImportBulkLeads={handleImportBulkLeads}
            onRecordDuplicateAttempt={handleRecordDuplicateAttempt}
          />
        )}

        {(currentUser.role === 'poster' ||
          (currentUser.role === 'admin' && activeTab === 'kawsar-posts')) && (
          <KawsarPostsView
            posts={contentPosts}
            todayOnly={currentUser.role === 'poster'}
            canSubmit={currentUser.role === 'poster' || currentUser.role === 'admin'}
            onAddPost={handleAddContentPost}
          />
        )}

        {currentUser.role === 'agent' && activeTab === 'agent-workspace' && (
          <AgentWorkspaceView
            agent={currentUser}
            leads={leads}
            callLogs={callLogs}
            callScript={settings.callScript}
            dueRenewals={dueRenewals}
            onMarkPaidCustomerRenewed={handleMarkPaidCustomerRenewed}
            onOpenPaidCustomers={() => setActiveTab('paid-customers')}
            onOpenTodayCalls={() => setActiveTab('agent-today-calls')}
            onUpdateCallScript={handleUpdateCallScript}
            onLogCall={handleLogCall}
          />
        )}

        {currentUser.role === 'agent' && activeTab === 'agent-today-calls' && (
          <AgentTodayCallsView
            agent={currentUser}
            callLogs={callLogs}
            onBackToQueue={() => setActiveTab('agent-workspace')}
          />
        )}

        {currentUser.role === 'admin' && activeTab === 'admin-audit' && (
          <AdminAuditView auditLogs={auditLogs} />
        )}

        {currentUser.role === 'admin' && activeTab === 'admin-sheets' && (
          <AdminSheetsView
            webhookUrl={settings.googleSheetsWebhookUrl}
            defaultWebhookUrl={DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL}
            lastSyncedAt={settings.lastSyncedAt}
            syncStatus={syncStatus}
            sheetDuplicateReport={
              sheetDuplicateReport ?? {
                checkedAt: settings.lastSyncedAt ?? new Date().toISOString(),
                leadDuplicates: detectLeadDuplicatesInList(filterTodayLeads(leads)),
                postDuplicates: detectPostDuplicatesInList(filterTodayPosts(contentPosts)),
              }
            }
            onSaveWebhookUrl={handleSaveWebhookUrl}
            onTestAndSync={handleTestAndSyncSheets}
            onPullLatest={async (url) => {
              await syncFromSheets(url, { notify: true, scope: 'today' });
            }}
            onClearCacheAndSyncToday={handleClearLocalCacheAndSyncToday}
          />
        )}
      </Layout>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
