import {
  AppSettings,
  AuditLog,
  CallLog,
  ContentPost,
  DuplicateAttempt,
  Lead,
  PaidCustomer,
  User,
} from '../types';
import { FinalDailySummary, getLocalDateString, normalizeBdPhone } from './leadLogic';
import {
  buildSheetsSyncChunks,
  DEFAULT_SHEETS_BATCH_SIZE,
  filterPullPayloadByDate,
  getDefaultWebhookUrl,
  LeadDuplicateCheckResult,
  ParsedPullPayload,
  parseLeadDuplicateCheckResponse,
  parsePostDuplicateCheckResponse,
  parsePullPayload,
  PostDuplicateCheckResult,
  resolveWebhookUrl,
  SheetsBatchEvent,
  SyncPaidCustomerPayload,
} from './sheetsSync';
import {
  createSeedAuditLogs,
  createSeedCallLogs,
  createSeedContentPosts,
  createSeedDuplicateAttempts,
  createSeedLeads,
  createSeedPaidCustomers,
  DEFAULT_SETTINGS,
  DEMO_USERS,
} from '../data/seedData';
import { stripUserPassword } from './teamLogic';

const ENV_GOOGLE_SHEET_WEBHOOK_URL =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_GOOGLE_SHEET_WEBHOOK_URL ?? '';

export const DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL = getDefaultWebhookUrl(
  ENV_GOOGLE_SHEET_WEBHOOK_URL
);

const STORAGE_KEYS = {
  LEADS: 'runbd_leads_v2',
  CALL_LOGS: 'runbd_call_logs_v2',
  AUDIT_LOGS: 'runbd_audit_logs_v2',
  DUPLICATES: 'runbd_duplicates_v2',
  CONTENT_POSTS: 'runbd_content_posts_v2',
  PAID_CUSTOMERS: 'runbd_paid_customers_v1',
  DELETED_PAID_IDS: 'runbd_deleted_paid_ids_v1',
  DELETED_LEAD_IDS: 'runbd_deleted_lead_ids_v1',
  SETTINGS: 'runbd_settings_v2',
  WEBHOOK_VERSION: 'runbd_webhook_version_v1',
  SESSION_USER_ID: 'runbd_session_user_v2',
  TEAM_MEMBERS: 'runbd_team_members_v1',
  THEME: 'runbd_theme_v1',
};

const CURRENT_WEBHOOK_VERSION = '2026-11-25-v1';

function safeRead<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      const initial = fallback();
      localStorage.setItem(key, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback();
  }
}

function safeWrite<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

export const storage = {
  getLeads: () => safeRead<Lead[]>(STORAGE_KEYS.LEADS, createSeedLeads),
  saveLeads: (leads: Lead[]) => safeWrite(STORAGE_KEYS.LEADS, leads),
  clearLeadsCache: () => {
    safeWrite<Lead[]>(STORAGE_KEYS.LEADS, []);
    safeWrite<CallLog[]>(STORAGE_KEYS.CALL_LOGS, []);
    safeWrite<ContentPost[]>(STORAGE_KEYS.CONTENT_POSTS, []);
    safeWrite<DuplicateAttempt[]>(STORAGE_KEYS.DUPLICATES, []);
  },

  getCallLogs: () => safeRead<CallLog[]>(STORAGE_KEYS.CALL_LOGS, createSeedCallLogs),
  saveCallLogs: (logs: CallLog[]) => safeWrite(STORAGE_KEYS.CALL_LOGS, logs),

  getAuditLogs: () => safeRead<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, createSeedAuditLogs),
  saveAuditLogs: (logs: AuditLog[]) => safeWrite(STORAGE_KEYS.AUDIT_LOGS, logs),

  getDuplicates: () =>
    safeRead<DuplicateAttempt[]>(STORAGE_KEYS.DUPLICATES, createSeedDuplicateAttempts),
  saveDuplicates: (items: DuplicateAttempt[]) => safeWrite(STORAGE_KEYS.DUPLICATES, items),

  getContentPosts: () =>
    safeRead<ContentPost[]>(STORAGE_KEYS.CONTENT_POSTS, createSeedContentPosts),
  saveContentPosts: (posts: ContentPost[]) => safeWrite(STORAGE_KEYS.CONTENT_POSTS, posts),

  getPaidCustomers: () =>
    safeRead<PaidCustomer[]>(STORAGE_KEYS.PAID_CUSTOMERS, createSeedPaidCustomers),
  savePaidCustomers: (customers: PaidCustomer[]) =>
    safeWrite(STORAGE_KEYS.PAID_CUSTOMERS, customers),

  getDeletedPaidCustomerIds: (): string[] =>
    safeRead<string[]>(STORAGE_KEYS.DELETED_PAID_IDS, () => []),
  saveDeletedPaidCustomerIds: (ids: string[]) =>
    safeWrite(
      STORAGE_KEYS.DELETED_PAID_IDS,
      Array.from(
        new Set(
          ids
            .map((id) => String(id || '').trim())
            .filter(Boolean)
        )
      )
    ),
  addDeletedPaidCustomerIds: (ids: string[]) => {
    const existing = safeRead<string[]>(STORAGE_KEYS.DELETED_PAID_IDS, () => []);
    const merged = Array.from(
      new Set(
        [...existing, ...ids]
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      )
    );
    safeWrite(STORAGE_KEYS.DELETED_PAID_IDS, merged);
    return merged;
  },
  removeDeletedPaidCustomerIds: (ids: string[]) => {
    const toRemove = new Set(
      ids.map((id) => String(id || '').trim()).filter(Boolean)
    );
    const existing = safeRead<string[]>(STORAGE_KEYS.DELETED_PAID_IDS, () => []);
    const next = existing.filter((id) => !toRemove.has(id));
    safeWrite(STORAGE_KEYS.DELETED_PAID_IDS, next);
    return next;
  },

  getDeletedLeadIds: (): string[] =>
    safeRead<string[]>(STORAGE_KEYS.DELETED_LEAD_IDS, () => []),
  saveDeletedLeadIds: (ids: string[]) =>
    safeWrite(
      STORAGE_KEYS.DELETED_LEAD_IDS,
      Array.from(
        new Set(
          ids
            .map((id) => String(id || '').trim())
            .filter(Boolean)
        )
      )
    ),
  addDeletedLeadIds: (ids: string[]) => {
    const existing = safeRead<string[]>(STORAGE_KEYS.DELETED_LEAD_IDS, () => []);
    const merged = Array.from(
      new Set(
        [...existing, ...ids]
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      )
    );
    safeWrite(STORAGE_KEYS.DELETED_LEAD_IDS, merged);
    return merged;
  },
  removeDeletedLeadIds: (ids: string[]) => {
    const toRemove = new Set(
      ids.map((id) => String(id || '').trim()).filter(Boolean)
    );
    const existing = safeRead<string[]>(STORAGE_KEYS.DELETED_LEAD_IDS, () => []);
    const next = existing.filter((id) => !toRemove.has(id));
    safeWrite(STORAGE_KEYS.DELETED_LEAD_IDS, next);
    return next;
  },

  getTeamMembers: (): User[] =>
    safeRead<User[]>(STORAGE_KEYS.TEAM_MEMBERS, () => DEMO_USERS.map(stripUserPassword)).map(
      stripUserPassword
    ),
  saveTeamMembers: (members: User[]) =>
    safeWrite(
      STORAGE_KEYS.TEAM_MEMBERS,
      members.map(stripUserPassword)
    ),

  getSettings: (): AppSettings => {
    const settings = safeRead<AppSettings>(STORAGE_KEYS.SETTINGS, () => ({
      ...DEFAULT_SETTINGS,
      googleSheetsWebhookUrl: DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL,
    }));

    const normalizedDisabledAgentIds = Array.isArray(settings.disabledAgentIds)
      ? Array.from(
          new Set(
            settings.disabledAgentIds.filter(
              (id): id is string => typeof id === 'string' && id.trim().length > 0
            )
          )
        )
      : [];

    let migratedVersion: string | null = null;
    try {
      migratedVersion = localStorage.getItem(STORAGE_KEYS.WEBHOOK_VERSION);
    } catch {
      migratedVersion = null;
    }

    if (migratedVersion !== CURRENT_WEBHOOK_VERSION) {
      try {
        localStorage.setItem(STORAGE_KEYS.WEBHOOK_VERSION, CURRENT_WEBHOOK_VERSION);
      } catch {
        // Ignore
      }
      const upgraded: AppSettings = {
        ...settings,
        disabledAgentIds: normalizedDisabledAgentIds,
        googleSheetsWebhookUrl: DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL,
      };
      safeWrite(STORAGE_KEYS.SETTINGS, upgraded);
      return upgraded;
    }

    const resolvedUrl = resolveWebhookUrl(
      settings.googleSheetsWebhookUrl,
      ENV_GOOGLE_SHEET_WEBHOOK_URL
    );
    if (
      settings.googleSheetsWebhookUrl !== resolvedUrl ||
      !Array.isArray(settings.disabledAgentIds)
    ) {
      const updated: AppSettings = {
        ...settings,
        disabledAgentIds: normalizedDisabledAgentIds,
        googleSheetsWebhookUrl: resolvedUrl,
      };
      safeWrite(STORAGE_KEYS.SETTINGS, updated);
      return updated;
    }
    return {
      ...settings,
      disabledAgentIds: normalizedDisabledAgentIds,
    };
  },
  saveSettings: (settings: AppSettings) => {
    try {
      localStorage.setItem(STORAGE_KEYS.WEBHOOK_VERSION, CURRENT_WEBHOOK_VERSION);
    } catch {
      // Ignore
    }
    safeWrite(STORAGE_KEYS.SETTINGS, settings);
  },

  getSessionUserId: (): string | null => {
    try {
      return localStorage.getItem(STORAGE_KEYS.SESSION_USER_ID);
    } catch {
      return null;
    }
  },
  saveSessionUserId: (userId: string | null) => {
    try {
      if (userId) localStorage.setItem(STORAGE_KEYS.SESSION_USER_ID, userId);
      else localStorage.removeItem(STORAGE_KEYS.SESSION_USER_ID);
    } catch {
      // Ignore
    }
  },

  getTheme: (): 'dark' | 'light' => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.THEME);
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  },
  saveTheme: (theme: 'dark' | 'light') => {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
    } catch {
      // Ignore
    }
  },
};

export interface SheetsSyncPayload {
  event:
    | 'TEST_SYNC'
    | 'FULL_SYNC'
    | 'LEAD_UPSERT'
    | 'LEAD_UPDATED'
    | 'LEAD_DELETED'
    | 'LEADS_BATCH_UPSERT'
    | 'CALL_LOGGED'
    | 'KAWSAR_POST_LOGGED'
    | 'PAID_CUSTOMER_UPSERT'
    | 'PAID_CUSTOMER_DELETED'
    | 'CONNECT_CHECK';
  lead?: Lead;
  leads?: Lead[];
  previousAgentName?: string | null;
  previousCollectorName?: string | null;
  previousPhone?: string;
  deletedLead?: {
    id: string;
    phone?: string;
    collectorName?: string | null;
    assignedAgentName?: string | null;
  };
  deletedLeadIds?: string[];
  callLog?: CallLog;
  callLogs?: CallLog[];
  post?: ContentPost;
  contentPosts?: ContentPost[];
  paidCustomer?: PaidCustomer & {
    facebookLink?: string;
    collectorName?: string;
    amountOrPackage?: string;
  };
  paidCustomers?: Array<
    PaidCustomer & {
      facebookLink?: string;
      collectorName?: string;
      amountOrPackage?: string;
    }
  >;
  deletedPaidCustomer?: {
    id: string;
    leadId?: string;
    phone?: string;
    assignedAgentName?: string | null;
  };
  deletedPaidCustomerIds?: string[];
  collectorNames?: string[];
  agentNames?: string[];
  skipBackfill?: boolean;
  batchInfo?: {
    chunkIndex: number;
    totalChunks: number;
  };
  dailySummary?: {
    date: string;
    totalLeads: number;
    callsMadeToday: number;
    orderConfirmedCount: number;
    interestedCount: number;
    conversionRate: number;
  };
  finalDailySummary?: FinalDailySummary;
}

export const DEFAULT_SHEETS_SYNC_TIMEOUT_MS = 45000;
export const FULL_SYNC_TIMEOUT_MS = 60000;
export const SUPERSEDED_SYNC_ERROR_NAME = 'SupersededSyncError';

export function createTimeoutAbortReason(timeoutMs: number): DOMException {
  const secs = Math.max(1, Math.round(timeoutMs / 1000));
  return new DOMException(`Google Sheets sync timed out after ${secs}s`, 'AbortError');
}

export function isSupersededSyncError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error || (typeof err === 'object' && 'name' in err)) {
    return String((err as { name?: unknown }).name ?? '') === SUPERSEDED_SYNC_ERROR_NAME;
  }
  return false;
}

export function isAbortOrTimeoutError(err: unknown): boolean {
  if (!err || isSupersededSyncError(err)) return false;
  if (typeof err === 'string') {
    const lower = err.toLowerCase();
    return lower.includes('abort') || lower.includes('timed out') || lower.includes('timeout');
  }
  if (err instanceof Error || (typeof err === 'object' && 'name' in err)) {
    const e = err as { name?: unknown; message?: unknown };
    const name = String(e.name ?? '');
    const msg = String(e.message ?? '').toLowerCase();
    return (
      name === 'AbortError' ||
      name === 'TimeoutError' ||
      msg.includes('signal is aborted') ||
      msg.includes('aborted') ||
      msg.includes('timed out')
    );
  }
  return false;
}

function createLinkedTimeoutController(
  timeoutMs: number,
  externalSignal?: AbortSignal
): {
  signal: AbortSignal;
  getAbortReason: () => unknown;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutReason = createTimeoutAbortReason(timeoutMs);
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(timeoutReason);
    }
  }, timeoutMs);

  const handleExternalAbort = () => {
    if (!controller.signal.aborted) {
      const reason =
        externalSignal?.reason ??
        new DOMException('Superseded by newer Google Sheets sync request', SUPERSEDED_SYNC_ERROR_NAME);
      controller.abort(reason);
    }
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      handleExternalAbort();
    } else {
      externalSignal.addEventListener('abort', handleExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    getAbortReason: () => controller.signal.reason,
    cleanup: () => {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', handleExternalAbort);
      }
    },
  };
}

export function describeWebhookFetchError(err: unknown, timeoutMs: number): string {
  if (isSupersededSyncError(err)) {
    return 'Replaced by a newer Google Sheets sync request.';
  }
  if (isAbortOrTimeoutError(err)) {
    const secs = Math.max(1, Math.round(timeoutMs / 1000));
    return `Google Sheets sync timed out after ${secs}s while Google Apps Script was still processing your spreadsheet tabs. Wait a few seconds and try again.`;
  }
  if (err instanceof Error) {
    if (err instanceof TypeError) {
      return 'Network or CORS error reaching Google Sheets webhook. Verify internet connection and Apps Script Web App "Anyone" access.';
    }
    return err.message;
  }
  return 'Unable to reach Google Sheets webhook';
}

export interface PushSheetsResult {
  ok: boolean;
  error?: string;
  timedOut?: boolean;
  superseded?: boolean;
}

/**
 * Triggers a real-time sync POST request to the configured Google Apps Script Web App URL.
 * Uses `text/plain` content-type to avoid CORS preflight failures with Google Apps Script.
 */
export async function pushToGoogleSheetsWebhook(
  webhookUrl: string,
  payload: SheetsSyncPayload,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<PushSheetsResult> {
  const trimmed = webhookUrl.trim();
  if (!trimmed) {
    return { ok: false, error: 'No webhook URL configured' };
  }

  try {
    new URL(trimmed);
  } catch {
    return { ok: false, error: 'Invalid webhook URL format' };
  }

  const timeoutMs =
    options?.timeoutMs ??
    (payload.event === 'FULL_SYNC' || payload.event === 'TEST_SYNC'
      ? FULL_SYNC_TIMEOUT_MS
      : DEFAULT_SHEETS_SYNC_TIMEOUT_MS);
  const { signal, getAbortReason, cleanup } = createLinkedTimeoutController(
    timeoutMs,
    options?.signal
  );

  try {
    await fetch(trimmed, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
      signal,
    });
    return { ok: true };
  } catch (err) {
    const reason = getAbortReason();
    const effectiveErr =
      isSupersededSyncError(reason) || isAbortOrTimeoutError(reason) ? reason : err;
    if (isSupersededSyncError(effectiveErr)) {
      return {
        ok: false,
        superseded: true,
        error: describeWebhookFetchError(effectiveErr, timeoutMs),
      };
    }
    const timedOut = isAbortOrTimeoutError(effectiveErr);
    return {
      ok: false,
      timedOut,
      error: describeWebhookFetchError(effectiveErr, timeoutMs),
    };
  } finally {
    cleanup();
  }
}

export interface ChunkedSyncProgress {
  chunkIndex: number;
  totalChunks: number;
  syncedRecordsSoFar: number;
  totalRecords: number;
}

export interface ChunkedPushSheetsResult extends PushSheetsResult {
  completedChunks: number;
  totalChunks: number;
}

/**
 * Splits large sync payloads into sequential batches (default 50 records per request)
 * so Google Apps Script processes each batch fast and reliably without hitting 60s timeouts.
 */
export async function pushChunkedSheetsSync(
  webhookUrl: string,
  input: {
    event: SheetsBatchEvent;
    leads?: Lead[];
    callLogs?: CallLog[];
    contentPosts?: ContentPost[];
    paidCustomers?: SyncPaidCustomerPayload[];
    deletedPaidCustomerIds?: string[];
    deletedLeadIds?: string[];
    collectorNames?: string[];
    agentNames?: string[];
    dailySummary?: SheetsSyncPayload['dailySummary'];
    finalDailySummary?: FinalDailySummary;
  },
  options?: {
    batchSize?: number;
    timeoutMs?: number;
    finalTimeoutMs?: number;
    signal?: AbortSignal;
    onProgress?: (progress: ChunkedSyncProgress) => void;
  }
): Promise<ChunkedPushSheetsResult> {
  const chunks = buildSheetsSyncChunks({
    event: input.event,
    leads: input.leads,
    callLogs: input.callLogs,
    contentPosts: input.contentPosts,
    paidCustomers: input.paidCustomers,
    batchSize: options?.batchSize ?? DEFAULT_SHEETS_BATCH_SIZE,
  });

  const totalChunks = chunks.length;
  const totalRecords = chunks.reduce((sum, chunk) => sum + chunk.totalRecordsInChunk, 0);
  let syncedRecordsSoFar = 0;

  for (const chunk of chunks) {
    if (options?.signal?.aborted) {
      const reason = options.signal.reason;
      if (isSupersededSyncError(reason)) {
        return {
          ok: false,
          superseded: true,
          completedChunks: chunk.chunkIndex - 1,
          totalChunks,
          error: describeWebhookFetchError(reason, options.timeoutMs ?? DEFAULT_SHEETS_SYNC_TIMEOUT_MS),
        };
      }
    }

    options?.onProgress?.({
      chunkIndex: chunk.chunkIndex,
      totalChunks,
      syncedRecordsSoFar,
      totalRecords,
    });

    const isLast = chunk.chunkIndex === totalChunks;
    const chunkTimeoutMs = isLast
      ? options?.finalTimeoutMs ??
        (chunk.event === 'FULL_SYNC' || chunk.event === 'TEST_SYNC'
          ? FULL_SYNC_TIMEOUT_MS
          : options?.timeoutMs ?? DEFAULT_SHEETS_SYNC_TIMEOUT_MS)
      : options?.timeoutMs ?? DEFAULT_SHEETS_SYNC_TIMEOUT_MS;

    const payload: SheetsSyncPayload = {
      event: chunk.event,
      ...(chunk.leads.length > 0 ? { leads: chunk.leads } : {}),
      ...(chunk.callLogs.length > 0 ? { callLogs: chunk.callLogs } : {}),
      ...(chunk.contentPosts.length > 0 ? { contentPosts: chunk.contentPosts } : {}),
      ...(chunk.paidCustomers.length > 0 ? { paidCustomers: chunk.paidCustomers } : {}),
      ...(chunk.chunkIndex === 1 || isLast
        ? {
            agentNames: input.agentNames,
            collectorNames: input.collectorNames,
            ...(input.deletedPaidCustomerIds && input.deletedPaidCustomerIds.length > 0
              ? { deletedPaidCustomerIds: input.deletedPaidCustomerIds }
              : {}),
            ...(input.deletedLeadIds && input.deletedLeadIds.length > 0
              ? { deletedLeadIds: input.deletedLeadIds }
              : {}),
          }
        : {}),
      skipBackfill: chunk.skipBackfill,
      batchInfo: {
        chunkIndex: chunk.chunkIndex,
        totalChunks,
      },
      ...(chunk.includeSummaries && input.dailySummary
        ? { dailySummary: input.dailySummary }
        : {}),
      ...(chunk.includeSummaries && input.finalDailySummary
        ? { finalDailySummary: input.finalDailySummary }
        : {}),
    };

    const res = await pushToGoogleSheetsWebhook(webhookUrl, payload, {
      timeoutMs: chunkTimeoutMs,
      signal: options?.signal,
    });

    if (!res.ok) {
      return {
        ...res,
        completedChunks: chunk.chunkIndex - 1,
        totalChunks,
        error:
          !res.superseded && totalChunks > 1 && res.error
            ? `Batch ${chunk.chunkIndex}/${totalChunks}: ${res.error}`
            : res.error,
      };
    }

    syncedRecordsSoFar += chunk.totalRecordsInChunk;
  }

  options?.onProgress?.({
    chunkIndex: totalChunks,
    totalChunks,
    syncedRecordsSoFar: totalRecords,
    totalRecords,
  });

  return {
    ok: true,
    completedChunks: totalChunks,
    totalChunks,
  };
}

export interface PullSheetsResult {
  ok: boolean;
  pulledData: boolean;
  data?: ParsedPullPayload;
  error?: string;
  timedOut?: boolean;
  superseded?: boolean;
}

/**
 * Pulls active records from Google Sheets via GET (`doGet`).
 * Defaults to `scope: 'today'` so historical sheet rows are NOT bulk-loaded into frontend state/memory.
 */
export async function pullFromGoogleSheetsWebhook(
  webhookUrl: string,
  options?: {
    timeoutMs?: number;
    scope?: 'today' | 'all';
    date?: string;
    signal?: AbortSignal;
  }
): Promise<PullSheetsResult> {
  const trimmed = webhookUrl.trim();
  if (!trimmed) {
    return { ok: false, pulledData: false, error: 'No webhook URL configured' };
  }

  const scope = options?.scope ?? 'today';
  const targetDate = options?.date ?? getLocalDateString();

  let targetUrl: string;
  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.set('action', 'pull');
    if (scope === 'today') {
      parsed.searchParams.set('scope', 'today');
      parsed.searchParams.set('date', targetDate);
    } else {
      parsed.searchParams.set('scope', 'all');
    }
    targetUrl = parsed.toString();
  } catch {
    return { ok: false, pulledData: false, error: 'Invalid webhook URL format' };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_SHEETS_SYNC_TIMEOUT_MS;
  const { signal, getAbortReason, cleanup } = createLinkedTimeoutController(
    timeoutMs,
    options?.signal
  );

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal,
    });
    if (!res.ok) {
      return { ok: false, pulledData: false, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, pulledData: false, error: 'Response is not JSON' };
    }
    const parsedData = parsePullPayload(json);
    if (!parsedData) {
      return { ok: false, pulledData: false, error: 'Unexpected payload structure' };
    }
    const data =
      scope === 'today' ? filterPullPayloadByDate(parsedData, targetDate) : parsedData;
    return { ok: true, pulledData: true, data };
  } catch (err) {
    const reason = getAbortReason();
    const effectiveErr =
      isSupersededSyncError(reason) || isAbortOrTimeoutError(reason) ? reason : err;
    if (isSupersededSyncError(effectiveErr)) {
      return {
        ok: false,
        pulledData: false,
        superseded: true,
        error: describeWebhookFetchError(effectiveErr, timeoutMs),
      };
    }
    const timedOut = isAbortOrTimeoutError(effectiveErr);
    return {
      ok: false,
      pulledData: false,
      timedOut,
      error: describeWebhookFetchError(effectiveErr, timeoutMs),
    };
  } finally {
    cleanup();
  }
}

function isHtmlAuthOrErrorPage(text: string): boolean {
  const lower = text.trim().slice(0, 500).toLowerCase();
  return (
    lower.startsWith('<!doctype') ||
    lower.startsWith('<html') ||
    lower.includes('accounts.google.com') ||
    lower.includes('google apps script')
  );
}

/**
 * Performs an on-demand lightweight duplicate check against Google Sheets `Master_Data`
 * (`GET ?action=check_lead_duplicate&phone=...&facebookLink=...`) without pulling all rows.
 */
export async function checkLeadDuplicateInSheets(
  webhookUrl: string,
  phone: string,
  facebookLink: string,
  options?: { timeoutMs?: number }
): Promise<LeadDuplicateCheckResult> {
  const trimmed = webhookUrl.trim();
  if (!trimmed) {
    return { ok: false, isDuplicate: false, error: 'No webhook URL configured' };
  }

  const canonicalPhone = normalizeBdPhone(phone) ?? phone.trim();
  const trimmedFb = facebookLink.trim();
  if (!canonicalPhone && !trimmedFb) {
    return { ok: true, isDuplicate: false };
  }

  let targetUrl: string;
  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.set('action', 'check_lead_duplicate');
    parsed.searchParams.set('phone', canonicalPhone);
    parsed.searchParams.set('facebookLink', trimmedFb);
    targetUrl = parsed.toString();
  } catch {
    return { ok: false, isDuplicate: false, error: 'Invalid webhook URL format' };
  }

  const timeoutMs = options?.timeoutMs ?? 20000;
  const { signal, getAbortReason, cleanup } = createLinkedTimeoutController(timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal,
    });
    if (!res.ok) {
      const error = `Google Sheets webhook returned HTTP ${res.status}. Verify Web App deployment ("Execute as: Me", "Who has access: Anyone").`;
      console.error('[RunBD Sheets Lead Check Error]', error);
      return { ok: false, isDuplicate: false, error };
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      const error = isHtmlAuthOrErrorPage(text)
        ? 'Google Sheets webhook returned HTML instead of JSON (Apps Script permission/login screen). Ensure deployment is set to "Execute as: Me" and "Who has access: Anyone".'
        : 'Google Sheets webhook returned an invalid non-JSON response.';
      console.error('[RunBD Sheets Lead Check Parse Error]', error, text.slice(0, 200));
      return { ok: false, isDuplicate: false, error };
    }
    const parsedResult = parseLeadDuplicateCheckResponse(json, {
      phone: canonicalPhone,
      facebookLink: trimmedFb,
    });
    if (!parsedResult) {
      const error = 'Unsupported duplicate check response format from Google Apps Script.';
      console.error('[RunBD Sheets Lead Check Format Error]', json);
      return { ok: false, isDuplicate: false, error };
    }
    if (!parsedResult.ok) {
      console.error('[RunBD Sheets Lead Check Script Error]', parsedResult.error);
    }
    return parsedResult;
  } catch (err) {
    const reason = getAbortReason();
    const effectiveErr = isAbortOrTimeoutError(reason) ? reason : err;
    const error = describeWebhookFetchError(effectiveErr, timeoutMs);
    console.error('[RunBD Sheets Lead Check Network Error]', error, err);
    return {
      ok: false,
      isDuplicate: false,
      error,
    };
  } finally {
    cleanup();
  }
}

/**
 * Performs an on-demand lightweight duplicate check against Google Sheets `Kawsar_Posts_Log`
 * (`GET ?action=check_post_duplicate&facebookLink=...&websiteLink=...`) without pulling all rows.
 */
export async function checkPostDuplicateInSheets(
  webhookUrl: string,
  facebookLink: string,
  websiteLink: string,
  options?: {
    timeoutMs?: number;
    tiktokLink?: string;
    instagramLink?: string;
    twitterLink?: string;
  }
): Promise<PostDuplicateCheckResult> {
  const trimmed = webhookUrl.trim();
  if (!trimmed) {
    return { ok: false, isDuplicate: false, error: 'No webhook URL configured' };
  }

  const trimmedFb = facebookLink.trim();
  const trimmedWeb = websiteLink.trim();
  const trimmedTt = (options?.tiktokLink ?? '').trim();
  const trimmedIg = (options?.instagramLink ?? '').trim();
  const trimmedTw = (options?.twitterLink ?? '').trim();
  if (!trimmedFb && !trimmedWeb && !trimmedTt && !trimmedIg && !trimmedTw) {
    return { ok: true, isDuplicate: false };
  }

  let targetUrl: string;
  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.set('action', 'check_post_duplicate');
    parsed.searchParams.set('facebookLink', trimmedFb);
    parsed.searchParams.set('websiteLink', trimmedWeb);
    if (trimmedTt) parsed.searchParams.set('tiktokLink', trimmedTt);
    if (trimmedIg) parsed.searchParams.set('instagramLink', trimmedIg);
    if (trimmedTw) parsed.searchParams.set('twitterLink', trimmedTw);
    targetUrl = parsed.toString();
  } catch {
    return { ok: false, isDuplicate: false, error: 'Invalid webhook URL format' };
  }

  const timeoutMs = options?.timeoutMs ?? 20000;
  const { signal, getAbortReason, cleanup } = createLinkedTimeoutController(timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal,
    });
    if (!res.ok) {
      const error = `Google Sheets webhook returned HTTP ${res.status}. Verify Web App deployment ("Execute as: Me", "Who has access: Anyone").`;
      console.error('[RunBD Sheets Post Check Error]', error);
      return { ok: false, isDuplicate: false, error };
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      const error = isHtmlAuthOrErrorPage(text)
        ? 'Google Sheets webhook returned HTML instead of JSON (Apps Script permission/login screen). Ensure deployment is set to "Execute as: Me" and "Who has access: Anyone".'
        : 'Google Sheets webhook returned an invalid non-JSON response.';
      console.error('[RunBD Sheets Post Check Parse Error]', error, text.slice(0, 200));
      return { ok: false, isDuplicate: false, error };
    }
    const parsedResult = parsePostDuplicateCheckResponse(json, {
      facebookLink: trimmedFb,
      websiteLink: trimmedWeb,
      tiktokLink: trimmedTt,
      instagramLink: trimmedIg,
      twitterLink: trimmedTw,
    });
    if (!parsedResult) {
      const error = 'Unsupported post duplicate check response format from Google Apps Script.';
      console.error('[RunBD Sheets Post Check Format Error]', json);
      return { ok: false, isDuplicate: false, error };
    }
    if (!parsedResult.ok) {
      console.error('[RunBD Sheets Post Check Script Error]', parsedResult.error);
    }
    return parsedResult;
  } catch (err) {
    const reason = getAbortReason();
    const effectiveErr = isAbortOrTimeoutError(reason) ? reason : err;
    const error = describeWebhookFetchError(effectiveErr, timeoutMs);
    console.error('[RunBD Sheets Post Check Network Error]', error, err);
    return {
      ok: false,
      isDuplicate: false,
      error,
    };
  } finally {
    cleanup();
  }
}

