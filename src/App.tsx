import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminAuditView } from './components/AdminAuditView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AdminFinalDailySummaryView } from './components/AdminFinalDailySummaryView';
import { AdminLeadsView } from './components/AdminLeadsView';
import { AdminSheetsView } from './components/AdminSheetsView';
import { AdminTeamManagementView } from './components/AdminTeamManagementView';
import { AgentTodayCallsView } from './components/AgentTodayCallsView';
import { AgentWorkspaceView } from './components/AgentWorkspaceView';
import { DataCollectionView } from './components/DataCollectionView';
import { KawsarPostsView } from './components/KawsarPostsView';
import { Layout, NavTab } from './components/Layout';
import { LoginScreen } from './components/LoginScreen';
import { PaidCustomersView } from './components/PaidCustomersView';
import { ToastContainer } from './components/ToastContainer';
import { DEMO_USERS } from './data/seedData';
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
  PostLinkField,
  RenewalStatus,
  SyncStatus,
  ToastMessage,
  User,
} from './types';
import {
  assignLeadsRoundRobin,
  CarryOverLeadsInput,
  carryOverPendingLeads,
  clampDateToDhakaToday,
  computeDashboardMetrics,
  computeFinalDailySummary,
  computeKawsarPostStats,
  createManualPaidCustomer,
  createPaidCustomerFromLead,
  extractPhoneCoreKey,
  filterAgentBootstrapLeads,
  filterCollectorTodayLeads,
  filterTodayCallLogs,
  filterTodayLeads,
  filterTodayPosts,
  findDuplicateLead,
  findDuplicatePost,
  findExistingTodayCallLog,
  formatShortDate,
  getActiveAgents,
  getAgentTodayCallLogs,
  getAuthoritativeDhakaTodayYmd,
  getDueRenewalCustomers,
  getEstimatedServerNow,
  getLocalDateString,
  getScheduledFollowUps,
  isValidPostUrl,
  LeadEditInput,
  normalizeBdPhone,
  normalizeFacebookUrl,
  normalizePostUrl,
  normalizeVehicleType,
  PaidCustomerCreateInput,
  PaidCustomerEditInput,
  renewPaidCustomer,
  updateLeadDetails,
  updatePaidCustomerDetails,
  upsertTodayCallLogInList,
} from './utils/leadLogic';
import {
  createTeamMemberViaApi,
  deleteLeadViaApi,
  deletePaidCustomerViaApi,
  deleteTeamMemberViaApi,
  fetchAdminTeamMembers,
  fetchTeamDirectory,
  logoutFromServer,
  restoreServerSession,
  updateTeamMemberViaApi,
} from './utils/apiSync';
import {
  getCallCenterAgents,
  getDataCollectors,
  mergeTeamMembersWithFallback,
} from './utils/teamLogic';
import {
  checkLeadDuplicateInSupabase,
  checkPostDuplicateInSupabase,
  createLeadInSupabase,
  createPostInSupabase,
  deleteLeadInSupabase,
  deletePaidCustomerInSupabase,
  fetchAppSettingsFromSupabase,
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
  DEFAULT_SHEETS_BATCH_SIZE,
  detectLeadDuplicatesInList,
  detectPostDuplicatesInList,
  enrichPaidCustomersForSheetSync,
  isLegacyWebhookUrl,
  mergeRemoteCallLogs,
  mergeRemoteContentPosts,
  mergeRemoteDuplicateAttempts,
  mergeRemoteLeads,
  mergeRemotePaidCustomers,
  resolveWebhookUrl,
  SheetDuplicateReport,
  SheetsBatchEvent,
} from './utils/sheetsSync';
import {
  checkLeadDuplicateInSheets,
  checkPostDuplicateInSheets,
  ChunkedPushSheetsResult,
  DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL,
  DEFAULT_SHEETS_SYNC_TIMEOUT_MS,
  describeWebhookFetchError,
  FULL_SYNC_TIMEOUT_MS,
  isAbortOrTimeoutError,
  isSupersededSyncError,
  pullFromGoogleSheetsWebhook,
  pushChunkedSheetsSync,
  pushToGoogleSheetsWebhook,
  SheetsSyncPayload,
  storage,
  SUPERSEDED_SYNC_ERROR_NAME,
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
  const [sheetsSyncProgress, setSheetsSyncProgress] = useState<string | null>(null);
  const [sheetDuplicateReport, setSheetDuplicateReport] = useState<SheetDuplicateReport | null>(
    null
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>(() => storage.getTeamMembers());
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamSchemaMissing, setTeamSchemaMissing] = useState(false);

  const leadsRef = useRef(leads);
  const callLogsRef = useRef(callLogs);
  const contentPostsRef = useRef(contentPosts);
  const paidCustomersRef = useRef(paidCustomers);
  const teamMembersRef = useRef(teamMembers);

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

  useEffect(() => {
    teamMembersRef.current = teamMembers;
    storage.saveTeamMembers(teamMembers);
  }, [teamMembers]);

  const callCenterAgents = useMemo(
    () => getCallCenterAgents(teamMembers),
    [teamMembers]
  );
  const dataCollectors = useMemo(
    () => getDataCollectors(teamMembers),
    [teamMembers]
  );

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

  const refreshTeamMembers = useCallback(async (role?: User['role']) => {
    setTeamLoading(true);
    try {
      if (role === 'admin') {
        const adminRes = await fetchAdminTeamMembers();
        if (adminRes.ok && adminRes.members) {
          const merged = mergeTeamMembersWithFallback(adminRes.members, DEMO_USERS);
          teamMembersRef.current = merged;
          setTeamMembers(merged);
          setTeamSchemaMissing(Boolean(adminRes.schemaMissing));
          return;
        }
        if (adminRes.schemaMissing) {
          setTeamSchemaMissing(true);
        }
      }

      const dirRes = await fetchTeamDirectory();
      if (dirRes.ok && dirRes.members.length > 0) {
        const merged = mergeTeamMembersWithFallback(dirRes.members, DEMO_USERS);
        teamMembersRef.current = merged;
        setTeamMembers(merged);
      }
      if (typeof dirRes.schemaMissing === 'boolean') {
        setTeamSchemaMissing(dirRes.schemaMissing);
      }
    } finally {
      setTeamLoading(false);
    }
  }, []);

  // Load active team directory on mount (powers dynamic Login Screen)
  useEffect(() => {
    void refreshTeamMembers();
  }, [refreshTeamMembers]);

  // Restore verified session on reload (supports both Express API and static Shared App URL)
  useEffect(() => {
    const savedUserId = storage.getSessionUserId();
    if (!savedUserId) return;
    let active = true;
    void restoreServerSession(savedUserId).then((serverUser) => {
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

  const applySupabaseBootstrapResult = useCallback(
    (
      user: User,
      res: Awaited<ReturnType<typeof fetchBootstrapFromSupabase>>,
      todayYmd: string,
      options?: { isInitial?: boolean }
    ) => {
      if (!res.ok) {
        if (options?.isInitial && res.schemaMissing && user.role === 'admin') {
          addToast(
            'warning',
            'Supabase Schema Setup Needed',
            'Run supabase/schema.sql in Supabase SQL Editor (copy from Sync & Database Settings).'
          );
        }
        return;
      }

      const isAdmin = user.role === 'admin';
      const isCollector = user.role === 'collector';
      const recentCutoffMs = Date.now() - 8000;

      if (res.leads) {
        const deletedLeadIds = storage.getDeletedLeadIds();
        const remoteLeadIds = new Set(res.leads.map((l) => l.id));
        setLeads((prev) => {
          const roleBase = isAdmin
            ? prev
            : isCollector
            ? filterCollectorTodayLeads(prev)
            : filterAgentBootstrapLeads(prev);
          // Reconcile authoritatively with Supabase so leads deleted by Admin disappear
          // across all browsers/tabs, while preserving just-created (<8s) local items.
          const preserved = roleBase.filter((l) => {
            if (remoteLeadIds.has(l.id)) return true;
            const createdMs = Date.parse(l.createdAt || '') || 0;
            return createdMs >= recentCutoffMs;
          });
          const merged = mergeRemoteLeads(preserved, res.leads!, deletedLeadIds);
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
      if (res.paidCustomers && (isAdmin || user.role === 'agent')) {
        const deletedIds = storage.getDeletedPaidCustomerIds();
        const remotePaidIds = new Set(res.paidCustomers.map((c) => c.id));
        setPaidCustomers((prev) => {
          // Reconcile authoritatively with Supabase so Admin deletes/edits propagate
          // cleanly into Agent browsers even when their localStorage had stale rows.
          const preserved = prev.filter((c) => {
            if (remotePaidIds.has(c.id)) return true;
            const createdMs = Date.parse(c.createdAt || '') || 0;
            return createdMs >= recentCutoffMs;
          });
          const merged = mergeRemotePaidCustomers(preserved, res.paidCustomers!, deletedIds);
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
          disabledAgentIds: res.settingsHasDisabledAgentsColumn
            ? res.settings!.disabledAgentIds
            : prev.disabledAgentIds,
          googleSheetsWebhookUrl:
            remoteUrl && !isLegacyWebhookUrl(remoteUrl)
              ? remoteUrl
              : resolveWebhookUrl(
                  prev.googleSheetsWebhookUrl,
                  DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL
                ),
        }));
      }
      void todayYmd;
    },
    [addToast]
  );

  // Hydrate workspace data from Supabase PostgreSQL on login / session restore
  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    const todayYmd = getLocalDateString();

    void refreshTeamMembers(currentUser.role);

    void fetchBootstrapFromSupabase(currentUser.role, todayYmd).then((res) => {
      if (!active) return;
      applySupabaseBootstrapResult(currentUser, res, todayYmd, { isInitial: true });
    });

    return () => {
      active = false;
    };
  }, [applySupabaseBootstrapResult, currentUser, refreshTeamMembers]);

  // Keep Admin <-> Agent Paid Customers & Leads synchronized when switching tabs,
  // regaining window focus, or across open browser tabs.
  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    const refreshLive = () => {
      const todayYmd = getLocalDateString();
      void fetchBootstrapFromSupabase(currentUser.role, todayYmd).then((res) => {
        if (!active) return;
        applySupabaseBootstrapResult(currentUser, res, todayYmd);
      });
    };

    if (
      activeTab === 'paid-customers' ||
      activeTab === 'agent-workspace' ||
      activeTab === 'data-collection' ||
      activeTab === 'admin-leads'
    ) {
      refreshLive();
    }

    const handleFocus = () => {
      refreshLive();
    };

    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === 'runbd_paid_customers_v1' ||
        e.key === 'runbd_deleted_paid_ids_v1'
      ) {
        const deletedIds = storage.getDeletedPaidCustomerIds();
        const storedPaid = storage.getPaidCustomers();
        const reconciled = mergeRemotePaidCustomers([], storedPaid, deletedIds);
        paidCustomersRef.current = reconciled;
        setPaidCustomers(reconciled);
      } else if (
        e.key === 'runbd_leads_v2' ||
        e.key === 'runbd_deleted_lead_ids_v1'
      ) {
        const deletedLeadIds = storage.getDeletedLeadIds();
        const storedLeads = storage.getLeads();
        const reconciled = mergeRemoteLeads([], storedLeads, deletedLeadIds);
        leadsRef.current = reconciled;
        setLeads(reconciled);
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshLive();
      }
    }, 25000);

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      window.clearInterval(intervalId);
    };
  }, [activeTab, applySupabaseBootstrapResult, currentUser]);

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
  const manualSyncControllerRef = useRef<AbortController | null>(null);
  const activeManualSyncCountRef = useRef(0);

  const beginManualSyncController = useCallback((): AbortController => {
    if (manualSyncControllerRef.current && !manualSyncControllerRef.current.signal.aborted) {
      manualSyncControllerRef.current.abort(
        new DOMException(
          'Superseded by newer manual Google Sheets sync request',
          SUPERSEDED_SYNC_ERROR_NAME
        )
      );
    }
    const nextController = new AbortController();
    manualSyncControllerRef.current = nextController;
    activeManualSyncCountRef.current += 1;
    return nextController;
  }, []);

  const endManualSyncController = useCallback((controller: AbortController | null) => {
    if (!controller) return;
    activeManualSyncCountRef.current = Math.max(0, activeManualSyncCountRef.current - 1);
    if (manualSyncControllerRef.current === controller) {
      manualSyncControllerRef.current = null;
    }
  }, []);

  const triggerRealtimeSync = useCallback(
    async (
      webhookUrl: string,
      payload: Omit<SheetsSyncPayload, 'dailySummary' | 'finalDailySummary'>,
      nextLeads: Lead[],
      nextCallLogs: CallLog[],
      nextContentPosts: ContentPost[] = contentPosts,
      syncOptions?: { isManual?: boolean; signal?: AbortSignal; timeoutMs?: number }
    ): Promise<{ ok: boolean; error?: string; timedOut?: boolean; superseded?: boolean }> => {
      if (!webhookUrl.trim()) {
        setSyncStatus('offline');
        return { ok: false, error: 'No webhook URL configured' };
      }

      const isManual = Boolean(syncOptions?.isManual);
      const reqId = ++syncRequestIdRef.current;
      const shouldManageStatus = isManual || activeManualSyncCountRef.current === 0;
      if (shouldManageStatus) {
        setSyncStatus('syncing');
      }

      const effectiveTimeoutMs =
        syncOptions?.timeoutMs ??
        (payload.event === 'FULL_SYNC' || payload.event === 'TEST_SYNC'
          ? FULL_SYNC_TIMEOUT_MS
          : DEFAULT_SHEETS_SYNC_TIMEOUT_MS);

      try {
        const dynamicAgents = getCallCenterAgents(teamMembersRef.current);
        const dynamicCollectors = getDataCollectors(teamMembersRef.current);
        const enrichmentLeads =
          leadsRef.current.length >= nextLeads.length ? leadsRef.current : nextLeads;

        const enrichedPaidCustomer = payload.paidCustomer
          ? enrichPaidCustomersForSheetSync([payload.paidCustomer], enrichmentLeads)[0]
          : undefined;
        const enrichedPaidCustomers = payload.paidCustomers
          ? enrichPaidCustomersForSheetSync(payload.paidCustomers, enrichmentLeads)
          : undefined;

        const deletedPaidIds =
          payload.deletedPaidCustomerIds ?? storage.getDeletedPaidCustomerIds();
        const deletedLeadIds =
          payload.deletedLeadIds ?? storage.getDeletedLeadIds();

        const res = await pushToGoogleSheetsWebhook(
          webhookUrl,
          {
            ...payload,
            ...(enrichedPaidCustomer ? { paidCustomer: enrichedPaidCustomer } : {}),
            ...(enrichedPaidCustomers ? { paidCustomers: enrichedPaidCustomers } : {}),
            ...(deletedPaidIds.length > 0 ? { deletedPaidCustomerIds: deletedPaidIds } : {}),
            ...(deletedLeadIds.length > 0 ? { deletedLeadIds } : {}),
            agentNames: payload.agentNames ?? dynamicAgents.map((a) => a.name),
            collectorNames: payload.collectorNames ?? dynamicCollectors.map((c) => c.name),
            dailySummary: buildDailySummary(nextLeads, nextCallLogs),
            finalDailySummary: computeFinalDailySummary(
              dynamicAgents,
              dynamicCollectors,
              nextLeads,
              nextCallLogs,
              nextContentPosts
            ),
          },
          { timeoutMs: effectiveTimeoutMs, signal: syncOptions?.signal }
        );

        if (res.superseded) {
          return res;
        }

        if (reqId === syncRequestIdRef.current && (isManual || activeManualSyncCountRef.current === 0)) {
          if (res.ok) {
            setSyncStatus('synced');
            setSettings((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
          } else {
            setSyncStatus('error');
          }
        }
        return res;
      } catch (err) {
        if (isSupersededSyncError(err)) {
          return { ok: false, superseded: true, error: describeWebhookFetchError(err, effectiveTimeoutMs) };
        }
        if (reqId === syncRequestIdRef.current && (isManual || activeManualSyncCountRef.current === 0)) {
          setSyncStatus('error');
        }
        return {
          ok: false,
          timedOut: isAbortOrTimeoutError(err),
          error: describeWebhookFetchError(err, effectiveTimeoutMs),
        };
      }
    },
    [buildDailySummary, contentPosts]
  );

  const triggerChunkedRealtimeSync = useCallback(
    async (
      webhookUrl: string,
      input: {
        event: SheetsBatchEvent;
        leads?: Lead[];
        callLogs?: CallLog[];
        contentPosts?: ContentPost[];
        paidCustomers?: PaidCustomer[];
      },
      nextLeads: Lead[],
      nextCallLogs: CallLog[],
      nextContentPosts: ContentPost[] = contentPosts,
      syncOptions?: {
        isManual?: boolean;
        signal?: AbortSignal;
        timeoutMs?: number;
        finalTimeoutMs?: number;
        onProgressLabel?: (label: string | null) => void;
      }
    ): Promise<ChunkedPushSheetsResult> => {
      if (!webhookUrl.trim()) {
        setSyncStatus('offline');
        return { ok: false, completedChunks: 0, totalChunks: 0, error: 'No webhook URL configured' };
      }

      const isManual = Boolean(syncOptions?.isManual);
      const reqId = ++syncRequestIdRef.current;
      const shouldManageStatus = isManual || activeManualSyncCountRef.current === 0;
      if (shouldManageStatus) {
        setSyncStatus('syncing');
      }

      const effectiveTimeoutMs = syncOptions?.timeoutMs ?? DEFAULT_SHEETS_SYNC_TIMEOUT_MS;

      try {
        const dynamicAgents = getCallCenterAgents(teamMembersRef.current);
        const dynamicCollectors = getDataCollectors(teamMembersRef.current);
        const enrichmentLeads =
          leadsRef.current.length >= nextLeads.length ? leadsRef.current : nextLeads;
        const enrichedPaidCustomers = input.paidCustomers
          ? enrichPaidCustomersForSheetSync(input.paidCustomers, enrichmentLeads)
          : undefined;

        const res = await pushChunkedSheetsSync(
          webhookUrl,
          {
            event: input.event,
            leads: input.leads,
            callLogs: input.callLogs,
            contentPosts: input.contentPosts,
            paidCustomers: enrichedPaidCustomers,
            deletedPaidCustomerIds: storage.getDeletedPaidCustomerIds(),
            deletedLeadIds: storage.getDeletedLeadIds(),
            agentNames: dynamicAgents.map((a) => a.name),
            collectorNames: dynamicCollectors.map((c) => c.name),
            dailySummary: buildDailySummary(nextLeads, nextCallLogs),
            finalDailySummary: computeFinalDailySummary(
              dynamicAgents,
              dynamicCollectors,
              nextLeads,
              nextCallLogs,
              nextContentPosts
            ),
          },
          {
            batchSize: DEFAULT_SHEETS_BATCH_SIZE,
            timeoutMs: effectiveTimeoutMs,
            finalTimeoutMs: syncOptions?.finalTimeoutMs ?? FULL_SYNC_TIMEOUT_MS,
            signal: syncOptions?.signal,
            onProgress: ({ chunkIndex, totalChunks }) => {
              if (!syncOptions?.onProgressLabel) return;
              if (totalChunks > 1) {
                syncOptions.onProgressLabel(`Syncing batch ${chunkIndex}/${totalChunks}...`);
              } else {
                syncOptions.onProgressLabel('Syncing...');
              }
            },
          }
        );

        if (res.superseded) {
          return res;
        }

        if (reqId === syncRequestIdRef.current && (isManual || activeManualSyncCountRef.current === 0)) {
          if (res.ok) {
            setSyncStatus('synced');
            setSettings((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
          } else {
            setSyncStatus('error');
          }
        }
        return res;
      } catch (err) {
        if (isSupersededSyncError(err)) {
          return {
            ok: false,
            superseded: true,
            completedChunks: 0,
            totalChunks: 0,
            error: describeWebhookFetchError(err, effectiveTimeoutMs),
          };
        }
        if (reqId === syncRequestIdRef.current && (isManual || activeManualSyncCountRef.current === 0)) {
          setSyncStatus('error');
        }
        return {
          ok: false,
          completedChunks: 0,
          totalChunks: 0,
          timedOut: isAbortOrTimeoutError(err),
          error: describeWebhookFetchError(err, effectiveTimeoutMs),
        };
      } finally {
        syncOptions?.onProgressLabel?.(null);
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
      const deletedLeadIds = storage.getDeletedLeadIds();
      const baseLeads = mergeRemoteLeads(leadsRef.current, storage.getLeads(), deletedLeadIds);
      const baseCallLogs = mergeRemoteCallLogs(callLogsRef.current, storage.getCallLogs());
      const basePosts = mergeRemoteContentPosts(
        contentPostsRef.current,
        storage.getContentPosts()
      );
      const deletedPaidIds = storage.getDeletedPaidCustomerIds();
      const basePaid = mergeRemotePaidCustomers(
        paidCustomersRef.current,
        storage.getPaidCustomers(),
        deletedPaidIds
      );

      const mergedLeads =
        remoteLeads.length > 0
          ? mergeRemoteLeads(baseLeads, remoteLeads, deletedLeadIds)
          : baseLeads;
      const mergedCallLogs =
        remoteCallLogs.length > 0
          ? mergeRemoteCallLogs(baseCallLogs, remoteCallLogs)
          : baseCallLogs;
      const mergedPosts =
        remotePosts.length > 0 ? mergeRemoteContentPosts(basePosts, remotePosts) : basePosts;
      const mergedPaidCustomers =
        remotePaidCustomers.length > 0
          ? mergeRemotePaidCustomers(basePaid, remotePaidCustomers, deletedPaidIds)
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
          (post.facebookLink.length > 0 ||
            post.websiteLink.length > 0 ||
            (post.tiktokLink || '').length > 0 ||
            (post.instagramLink || '').length > 0 ||
            (post.twitterLink || '').length > 0)
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
      options?: { notify?: boolean; scope?: 'today' | 'all'; isManual?: boolean }
    ) => {
      const targetUrl = webhookUrl.trim();
      if (!targetUrl) {
        setSyncStatus('offline');
        return { ok: false, pulledData: false };
      }

      const isManual = Boolean(options?.isManual);
      // Avoid launching a background pull if a manual sync is already in flight
      if (!isManual && activeManualSyncCountRef.current > 0) {
        return { ok: false, pulledData: false };
      }

      const manualController = isManual ? beginManualSyncController() : null;
      const reqId = ++syncRequestIdRef.current;
      const scope = options?.scope ?? 'today';
      setSyncStatus('syncing');

      try {
        const pullRes = await pullFromGoogleSheetsWebhook(targetUrl, {
          scope,
          timeoutMs: DEFAULT_SHEETS_SYNC_TIMEOUT_MS,
          signal: manualController?.signal,
        });

        if (pullRes.superseded) {
          return { ok: false, pulledData: false, superseded: true };
        }

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

        // If GET timed out while processing, surface timeout guidance right away without firing a second ping
        if (pullRes.timedOut) {
          if (reqId === syncRequestIdRef.current) {
            setSyncStatus('error');
          }
          if (options?.notify) {
            addToast(
              'error',
              'Sync Timed Out',
              pullRes.error ??
                'Google Sheets took longer than 45s to respond. Please wait a moment and try again.'
            );
          }
          return { ok: false, pulledData: false, error: pullRes.error };
        }

        // Fallback to a non-destructive connectivity check when doGet is not deployed yet
        const pingRes = await pushToGoogleSheetsWebhook(
          targetUrl,
          {
            event: 'CONNECT_CHECK',
            dailySummary: {
              date: getLocalDateString(),
              totalLeads: 0,
              callsMadeToday: 0,
              orderConfirmedCount: 0,
              interestedCount: 0,
              conversionRate: 0,
            },
          },
          { timeoutMs: DEFAULT_SHEETS_SYNC_TIMEOUT_MS, signal: manualController?.signal }
        );

        if (pingRes.superseded) {
          return { ok: false, pulledData: false, superseded: true };
        }

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
        return { ok: false, pulledData: false, error: pingRes.error ?? pullRes.error };
      } catch (err) {
        if (isSupersededSyncError(err)) {
          return { ok: false, pulledData: false, superseded: true };
        }
        const message = describeWebhookFetchError(err, DEFAULT_SHEETS_SYNC_TIMEOUT_MS);
        if (reqId === syncRequestIdRef.current) {
          setSyncStatus('error');
        }
        if (options?.notify) {
          addToast('error', 'Sync Failed', message);
        }
        return { ok: false, pulledData: false, error: message };
      } finally {
        endManualSyncController(manualController);
      }
    },
    [addToast, applyPulledSheetData, beginManualSyncController, endManualSyncController]
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
      const res = await syncFromSheets(targetUrl, {
        notify: false,
        scope: 'today',
        isManual: true,
      });
      if (res.superseded) return;
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
          res.error
            ? `Stale cached leads removed. ${res.error}`
            : 'Stale cached leads removed, but live Google Sheets pull could not complete.'
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
    void logoutFromServer().then(() => refreshTeamMembers());
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
    const matchedCollector = teamMembersRef.current.find(
      (u) => u.name.toLowerCase() === summary.collectorName.trim().toLowerCase()
    );
    const matchedAgent = summary.assignedAgentName
      ? teamMembersRef.current.find(
          (u) =>
            u.name.toLowerCase() === summary.assignedAgentName!.trim().toLowerCase()
        )
      : undefined;
    return {
      id: summary.id,
      customerName: summary.customerName,
      phone: existingPhone,
      rawPhone: existingPhone,
      facebookLink: summary.facebookLink,
      normalizedFacebookLink: normalizeFacebookUrl(summary.facebookLink),
      notes: '',
      collectorId:
        matchedCollector?.id ?? `collector-${summary.collectorName.toLowerCase()}`,
      collectorName: summary.collectorName,
      assignedAgentId: summary.assignedAgentName
        ? matchedAgent?.id ?? `agent-${summary.assignedAgentName.toLowerCase()}`
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

    const currentLeads = mergeRemoteLeads(
      leadsRef.current,
      storage.getLeads(),
      storage.getDeletedLeadIds()
    );
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

    const currentLeads = mergeRemoteLeads(
      leadsRef.current,
      storage.getLeads(),
      storage.getDeletedLeadIds()
    );
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

    const nowIso = (getEstimatedServerNow() ?? new Date()).toISOString();
    const authoritativeToday = getAuthoritativeDhakaTodayYmd();
    const clampedCollectedDate = clampDateToDhakaToday(nowIso, authoritativeToday).ymd;
    const baseLead = {
      id: makeId('RBD'),
      customerName: normalizeVehicleType(input.customerName) || input.customerName.trim(),
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
      collectedDate: clampedCollectedDate,
      date: clampedCollectedDate,
    };

    const remoteSettingsRes = await fetchAppSettingsFromSupabase().catch(() => null);
    const effectiveDisabledIds = remoteSettingsRes?.hasDisabledAgentsColumn
      ? remoteSettingsRes.settings.disabledAgentIds
      : settings.disabledAgentIds;
    const effectiveAutoAssign = remoteSettingsRes
      ? remoteSettingsRes.settings.autoAssignEnabled
      : settings.autoAssignEnabled;
    const effectiveRoundRobinIndex = remoteSettingsRes
      ? remoteSettingsRes.settings.roundRobinIndex
      : settings.roundRobinIndex;

    const activeAgentsList = getCallCenterAgents(teamMembersRef.current);
    const { assignedLeads, nextIndex } = assignLeadsRoundRobin(
      [baseLead],
      activeAgentsList,
      effectiveRoundRobinIndex,
      effectiveAutoAssign,
      effectiveDisabledIds
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

    const createdCore = extractPhoneCoreKey(created.phone);
    storage.removeDeletedLeadIds([
      created.id,
      createdCore ? `SHEET-PH-${createdCore}` : '',
    ]);
    const nextLeads = [created, ...currentLeads];
    const nextSettings: AppSettings = {
      ...settings,
      autoAssignEnabled: effectiveAutoAssign,
      disabledAgentIds: effectiveDisabledIds,
      roundRobinIndex: nextIndex,
    };
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

    const currentLeads = mergeRemoteLeads(
      leadsRef.current,
      storage.getLeads(),
      storage.getDeletedLeadIds()
    );
    const nowIso = (getEstimatedServerNow() ?? new Date()).toISOString();
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

    const authoritativeToday = getAuthoritativeDhakaTodayYmd();
    const clampedCollectedDate = clampDateToDhakaToday(nowIso, authoritativeToday).ymd;
    const baseLeads = acceptedRows.map((r) => ({
      id: makeId('RBD'),
      customerName: normalizeVehicleType(r.customerName) || r.customerName,
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
      collectedDate: clampedCollectedDate,
      date: clampedCollectedDate,
    }));

    const remoteSettingsRes = await fetchAppSettingsFromSupabase().catch(() => null);
    const effectiveDisabledIds = remoteSettingsRes?.hasDisabledAgentsColumn
      ? remoteSettingsRes.settings.disabledAgentIds
      : settings.disabledAgentIds;
    const effectiveAutoAssign = remoteSettingsRes
      ? remoteSettingsRes.settings.autoAssignEnabled
      : settings.autoAssignEnabled;
    const effectiveRoundRobinIndex = remoteSettingsRes
      ? remoteSettingsRes.settings.roundRobinIndex
      : settings.roundRobinIndex;
    const dynamicAgents = getCallCenterAgents(teamMembersRef.current);
    const activeAgentsList = getActiveAgents(dynamicAgents, effectiveDisabledIds);

    const { assignedLeads, nextIndex } = assignLeadsRoundRobin(
      baseLeads,
      dynamicAgents,
      effectiveRoundRobinIndex,
      effectiveAutoAssign,
      effectiveDisabledIds
    );

    storage.removeDeletedLeadIds(
      assignedLeads.flatMap((l) => {
        const core = extractPhoneCoreKey(l.phone);
        return [l.id, core ? `SHEET-PH-${core}` : ''];
      })
    );
    const nextLeads = [...assignedLeads, ...currentLeads];
    const nextSettings: AppSettings = {
      ...settings,
      autoAssignEnabled: effectiveAutoAssign,
      disabledAgentIds: effectiveDisabledIds,
      roundRobinIndex: nextIndex,
    };
    leadsRef.current = nextLeads;
    setLeads(nextLeads);
    setSettings(nextSettings);
    void importLeadsBatchInSupabase(assignedLeads, nextIndex).catch(() => {});

    appendAudit(
      currentUser,
      'BULK_IMPORT',
      `Imported ${assignedLeads.length} valid leads via CSV (${
        effectiveAutoAssign && activeAgentsList.length > 0
          ? `Round-Robin across ${activeAgentsList.length} active agent${activeAgentsList.length === 1 ? '' : 's'}`
          : 'Unassigned'
      })${skippedCount > 0 ? `, blocked ${skippedCount} duplicate(s)` : ''}`
    );

    addToast(
      'success',
      `Imported ${assignedLeads.length} Leads`,
      skippedCount > 0
        ? `Blocked ${skippedCount} duplicate row(s) found against existing/sheet records.`
        : effectiveAutoAssign && activeAgentsList.length > 0
        ? `Distributed equally across ${activeAgentsList.length} active call center agent${
            activeAgentsList.length === 1 ? '' : 's'
          }.`
        : 'Added to the unassigned queue.'
    );

    void triggerChunkedRealtimeSync(
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
    tiktokLink?: string;
    instagramLink?: string;
    twitterLink?: string;
    note: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    duplicate?: { post: ContentPost; matchedField: PostLinkField };
  }> => {
    if (!currentUser) return { ok: false, error: 'Not authenticated' };

    const trimmedFb = (input.facebookLink || '').trim();
    const trimmedWeb = (input.websiteLink || '').trim();
    const trimmedTt = (input.tiktokLink || '').trim();
    const trimmedIg = (input.instagramLink || '').trim();
    const trimmedTw = (input.twitterLink || '').trim();

    if (!trimmedFb && !trimmedWeb && !trimmedTt && !trimmedIg && !trimmedTw) {
      return {
        ok: false,
        error:
          'Please enter at least one link (Facebook, Website, TikTok, Instagram, or Twitter).',
      };
    }

    if (trimmedFb && !isValidPostUrl(trimmedFb)) {
      return { ok: false, error: 'Please enter a valid Facebook Post URL.' };
    }
    if (trimmedWeb && !isValidPostUrl(trimmedWeb)) {
      return { ok: false, error: 'Please enter a valid Website URL.' };
    }
    if (trimmedTt && !isValidPostUrl(trimmedTt)) {
      return { ok: false, error: 'Please enter a valid TikTok URL.' };
    }
    if (trimmedIg && !isValidPostUrl(trimmedIg)) {
      return { ok: false, error: 'Please enter a valid Instagram URL.' };
    }
    if (trimmedTw && !isValidPostUrl(trimmedTw)) {
      return { ok: false, error: 'Please enter a valid Twitter URL.' };
    }

    const currentPosts = mergeRemoteContentPosts(
      contentPostsRef.current,
      storage.getContentPosts()
    );
    const localDup = findDuplicatePost(
      currentPosts,
      trimmedFb,
      trimmedWeb,
      trimmedTt,
      trimmedIg,
      trimmedTw
    );
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
    const dbPostDup = await checkPostDuplicateInSupabase(
      trimmedFb,
      trimmedWeb,
      trimmedTt,
      trimmedIg,
      trimmedTw
    );
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
        {
          timeoutMs: 15000,
          tiktokLink: trimmedTt,
          instagramLink: trimmedIg,
          twitterLink: trimmedTw,
        }
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
        const ep = sheetPostDup.existingPost;
        const existingPost: ContentPost = {
          id: ep.id,
          facebookLink: ep.facebookLink,
          normalizedFacebookLink: ep.facebookLink ? normalizePostUrl(ep.facebookLink) : '',
          websiteLink: ep.websiteLink,
          normalizedWebsiteLink: ep.websiteLink ? normalizePostUrl(ep.websiteLink) : '',
          tiktokLink: ep.tiktokLink || '',
          normalizedTiktokLink: ep.tiktokLink ? normalizePostUrl(ep.tiktokLink) : '',
          instagramLink: ep.instagramLink || '',
          normalizedInstagramLink: ep.instagramLink ? normalizePostUrl(ep.instagramLink) : '',
          twitterLink: ep.twitterLink || '',
          normalizedTwitterLink: ep.twitterLink ? normalizePostUrl(ep.twitterLink) : '',
          note: ep.note,
          posterId: 'poster-kawsar',
          posterName: ep.posterName,
          createdAt: ep.createdAt,
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

    const withProtocol = (raw: string) =>
      raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : '';

    const fbUrl = withProtocol(trimmedFb);
    const webUrl = withProtocol(trimmedWeb);
    const ttUrl = withProtocol(trimmedTt);
    const igUrl = withProtocol(trimmedIg);
    const twUrl = withProtocol(trimmedTw);

    const created: ContentPost = {
      id: makeId('PST'),
      facebookLink: fbUrl,
      normalizedFacebookLink: fbUrl ? normalizePostUrl(fbUrl) : '',
      websiteLink: webUrl,
      normalizedWebsiteLink: webUrl ? normalizePostUrl(webUrl) : '',
      tiktokLink: ttUrl,
      normalizedTiktokLink: ttUrl ? normalizePostUrl(ttUrl) : '',
      instagramLink: igUrl,
      normalizedInstagramLink: igUrl ? normalizePostUrl(igUrl) : '',
      twitterLink: twUrl,
      normalizedTwitterLink: twUrl ? normalizePostUrl(twUrl) : '',
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
      ttUrl ? `TikTok: ${ttUrl}` : '',
      igUrl ? `IG: ${igUrl}` : '',
      twUrl ? `Twitter: ${twUrl}` : '',
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
      storage.removeDeletedPaidCustomerIds([`PC-${lead.id}`, lead.id]);
      const basePaid = mergeRemotePaidCustomers(
        paidCustomersRef.current,
        storage.getPaidCustomers(),
        storage.getDeletedPaidCustomerIds()
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

  // Agent Call Logging handler (1 phone/lead = max 1 Today call entry per day; upserts in place)
  const handleLogCall = (input: {
    leadId: string;
    newStatus: CallStatus;
    followUpAt: string | null;
    notes: string;
  }) => {
    if (!currentUser) return;
    let target = leadsRef.current.find((l) => l.id === input.leadId);
    if (!target) {
      const foundLog = callLogsRef.current.find(
        (c) => c.leadId === input.leadId || c.id === input.leadId
      );
      target = {
        id: input.leadId,
        customerName: foundLog ? foundLog.customerName : 'Customer',
        phone: foundLog ? foundLog.phone : '',
        rawPhone: foundLog ? foundLog.phone : '',
        facebookLink: '',
        normalizedFacebookLink: '',
        notes: input.notes,
        collectorId: 'collector-farhan',
        collectorName: 'Farhan',
        assignedAgentId: currentUser.id,
        assignedAgentName: currentUser.name,
        status: foundLog ? foundLog.newStatus : 'Done',
        followUpAt: input.followUpAt,
        lastCallNotes: input.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      leadsRef.current = [target, ...leadsRef.current];
    }

    const nowIso = new Date().toISOString();
    const todayYmd = getLocalDateString();
    const existingTodayLog = findExistingTodayCallLog(
      callLogsRef.current,
      currentUser.id,
      currentUser.name,
      target.id,
      target.phone,
      todayYmd
    );

    const updatedLead: Lead = {
      ...target,
      status: input.newStatus,
      followUpAt: input.followUpAt,
      lastCallNotes: input.notes,
      updatedAt: nowIso,
    };

    const upsertedLog: CallLog = {
      id: existingTodayLog ? existingTodayLog.id : makeId('CL'),
      leadId: target.id,
      customerName: target.customerName,
      phone: target.phone,
      agentId: currentUser.id,
      agentName: currentUser.name,
      previousStatus: existingTodayLog ? existingTodayLog.previousStatus : target.status,
      newStatus: input.newStatus,
      notes: input.notes,
      followUpAt: input.followUpAt,
      timestamp: nowIso,
    };

    const nextLeads = leadsRef.current.map((l) => (l.id === target.id ? updatedLead : l));
    const nextCallLogs = upsertTodayCallLogInList(callLogsRef.current, upsertedLog);
    leadsRef.current = nextLeads;
    callLogsRef.current = nextCallLogs;

    setLeads(nextLeads);
    setCallLogs(nextCallLogs);

    let paidCustomer: PaidCustomer | undefined;
    if (input.newStatus === 'Order Confirmed') {
      paidCustomer = upsertPaidCustomerForOrderConfirmed(updatedLead, currentUser);
    }

    void saveCallLogInSupabase(updatedLead, upsertedLog, paidCustomer).catch(() => {});

    appendAudit(
      currentUser,
      'STATUS_UPDATED',
      `Updated ${target.customerName} from ${target.status} to ${input.newStatus}`
    );

    addToast(
      'success',
      input.newStatus === 'Order Confirmed'
        ? 'Order Confirmed & Paid Customer Logged'
        : input.newStatus === 'Done'
        ? 'Marked as Done & moved to Today calls'
        : existingTodayLog
        ? 'Today Call Updated'
        : 'Call Logged',
      input.newStatus === 'Order Confirmed' && paidCustomer
        ? `${target.customerName} added to Paid Customers (Renewal: ${paidCustomer.renewalDate}).`
        : input.newStatus === 'Done'
        ? `${target.customerName} (${upsertedLog.previousStatus} → Done) logged in Today calls.`
        : existingTodayLog
        ? `${target.customerName} updated to ${input.newStatus} in Today calls.`
        : `${target.customerName} marked as ${input.newStatus}.`
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      { event: 'CALL_LOGGED', lead: updatedLead, callLog: upsertedLog, paidCustomer },
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
    if (!currentUser || currentUser.role !== 'admin') return;
    const basePaid = mergeRemotePaidCustomers(
      paidCustomersRef.current,
      storage.getPaidCustomers(),
      storage.getDeletedPaidCustomerIds()
    );
    const target = basePaid.find((c) => c.id === customerId);
    if (!target) return;

    const renewed = renewPaidCustomer(target);
    const nextPaid = basePaid.map((c) => (c.id === customerId ? renewed : c));
    paidCustomersRef.current = nextPaid;
    setPaidCustomers(nextPaid);
    const matchedLead = leadsRef.current.find((l) => l.id === renewed.leadId);
    void upsertPaidCustomerInSupabase(renewed, matchedLead?.facebookLink ?? '').catch(() => {});

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
    if (!currentUser || currentUser.role !== 'admin') return;
    const basePaid = mergeRemotePaidCustomers(
      paidCustomersRef.current,
      storage.getPaidCustomers(),
      storage.getDeletedPaidCustomerIds()
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
    const matchedLead = leadsRef.current.find((l) => l.id === updated.leadId);
    void upsertPaidCustomerInSupabase(updated, matchedLead?.facebookLink ?? '').catch(() => {});

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

  const handleUpdatePaidCustomer = (
    customerId: string,
    updates: PaidCustomerEditInput
  ) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    const basePaid = mergeRemotePaidCustomers(
      paidCustomersRef.current,
      storage.getPaidCustomers(),
      storage.getDeletedPaidCustomerIds()
    );
    const target = basePaid.find((c) => c.id === customerId);
    if (!target) return;

    const updated = updatePaidCustomerDetails(target, updates);
    const nextPaid = basePaid.map((c) => (c.id === customerId ? updated : c));
    paidCustomersRef.current = nextPaid;
    setPaidCustomers(nextPaid);

    const matchedLead = leadsRef.current.find((l) => l.id === updated.leadId);
    void upsertPaidCustomerInSupabase(updated, matchedLead?.facebookLink ?? '').catch(() => {});

    const packageLabel = updated.packageName?.trim() || 'Not Assigned';
    appendAudit(
      currentUser,
      'PAID_CUSTOMER_UPDATED',
      `Updated Paid Customer ${updated.customerName} (${updated.phone}) · Package: ${packageLabel} · Agent: ${updated.assignedAgentName ?? 'Unassigned'} · Renewal: ${updated.renewalDate}`
    );

    addToast(
      'success',
      'Paid Customer Updated',
      `${updated.customerName} updated (${packageLabel}). Synced to Agent view, Supabase, and Google Sheets.`
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      {
        event: 'PAID_CUSTOMER_UPSERT',
        paidCustomer: updated,
        ...(target.phone !== updated.phone ? { previousPhone: target.phone } : {}),
      },
      leadsRef.current,
      callLogsRef.current
    );
  };

  const handleAddPaidCustomer = (
    input: PaidCustomerCreateInput
  ): { ok: boolean; error?: string } => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { ok: false, error: 'Only Admin / Supervisor can add Paid Customers.' };
    }

    const basePaid = mergeRemotePaidCustomers(
      paidCustomersRef.current,
      storage.getPaidCustomers(),
      storage.getDeletedPaidCustomerIds()
    );
    const createdRes = createManualPaidCustomer(input, basePaid);
    if (!createdRes.ok) {
      return { ok: false, error: createdRes.error };
    }

    const created = createdRes.customer;
    const corePhone = extractPhoneCoreKey(created.phone);
    storage.removeDeletedPaidCustomerIds(
      [created.id, corePhone ? `SHEET-PC-${corePhone}` : ''].filter(Boolean)
    );

    const nextPaid = [created, ...basePaid];
    paidCustomersRef.current = nextPaid;
    setPaidCustomers(nextPaid);

    void upsertPaidCustomerInSupabase(created, '').catch(() => {});

    const packageLabel = created.packageName?.trim() || 'Not Assigned';
    appendAudit(
      currentUser,
      'PAID_CUSTOMER_ADDED',
      `Added Paid Customer ${created.customerName} (${created.phone}) · Package: ${packageLabel} · Agent: ${created.assignedAgentName ?? 'Unassigned'} · Renewal: ${created.renewalDate}`
    );

    addToast(
      'success',
      'Paid Customer Added',
      `${created.customerName} assigned to ${created.assignedAgentName ?? 'Unassigned'} (${packageLabel}) and synced.`
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      { event: 'PAID_CUSTOMER_UPSERT', paidCustomer: created },
      leadsRef.current,
      callLogsRef.current
    );

    return { ok: true };
  };

  const handleDeletePaidCustomer = (customerId: string) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    const basePaid = mergeRemotePaidCustomers(
      paidCustomersRef.current,
      storage.getPaidCustomers(),
      storage.getDeletedPaidCustomerIds()
    );
    const target = basePaid.find((c) => c.id === customerId);
    if (!target) return;

    const corePhone = extractPhoneCoreKey(target.phone);
    const nextPaid = basePaid.filter((c) => c.id !== customerId);
    paidCustomersRef.current = nextPaid;
    setPaidCustomers(nextPaid);

    const tombstoneIds = [
      target.id,
      target.leadId ? `PC-${target.leadId}` : '',
      target.leadId,
      corePhone ? `SHEET-PC-${corePhone}` : '',
    ].filter(Boolean);
    const nextDeletedIds = storage.addDeletedPaidCustomerIds(tombstoneIds);

    void deletePaidCustomerInSupabase(customerId, {
      leadId: target.leadId,
      phone: target.phone,
    }).catch(() => {});
    void deletePaidCustomerViaApi(customerId, {
      leadId: target.leadId,
      phone: target.phone,
    }).catch(() => {});

    // Keep linked "Order Confirmed" lead status & Agent KPI consistent and prevent
    // FULL_SYNC on other browsers from resurrecting this deleted Paid Customer.
    let nextLeads = leadsRef.current;
    let downgradedLead: Lead | null = null;
    const matchedLead = leadsRef.current.find((l) => {
      if (l.status !== 'Order Confirmed') return false;
      if (target.leadId && l.id === target.leadId) return true;
      if (target.id === `PC-${l.id}`) return true;
      const leadCore = extractPhoneCoreKey(l.phone || l.rawPhone);
      return Boolean(corePhone && leadCore && leadCore === corePhone);
    });
    if (matchedLead) {
      downgradedLead = {
        ...matchedLead,
        status: 'Done',
        updatedAt: new Date().toISOString(),
      };
      nextLeads = leadsRef.current.map((l) =>
        l.id === matchedLead.id ? downgradedLead! : l
      );
      leadsRef.current = nextLeads;
      setLeads(nextLeads);
      void updateLeadInSupabase(downgradedLead).catch(() => {});
    }

    appendAudit(
      currentUser,
      'PAID_CUSTOMER_DELETED',
      `Deleted Paid Customer ${target.customerName} (${target.phone}) from Paid Customers`
    );

    addToast(
      'info',
      'Paid Customer Deleted',
      `${target.customerName} removed from Paid Customers, Agent view, Supabase, and Google Sheets.`
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      {
        event: 'PAID_CUSTOMER_DELETED',
        deletedPaidCustomer: {
          id: target.id,
          leadId: target.leadId,
          phone: target.phone,
          assignedAgentName: target.assignedAgentName,
        },
        deletedPaidCustomerIds: nextDeletedIds,
      },
      nextLeads,
      callLogsRef.current
    ).then(() => {
      if (downgradedLead) {
        void triggerRealtimeSync(
          settings.googleSheetsWebhookUrl,
          { event: 'LEAD_UPDATED', lead: downgradedLead },
          nextLeads,
          callLogsRef.current
        );
      }
    });
  };

  const handleUpdateCallScript = (script: string) => {
    const nextSettings: AppSettings = { ...settings, callScript: script };
    setSettings(nextSettings);
    void saveSettingsInSupabase(nextSettings).catch(() => {});
    addToast('success', 'Call Script Saved', 'Your updated script is ready for reference.');
  };

  // Admin handlers
  const handleToggleAutoAssign = (enabled: boolean) => {
    const dynamicAgents = getCallCenterAgents(teamMembersRef.current);
    const activeAgentsList = getActiveAgents(
      dynamicAgents,
      settings.disabledAgentIds
    );
    if (enabled && activeAgentsList.length === 0) {
      addToast(
        'warning',
        'No Active Agents Selected',
        'Turn ON at least 1 agent before enabling Round-Robin Auto-Assign.'
      );
      return;
    }
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
        ? `New leads will automatically distribute across ${activeAgentsList.length} active agent${
            activeAgentsList.length === 1 ? '' : 's'
          }.`
        : 'New leads will remain unassigned until manually assigned.'
    );
  };

  const handleToggleAgentAvailability = (agentId: string) => {
    const dynamicAgents = getCallCenterAgents(teamMembersRef.current);
    const agent = dynamicAgents.find((a) => a.id === agentId);
    if (!agent) return;

    const currentDisabled = settings.disabledAgentIds ?? [];
    const isCurrentlyDisabled = currentDisabled.includes(agentId);

    if (!isCurrentlyDisabled) {
      const remainingActiveCount = dynamicAgents.filter(
        (a) => a.id !== agentId && !currentDisabled.includes(a.id)
      ).length;
      if (settings.autoAssignEnabled && remainingActiveCount === 0) {
        addToast(
          'warning',
          'Cannot Disable Last Active Agent',
          'At least 1 agent must stay active while Auto-Assign is ON.'
        );
        return;
      }
    }

    const nextDisabled = isCurrentlyDisabled
      ? currentDisabled.filter((id) => id !== agentId)
      : [...currentDisabled, agentId];

    const nextSettings: AppSettings = {
      ...settings,
      disabledAgentIds: nextDisabled,
    };
    setSettings(nextSettings);
    void saveSettingsInSupabase(nextSettings).catch(() => {});

    if (currentUser) {
      appendAudit(
        currentUser,
        'SETTINGS_UPDATED',
        `${currentUser.name} marked agent ${agent.name} as ${
          isCurrentlyDisabled ? 'Active/ON' : 'Absent/OFF'
        } for auto-assignment`
      );
    }

    addToast(
      isCurrentlyDisabled ? 'success' : 'info',
      `${agent.name} Marked ${isCurrentlyDisabled ? 'Active (ON)' : 'Absent (OFF)'}`,
      isCurrentlyDisabled
        ? `${agent.name} is back in the Round-Robin rotation.`
        : `${agent.name} will be skipped during Round-Robin auto-assignment.`
    );
  };

  const handleReassignLead = (leadId: string, newAgentId: string | null) => {
    if (!currentUser) return;
    const target = leadsRef.current.find((l) => l.id === leadId);
    if (!target) return;

    const dynamicAgents = getCallCenterAgents(teamMembersRef.current, {
      includeInactive: true,
    });
    const agent = dynamicAgents.find((a) => a.id === newAgentId) ?? null;
    const updated: Lead = {
      ...target,
      assignedAgentId: agent ? agent.id : null,
      assignedAgentName: agent ? agent.name : null,
      updatedAt: new Date().toISOString(),
    };

    const nextLeads = leadsRef.current.map((l) => (l.id === leadId ? updated : l));
    leadsRef.current = nextLeads;
    setLeads(nextLeads);

    let updatedPaidCustomer: PaidCustomer | undefined;
    const basePaid = mergeRemotePaidCustomers(
      paidCustomersRef.current,
      storage.getPaidCustomers(),
      storage.getDeletedPaidCustomerIds()
    );
    const matchingPaid = basePaid.find(
      (c) => c.leadId === target.id || c.id === `PC-${target.id}`
    );
    if (matchingPaid) {
      updatedPaidCustomer = {
        ...matchingPaid,
        assignedAgentId: updated.assignedAgentId,
        assignedAgentName: updated.assignedAgentName,
        updatedAt: updated.updatedAt,
      };
      const nextPaid = basePaid.map((c) =>
        c.id === matchingPaid.id ? updatedPaidCustomer! : c
      );
      paidCustomersRef.current = nextPaid;
      setPaidCustomers(nextPaid);
    }

    void updateLeadInSupabase(updated, updatedPaidCustomer).catch(() => {});

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
      { event: 'LEAD_UPSERT', lead: updated, paidCustomer: updatedPaidCustomer },
      nextLeads,
      callLogsRef.current
    );
  };

  const handleCarryOverLeads = (input: CarryOverLeadsInput) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    const dynamicAgents = getCallCenterAgents(teamMembersRef.current, {
      includeInactive: true,
    });
    const result = carryOverPendingLeads(
      leadsRef.current,
      dynamicAgents,
      input,
      settings.roundRobinIndex,
      settings.disabledAgentIds
    );
    if (result.updatedLeads.length === 0) return;

    leadsRef.current = result.nextLeads;
    setLeads(result.nextLeads);

    if (input.assignMode === 'round-robin') {
      const nextSettings: AppSettings = {
        ...settings,
        roundRobinIndex: result.nextRoundRobinIndex,
      };
      setSettings(nextSettings);
      void saveSettingsInSupabase(nextSettings).catch(() => {});
    }

    if (result.updatedLeads.length === 1) {
      void updateLeadInSupabase(result.updatedLeads[0]).catch(() => {});
    } else {
      void importLeadsBatchInSupabase(result.updatedLeads, result.nextRoundRobinIndex).catch(() => {});
    }

    const sampleLead = result.updatedLeads[0];
    const targetSummary =
      input.assignMode === 'round-robin'
        ? 'Round-Robin agents'
        : input.assignMode === 'keep'
        ? 'current agent(s)'
        : sampleLead.assignedAgentName ?? 'Unassigned';

    appendAudit(
      currentUser,
      'LEAD_REASSIGNED',
      `Carried over ${result.updatedLeads.length} Pending lead${
        result.updatedLeads.length === 1 ? '' : 's'
      } to ${targetSummary} for ${result.targetDateYmd}`
    );

    addToast(
      'success',
      result.updatedLeads.length === 1
        ? 'Lead Carried Over'
        : `${result.updatedLeads.length} Leads Carried Over`,
      result.updatedLeads.length === 1
        ? `${sampleLead.customerName} (${sampleLead.phone}) scheduled for ${result.targetDateYmd} under ${
            sampleLead.assignedAgentName ?? 'Unassigned'
          }.`
        : `Scheduled ${result.updatedLeads.length} Pending leads for ${result.targetDateYmd} (${targetSummary}).`
    );

    if (result.updatedLeads.length === 1) {
      const prevAgent = result.previousAgentById[sampleLead.id];
      void triggerRealtimeSync(
        settings.googleSheetsWebhookUrl,
        {
          event: 'LEAD_UPDATED',
          lead: sampleLead,
          ...(prevAgent && prevAgent !== sampleLead.assignedAgentName
            ? { previousAgentName: prevAgent }
            : {}),
        },
        result.nextLeads,
        callLogsRef.current
      );
    } else {
      void triggerChunkedRealtimeSync(
        settings.googleSheetsWebhookUrl,
        {
          event: 'LEADS_BATCH_UPSERT',
          leads: result.updatedLeads,
        },
        result.nextLeads,
        callLogsRef.current
      );
    }
  };

  const handleUpdateCollectedLead = async (
    leadId: string,
    updates: LeadEditInput
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { ok: false, error: 'Only Admin / Supervisor can edit collected leads.' };
    }

    const currentLeads = mergeRemoteLeads(
      leadsRef.current,
      storage.getLeads(),
      storage.getDeletedLeadIds()
    );
    const target = currentLeads.find((l) => l.id === leadId);
    if (!target) {
      return { ok: false, error: 'Lead record could not be found.' };
    }

    const normalizedPhone = normalizeBdPhone(updates.phone);
    if (!normalizedPhone) {
      return { ok: false, error: 'Invalid Bangladeshi phone number.' };
    }

    const localDup = findDuplicateLead(
      currentLeads,
      normalizedPhone,
      updates.facebookLink,
      { excludeLeadId: target.id }
    );
    if (localDup) {
      return {
        ok: false,
        error: `Duplicate ${
          localDup.matchedBy === 'phone' ? 'Phone Number' : 'Facebook Link'
        } already registered on ${localDup.lead.customerName} (${localDup.lead.phone}).`,
      };
    }

    const sbDup = await checkLeadDuplicateInSupabase(
      normalizedPhone,
      updates.facebookLink,
      { excludeLeadId: target.id }
    );
    if (sbDup.ok && sbDup.isDuplicate && sbDup.existingLead) {
      return {
        ok: false,
        error: `Duplicate ${
          sbDup.matchedBy === 'facebook' ? 'Facebook Link' : 'Phone Number'
        } already exists in database on ${sbDup.existingLead.customerName} (${sbDup.existingLead.phone}).`,
      };
    }

    const updatedLead = updateLeadDetails(target, {
      ...updates,
      phone: normalizedPhone,
    });
    const nextLeads = currentLeads.map((l) => (l.id === leadId ? updatedLead : l));
    leadsRef.current = nextLeads;
    setLeads(nextLeads);

    let nextCallLogs = callLogsRef.current;
    const identityChanged =
      updatedLead.customerName !== target.customerName ||
      updatedLead.phone !== target.phone;
    const changedLogs: CallLog[] = [];
    if (identityChanged) {
      nextCallLogs = callLogsRef.current.map((log) => {
        if (log.leadId !== target.id) return log;
        const patched: CallLog = {
          ...log,
          customerName: updatedLead.customerName,
          phone: updatedLead.phone,
        };
        changedLogs.push(patched);
        return patched;
      });
      if (changedLogs.length > 0) {
        callLogsRef.current = nextCallLogs;
        setCallLogs(nextCallLogs);
      }
    }

    let syncedPaidCustomer: PaidCustomer | undefined;
    const basePaid = mergeRemotePaidCustomers(
      paidCustomersRef.current,
      storage.getPaidCustomers(),
      storage.getDeletedPaidCustomerIds()
    );
    const matchingPaid = basePaid.find(
      (c) => c.leadId === target.id || c.id === `PC-${target.id}`
    );
    if (matchingPaid) {
      syncedPaidCustomer = {
        ...matchingPaid,
        customerName: updatedLead.customerName,
        phone: updatedLead.phone,
        assignedAgentId: updatedLead.assignedAgentId,
        assignedAgentName: updatedLead.assignedAgentName,
        updatedAt: updatedLead.updatedAt,
      };
      const nextPaid = basePaid.map((c) =>
        c.id === matchingPaid.id ? syncedPaidCustomer! : c
      );
      paidCustomersRef.current = nextPaid;
      setPaidCustomers(nextPaid);
    } else if (updatedLead.status === 'Order Confirmed') {
      syncedPaidCustomer = upsertPaidCustomerForOrderConfirmed(updatedLead, currentUser);
    }

    void updateLeadInSupabase(updatedLead, syncedPaidCustomer).catch(() => {});
    if (changedLogs.length > 0) {
      void syncPulledRecordsToSupabase({ callLogs: changedLogs }).catch(() => {});
    }

    appendAudit(
      currentUser,
      'LEAD_UPDATED',
      `Edited collected lead ${updatedLead.customerName} (${updatedLead.phone}) · Agent: ${
        updatedLead.assignedAgentName ?? 'Unassigned'
      } · Status: ${updatedLead.status}`
    );

    addToast(
      'success',
      'Lead Updated',
      `${updatedLead.customerName} (${updatedLead.phone}) updated and synced across queues, Supabase, and Google Sheets.`
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      {
        event: 'LEAD_UPDATED',
        lead: updatedLead,
        ...(syncedPaidCustomer ? { paidCustomer: syncedPaidCustomer } : {}),
        ...(target.assignedAgentName !== updatedLead.assignedAgentName
          ? { previousAgentName: target.assignedAgentName }
          : {}),
        ...(target.collectorName !== updatedLead.collectorName
          ? { previousCollectorName: target.collectorName }
          : {}),
        ...(target.phone !== updatedLead.phone ? { previousPhone: target.phone } : {}),
      },
      nextLeads,
      nextCallLogs
    );

    return { ok: true };
  };

  const handleDeleteCollectedLead = (leadId: string) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    const currentLeads = mergeRemoteLeads(
      leadsRef.current,
      storage.getLeads(),
      storage.getDeletedLeadIds()
    );
    const target = currentLeads.find((l) => l.id === leadId);
    if (!target) return;

    const nextLeads = currentLeads.filter((l) => l.id !== leadId);
    leadsRef.current = nextLeads;
    setLeads(nextLeads);

    const corePhone = extractPhoneCoreKey(target.phone || target.rawPhone);
    const tombstoneIds = [
      target.id,
      corePhone ? `SHEET-PH-${corePhone}` : '',
    ].filter(Boolean);
    const nextDeletedLeadIds = storage.addDeletedLeadIds(tombstoneIds);

    void deleteLeadInSupabase(leadId).catch(() => {});
    void deleteLeadViaApi(leadId).catch(() => {});

    appendAudit(
      currentUser,
      'LEAD_DELETED',
      `Deleted collected lead ${target.customerName} (${target.phone}) · Collector: ${target.collectorName}`
    );

    addToast(
      'info',
      'Lead Deleted',
      `${target.customerName} (${target.phone}) removed from queues, Supabase, and Google Sheets.`
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      {
        event: 'LEAD_DELETED',
        deletedLead: {
          id: target.id,
          phone: target.phone,
          collectorName: target.collectorName,
          assignedAgentName: target.assignedAgentName,
        },
        deletedLeadIds: nextDeletedLeadIds,
      },
      nextLeads,
      callLogsRef.current
    );
  };

  // Team Management handlers (Supabase persisted + Audit Logs)
  const handleCreateTeamMember = async (input: {
    name: string;
    email: string;
    role: User['role'];
    password: string;
    title?: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { ok: false, error: 'Only Admin / Supervisor can add team members.' };
    }
    const res = await createTeamMemberViaApi(input);
    if (res.schemaMissing) {
      setTeamSchemaMissing(true);
    }
    if (!res.ok || !res.member) {
      return { ok: false, error: res.error ?? 'Failed to add team member.' };
    }

    setTeamSchemaMissing(false);
    setTeamMembers((prev) => {
      const next = [...prev.filter((m) => m.id !== res.member!.id), res.member!];
      teamMembersRef.current = next;
      return next;
    });

    appendAudit(
      currentUser,
      'TEAM_MEMBER_ADDED',
      `Added ${res.member.role} account ${res.member.name} (${res.member.email})`
    );
    addToast(
      'success',
      'Team Member Added',
      `${res.member.name} (${res.member.email}) can now sign in and join the workspace.`
    );
    return { ok: true };
  };

  const handleUpdateTeamMember = async (
    memberId: string,
    patch: {
      name?: string;
      role?: User['role'];
      title?: string;
      isActive?: boolean;
      password?: string;
    }
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { ok: false, error: 'Only Admin / Supervisor can update team members.' };
    }
    const res = await updateTeamMemberViaApi(memberId, patch, currentUser.id);
    if (res.schemaMissing) {
      setTeamSchemaMissing(true);
    }
    if (!res.ok || !res.member) {
      addToast('error', 'Update Failed', res.error ?? 'Could not update team member.');
      return { ok: false, error: res.error ?? 'Could not update team member.' };
    }

    setTeamSchemaMissing(false);
    setTeamMembers((prev) => {
      const next = prev.map((m) => (m.id === memberId ? res.member! : m));
      teamMembersRef.current = next;
      return next;
    });
    if (memberId === currentUser.id) {
      setCurrentUser(res.member);
    }

    if (patch.password) {
      appendAudit(
        currentUser,
        'TEAM_MEMBER_PASSWORD_RESET',
        `Reset password for ${res.member.name} (${res.member.email})`
      );
      addToast(
        'success',
        'Password Reset',
        `Updated credentials for ${res.member.name}.`
      );
    } else if (typeof patch.isActive === 'boolean') {
      appendAudit(
        currentUser,
        'TEAM_MEMBER_STATUS_CHANGED',
        `${patch.isActive ? 'Activated' : 'Deactivated'} ${res.member.role} ${res.member.name} (${res.member.email})`
      );
      addToast(
        patch.isActive ? 'success' : 'info',
        patch.isActive ? 'Member Activated' : 'Member Deactivated',
        patch.isActive
          ? `${res.member.name} is active across Login and team workflows.`
          : `${res.member.name} has been deactivated and removed from active login and auto-assign.`
      );
    } else {
      appendAudit(
        currentUser,
        'TEAM_MEMBER_UPDATED',
        `Updated team member ${res.member.name} (${res.member.email} · ${res.member.role})`
      );
      addToast('success', 'Member Updated', `Saved changes for ${res.member.name}.`);
    }

    return { ok: true };
  };

  const handleDeleteTeamMember = async (
    memberId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { ok: false, error: 'Only Admin / Supervisor can remove team members.' };
    }
    const target = teamMembersRef.current.find((m) => m.id === memberId);
    const res = await deleteTeamMemberViaApi(memberId, currentUser.id);
    if (res.schemaMissing) {
      setTeamSchemaMissing(true);
    }
    if (!res.ok) {
      return { ok: false, error: res.error ?? 'Could not remove team member.' };
    }

    setTeamSchemaMissing(false);
    setTeamMembers((prev) => {
      const next = prev.filter((m) => m.id !== memberId);
      teamMembersRef.current = next;
      return next;
    });

    if (settings.disabledAgentIds.includes(memberId)) {
      const nextSettings: AppSettings = {
        ...settings,
        disabledAgentIds: settings.disabledAgentIds.filter((id) => id !== memberId),
      };
      setSettings(nextSettings);
      void saveSettingsInSupabase(nextSettings).catch(() => {});
    }

    const labelName = res.removedMember?.name ?? target?.name ?? memberId;
    const labelEmail = res.removedMember?.email ?? target?.email ?? '';
    appendAudit(
      currentUser,
      'TEAM_MEMBER_REMOVED',
      `Removed team member ${labelName}${labelEmail ? ` (${labelEmail})` : ''}`
    );
    addToast('info', 'Team Member Removed', `${labelName} has been removed.`);
    return { ok: true };
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
    const manualController = beginManualSyncController();
    const syncLeads = leadsRef.current.length > 0 ? leadsRef.current : leads;
    const todayCallLogs = filterTodayCallLogs(callLogs);
    const todayPosts = filterTodayPosts(contentPosts);
    try {
      const res = await triggerChunkedRealtimeSync(
        url,
        {
          event: 'TEST_SYNC',
          leads: syncLeads,
          callLogs: todayCallLogs,
          contentPosts: todayPosts,
          paidCustomers,
        },
        syncLeads,
        todayCallLogs,
        contentPosts,
        {
          isManual: true,
          signal: manualController.signal,
          timeoutMs: DEFAULT_SHEETS_SYNC_TIMEOUT_MS,
          finalTimeoutMs: FULL_SYNC_TIMEOUT_MS,
          onProgressLabel: setSheetsSyncProgress,
        }
      );
      if (res.superseded) return;
      if (res.ok) {
        const batchSuffix =
          res.totalChunks > 1 ? ` across ${res.totalChunks} batches` : '';
        if (currentUser) {
          appendAudit(
            currentUser,
            'SHEETS_SYNCED',
            `Synced ${syncLeads.length} leads, ${todayCallLogs.length} today call logs, ${todayPosts.length} posts, and ${paidCustomers.length} paid customers to Google Sheets${batchSuffix} (Master, Collector_*, Agent_*, Paid_*)`
          );
        }
        addToast(
          'success',
          'Google Sheets Synced',
          `Synced ${syncLeads.length} lead(s)${batchSuffix} across Master_Data, Collector_<Name>, Agent_<Name>, Paid_<Agent>, Daily_Summary, and Paid_Customers.`
        );
      } else {
        addToast(
          'error',
          res.timedOut ? 'Sync Timed Out' : 'Sync Failed',
          res.error ?? 'Check your Google Apps Script Web App URL and deployment permissions.'
        );
      }
    } finally {
      setSheetsSyncProgress(null);
      endManualSyncController(manualController);
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
      const scheduled = getScheduledFollowUps(leads, currentUser.id).length;
      return { label: 'Scheduled Follow-ups', value: String(scheduled) };
    }
    if (currentUser.role === 'poster') {
      const postStats = computeKawsarPostStats(contentPosts);
      return { label: 'Entries Today', value: String(postStats.todayCount) };
    }
    const mineToday = filterCollectorTodayLeads(leads).filter(
      (l) => l.collectorId === currentUser.id
    ).length;
    return { label: 'Collected Today', value: String(mineToday) };
  }, [currentUser, leads, contentPosts]);

  if (!currentUser) {
    return (
      <>
        <LoginScreen
          teamMembers={teamMembers}
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
        onMarkPaidCustomerRenewed={
          currentUser.role === 'admin' ? handleMarkPaidCustomerRenewed : undefined
        }
      >
        {currentUser.role === 'admin' && activeTab === 'admin-overview' && (
          <AdminDashboardView
            agents={callCenterAgents}
            collectors={dataCollectors}
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
            agents={callCenterAgents}
            collectors={dataCollectors}
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
            agents={callCenterAgents}
            leads={leads}
            autoAssignEnabled={settings.autoAssignEnabled}
            roundRobinIndex={settings.roundRobinIndex}
            disabledAgentIds={settings.disabledAgentIds}
            onToggleAutoAssign={handleToggleAutoAssign}
            onToggleAgentAvailability={handleToggleAgentAvailability}
            onReassignLead={handleReassignLead}
            onUpdateLeadStatus={handleAdminUpdateLeadStatus}
            onCarryOverLeads={handleCarryOverLeads}
            onExportCsv={() =>
              addToast('success', 'CSV Exported', "Today's leads database downloaded.")
            }
          />
        )}

        {(currentUser.role === 'admin' || currentUser.role === 'agent') &&
          activeTab === 'paid-customers' && (
            <PaidCustomersView
              currentUser={currentUser}
              agents={callCenterAgents}
              paidCustomers={paidCustomers}
              onAddPaidCustomer={
                currentUser.role === 'admin' ? handleAddPaidCustomer : undefined
              }
              onMarkRenewed={
                currentUser.role === 'admin' ? handleMarkPaidCustomerRenewed : undefined
              }
              onUpdateRenewalStatus={
                currentUser.role === 'admin' ? handleUpdatePaidCustomerStatus : undefined
              }
              onUpdatePaidCustomer={
                currentUser.role === 'admin' ? handleUpdatePaidCustomer : undefined
              }
              onDeletePaidCustomer={
                currentUser.role === 'admin' ? handleDeletePaidCustomer : undefined
              }
              onExportCsv={() =>
                addToast('success', 'CSV Exported', 'Paid Customers & Renewals report downloaded.')
              }
              onPhoneCopied={(cleanPhone) =>
                addToast('success', 'Phone number copied', cleanPhone)
              }
            />
          )}

        {(currentUser.role === 'collector' ||
          (currentUser.role === 'admin' && activeTab === 'data-collection')) && (
          <DataCollectionView
            currentUser={currentUser}
            allLeads={leads}
            agents={callCenterAgents}
            duplicateAttempts={duplicateAttempts}
            autoAssignEnabled={settings.autoAssignEnabled}
            onCheckPhoneDuplicate={handleCheckPhoneDuplicate}
            onAddSingleLead={handleAddSingleLead}
            onImportBulkLeads={handleImportBulkLeads}
            onRecordDuplicateAttempt={handleRecordDuplicateAttempt}
            onUpdateLead={
              currentUser.role === 'admin' ? handleUpdateCollectedLead : undefined
            }
            onDeleteLead={
              currentUser.role === 'admin' ? handleDeleteCollectedLead : undefined
            }
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
            paidCustomers={paidCustomers}
            callScript={settings.callScript}
            dueRenewals={dueRenewals}
            onOpenPaidCustomers={() => setActiveTab('paid-customers')}
            onOpenTodayCalls={() => setActiveTab('agent-today-calls')}
            onUpdateCallScript={handleUpdateCallScript}
            onPhoneCopied={(cleanPhone) =>
              addToast('success', 'Phone number copied', cleanPhone)
            }
            onLogCall={handleLogCall}
          />
        )}

        {currentUser.role === 'agent' && activeTab === 'agent-today-calls' && (
          <AgentTodayCallsView
            agent={currentUser}
            callLogs={callLogs}
            leads={leads}
            onBackToQueue={() => setActiveTab('agent-workspace')}
            onPhoneCopied={(cleanPhone) =>
              addToast('success', 'Phone number copied', cleanPhone)
            }
            onLogCall={handleLogCall}
          />
        )}

        {currentUser.role === 'admin' && activeTab === 'admin-audit' && (
          <AdminAuditView auditLogs={auditLogs} />
        )}

        {currentUser.role === 'admin' && activeTab === 'admin-team' && (
          <AdminTeamManagementView
            currentUser={currentUser}
            teamMembers={teamMembers}
            loading={teamLoading}
            schemaMissing={teamSchemaMissing}
            onRefresh={() => refreshTeamMembers('admin')}
            onOpenSheetsSettings={() => setActiveTab('admin-sheets')}
            onCreateMember={handleCreateTeamMember}
            onUpdateMember={handleUpdateTeamMember}
            onDeleteMember={handleDeleteTeamMember}
          />
        )}

        {currentUser.role === 'admin' && activeTab === 'admin-sheets' && (
          <AdminSheetsView
            agents={callCenterAgents}
            collectors={dataCollectors}
            webhookUrl={settings.googleSheetsWebhookUrl}
            defaultWebhookUrl={DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL}
            lastSyncedAt={settings.lastSyncedAt}
            syncStatus={syncStatus}
            syncProgressText={sheetsSyncProgress}
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
              await syncFromSheets(url, { notify: true, scope: 'today', isManual: true });
            }}
            onClearCacheAndSyncToday={handleClearLocalCacheAndSyncToday}
          />
        )}
      </Layout>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
