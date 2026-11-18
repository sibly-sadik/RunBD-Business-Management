import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminAuditView } from './components/AdminAuditView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AdminFinalDailySummaryView } from './components/AdminFinalDailySummaryView';
import { AdminLeadsView } from './components/AdminLeadsView';
import { AdminSheetsView } from './components/AdminSheetsView';
import { AgentWorkspaceView } from './components/AgentWorkspaceView';
import { DataCollectionView } from './components/DataCollectionView';
import { KawsarPostsView } from './components/KawsarPostsView';
import { Layout, NavTab } from './components/Layout';
import { LoginScreen } from './components/LoginScreen';
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
  SyncStatus,
  ToastMessage,
  User,
} from './types';
import {
  assignLeadsRoundRobin,
  computeDashboardMetrics,
  computeFinalDailySummary,
  computeKawsarPostStats,
  findDuplicateLead,
  findDuplicatePost,
  formatShortDate,
  getScheduledFollowUps,
  isValidPostUrl,
  normalizeBdPhone,
  normalizeFacebookUrl,
  normalizePostUrl,
} from './utils/leadLogic';
import { pushToGoogleSheetsWebhook, SheetsSyncPayload, storage } from './utils/storage';

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
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const savedId = storage.getSessionUserId();
    if (!savedId) return null;
    return DEMO_USERS.find((u) => u.id === savedId) ?? null;
  });

  const [activeTab, setActiveTab] = useState<NavTab>(() =>
    currentUser ? defaultTabForRole(currentUser.role) : 'admin-overview'
  );

  const [leads, setLeads] = useState<Lead[]>(() => storage.getLeads());
  const [callLogs, setCallLogs] = useState<CallLog[]>(() => storage.getCallLogs());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => storage.getAuditLogs());
  const [duplicateAttempts, setDuplicateAttempts] = useState<DuplicateAttempt[]>(() =>
    storage.getDuplicates()
  );
  const [contentPosts, setContentPosts] = useState<ContentPost[]>(() =>
    storage.getContentPosts()
  );
  const [settings, setSettings] = useState<AppSettings>(() => storage.getSettings());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    storage.getSettings().googleSheetsWebhookUrl ? 'synced' : 'offline'
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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
    },
    []
  );

  const buildDailySummary = useCallback(
    (nextLeads: Lead[], nextCallLogs: CallLog[]) => {
      const m = computeDashboardMetrics(nextLeads, nextCallLogs, {
        preset: 'all',
        startDate: '',
        endDate: '',
      });
      return {
        date: new Date().toISOString().slice(0, 10),
        totalLeads: m.totalLeads,
        callsMadeToday: m.callsMadeToday,
        orderConfirmedCount: m.orderConfirmedCount,
        interestedCount: m.interestedCount,
        conversionRate: m.conversionRate,
      };
    },
    []
  );

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

      setSyncStatus('syncing');
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

      if (res.ok) {
        setSyncStatus('synced');
        setSettings((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
      } else {
        setSyncStatus('error');
      }
      return res;
    },
    [buildDailySummary, contentPosts]
  );

  // Auth handlers
  const handleLogin = (user: User) => {
    setCurrentUser(user);
    storage.saveSessionUserId(user.id);
    setActiveTab(defaultTabForRole(user.role));
    appendAudit(user, 'LOGIN', `Signed into ${user.role} workspace`);
    addToast('success', `Welcome back, ${user.name}`, `Signed in as ${user.title}`);
  };

  const handleLogout = () => {
    if (currentUser) {
      appendAudit(currentUser, 'LOGOUT', 'Signed out of session');
    }
    setCurrentUser(null);
    storage.saveSessionUserId(null);
    addToast('info', 'Signed out', 'Your session has been closed.');
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Data Collection handlers
  const handleRecordDuplicateAttempt = (
    attempt: Omit<DuplicateAttempt, 'id' | 'timestamp'>
  ) => {
    const record: DuplicateAttempt = {
      ...attempt,
      id: makeId('DUP'),
      timestamp: new Date().toISOString(),
    };
    setDuplicateAttempts((prev) => [record, ...prev]);
    addToast(
      'warning',
      'Duplicate Lead Blocked',
      `Already added by ${attempt.existingCollectorName} on ${formatShortDate(
        attempt.existingDate
      )}`
    );
  };

  const handleAddSingleLead = (input: {
    customerName: string;
    rawPhone: string;
    facebookLink: string;
    notes: string;
  }): { ok: boolean; error?: string } => {
    if (!currentUser) return { ok: false, error: 'Not authenticated' };

    const normalizedPhone = normalizeBdPhone(input.rawPhone);
    if (!normalizedPhone) {
      return { ok: false, error: 'Invalid Bangladeshi phone number.' };
    }

    const dup = findDuplicateLead(leads, input.rawPhone, input.facebookLink);
    if (dup) {
      handleRecordDuplicateAttempt({
        collectorId: currentUser.id,
        collectorName: currentUser.name,
        attemptedName: input.customerName,
        attemptedPhone: input.rawPhone,
        attemptedFacebook: input.facebookLink,
        matchedBy: dup.matchedBy,
        existingCollectorName: dup.lead.collectorName,
        existingDate: dup.lead.createdAt,
      });
      return {
        ok: false,
        error: `Duplicate Found: Already added by ${dup.lead.collectorName} on ${formatShortDate(
          dup.lead.createdAt
        )}`,
      };
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
    const nextLeads = [created, ...leads];
    setLeads(nextLeads);
    setSettings((prev) => ({ ...prev, roundRobinIndex: nextIndex }));

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
      callLogs
    );

    return { ok: true };
  };

  const handleImportBulkLeads = (validRows: CsvPreviewRow[]) => {
    if (!currentUser || validRows.length === 0) return;

    const nowIso = new Date().toISOString();
    const workingLeads = [...leads];
    const acceptedRows: CsvPreviewRow[] = [];
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
      acceptedRows.push(r);
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

    if (acceptedRows.length === 0) {
      addToast('warning', 'Import Blocked', 'All rows were duplicates already in the database.');
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

    const nextLeads = [...assignedLeads, ...leads];
    setLeads(nextLeads);
    setSettings((prev) => ({ ...prev, roundRobinIndex: nextIndex }));

    appendAudit(
      currentUser,
      'BULK_IMPORT',
      `Imported ${assignedLeads.length} valid leads via CSV (${
        settings.autoAssignEnabled ? 'Round-Robin distributed' : 'Unassigned'
      })`
    );

    addToast(
      'success',
      `Imported ${assignedLeads.length} Leads`,
      settings.autoAssignEnabled
        ? 'Distributed equally across the 6 call center agents.'
        : 'Added to the unassigned queue.'
    );

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      { event: 'FULL_SYNC', leads: nextLeads, callLogs, contentPosts },
      nextLeads,
      callLogs
    );
  };

  // Kawsar Content & Link Poster handler
  const handleAddContentPost = (input: {
    facebookLink: string;
    websiteLink: string;
    note: string;
  }): {
    ok: boolean;
    error?: string;
    duplicate?: { post: ContentPost; matchedField: 'Facebook Link' | 'Website Link' };
  } => {
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

    const dup = findDuplicatePost(contentPosts, trimmedFb, trimmedWeb);
    if (dup) {
      addToast(
        'warning',
        `Duplicate ${dup.matchedField} Blocked`,
        `Already submitted on ${formatShortDate(dup.post.createdAt)}.`
      );
      return {
        ok: false,
        error: `Duplicate ${dup.matchedField}: already submitted on ${formatShortDate(
          dup.post.createdAt
        )}.`,
        duplicate: dup,
      };
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

    const nextPosts = [created, ...contentPosts];
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
      leads,
      callLogs,
      nextPosts
    );

    return { ok: true };
  };

  // Agent Call Logging handler
  const handleLogCall = (input: {
    leadId: string;
    newStatus: CallStatus;
    followUpAt: string | null;
    notes: string;
  }) => {
    if (!currentUser) return;
    const target = leads.find((l) => l.id === input.leadId);
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

    const nextLeads = leads.map((l) => (l.id === target.id ? updatedLead : l));
    const nextCallLogs = [newLog, ...callLogs];

    setLeads(nextLeads);
    setCallLogs(nextCallLogs);

    appendAudit(
      currentUser,
      'STATUS_UPDATED',
      `Updated ${target.customerName} from ${target.status} to ${input.newStatus}`
    );

    addToast('success', 'Call Logged', `${target.customerName} marked as ${input.newStatus}.`);

    void triggerRealtimeSync(
      settings.googleSheetsWebhookUrl,
      { event: 'CALL_LOGGED', lead: updatedLead, callLog: newLog },
      nextLeads,
      nextCallLogs
    );
  };

  const handleUpdateCallScript = (script: string) => {
    setSettings((prev) => ({ ...prev, callScript: script }));
    addToast('success', 'Call Script Saved', 'Your updated script is ready for reference.');
  };

  // Admin handlers
  const handleToggleAutoAssign = (enabled: boolean) => {
    setSettings((prev) => ({ ...prev, autoAssignEnabled: enabled }));
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
    const target = leads.find((l) => l.id === leadId);
    if (!target) return;

    const agent = CALL_CENTER_AGENTS.find((a) => a.id === newAgentId) ?? null;
    const updated: Lead = {
      ...target,
      assignedAgentId: agent ? agent.id : null,
      assignedAgentName: agent ? agent.name : null,
      updatedAt: new Date().toISOString(),
    };

    const nextLeads = leads.map((l) => (l.id === leadId ? updated : l));
    setLeads(nextLeads);

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
      callLogs
    );
  };

  const handleSaveWebhookUrl = (url: string) => {
    setSettings((prev) => ({ ...prev, googleSheetsWebhookUrl: url }));
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
    const res = await triggerRealtimeSync(
      url,
      { event: 'TEST_SYNC', leads, callLogs, contentPosts },
      leads,
      callLogs
    );
    if (res.ok) {
      if (currentUser) {
        appendAudit(
          currentUser,
          'SHEETS_SYNCED',
          `Synced ${leads.length} leads, ${callLogs.length} call logs, and ${contentPosts.length} post links to Google Sheets`
        );
      }
      addToast(
        'success',
        'Google Sheets Synced',
        'Master_Data, Agent_Logs, Daily_Summary, and Kawsar_Posts_Log synced.'
      );
    } else {
      addToast(
        'error',
        'Sync Failed',
        res.error ?? 'Check your Google Apps Script Web App URL and deployment permissions.'
      );
    }
  };

  // Top bar contextual quick stat per role
  const quickStat = useMemo(() => {
    if (!currentUser) return { label: '', value: '' };
    if (currentUser.role === 'admin') {
      const confirmed = leads.filter((l) => l.status === 'Order Confirmed').length;
      return { label: 'Confirmed Orders', value: `${confirmed} / ${leads.length}` };
    }
    if (currentUser.role === 'agent') {
      const scheduled = getScheduledFollowUps(leads, currentUser.id).length;
      return { label: 'Scheduled Follow-ups', value: String(scheduled) };
    }
    if (currentUser.role === 'poster') {
      const postStats = computeKawsarPostStats(contentPosts);
      return { label: 'Entries Today', value: String(postStats.todayCount) };
    }
    const mine = leads.filter((l) => l.collectorId === currentUser.id).length;
    return { label: 'My Valid Leads', value: String(mine) };
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
      >
        {currentUser.role === 'admin' && activeTab === 'admin-overview' && (
          <AdminDashboardView
            leads={leads}
            callLogs={callLogs}
            duplicateAttempts={duplicateAttempts}
            contentPosts={contentPosts}
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
            onExportCsv={() =>
              addToast('success', 'CSV Exported', 'Master leads database downloaded.')
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
            onAddSingleLead={handleAddSingleLead}
            onImportBulkLeads={handleImportBulkLeads}
            onRecordDuplicateAttempt={handleRecordDuplicateAttempt}
          />
        )}

        {(currentUser.role === 'poster' ||
          (currentUser.role === 'admin' && activeTab === 'kawsar-posts')) && (
          <KawsarPostsView
            posts={contentPosts}
            canSubmit={currentUser.role === 'poster' || currentUser.role === 'admin'}
            onAddPost={handleAddContentPost}
          />
        )}

        {currentUser.role === 'agent' && (
          <AgentWorkspaceView
            agent={currentUser}
            leads={leads}
            callLogs={callLogs}
            callScript={settings.callScript}
            onUpdateCallScript={handleUpdateCallScript}
            onLogCall={handleLogCall}
          />
        )}

        {currentUser.role === 'admin' && activeTab === 'admin-audit' && (
          <AdminAuditView auditLogs={auditLogs} />
        )}

        {currentUser.role === 'admin' && activeTab === 'admin-sheets' && (
          <AdminSheetsView
            webhookUrl={settings.googleSheetsWebhookUrl}
            lastSyncedAt={settings.lastSyncedAt}
            syncStatus={syncStatus}
            onSaveWebhookUrl={handleSaveWebhookUrl}
            onTestAndSync={handleTestAndSyncSheets}
          />
        )}
      </Layout>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
