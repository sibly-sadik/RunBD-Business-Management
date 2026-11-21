import {
  AppSettings,
  AuditLog,
  CallLog,
  ContentPost,
  DuplicateAttempt,
  Lead,
  PaidCustomer,
} from '../types';
import { FinalDailySummary, getLocalDateString } from './leadLogic';
import {
  filterPullPayloadByDate,
  getDefaultWebhookUrl,
  LeadDuplicateCheckResult,
  ParsedPullPayload,
  parseLeadDuplicateCheckResponse,
  parsePostDuplicateCheckResponse,
  parsePullPayload,
  PostDuplicateCheckResult,
  resolveWebhookUrl,
} from './sheetsSync';
import {
  createSeedAuditLogs,
  createSeedCallLogs,
  createSeedContentPosts,
  createSeedDuplicateAttempts,
  createSeedLeads,
  createSeedPaidCustomers,
  DEFAULT_SETTINGS,
} from '../data/seedData';

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
  SETTINGS: 'runbd_settings_v2',
  WEBHOOK_VERSION: 'runbd_webhook_version_v1',
  SESSION_USER_ID: 'runbd_session_user_v2',
  THEME: 'runbd_theme_v1',
};

const CURRENT_WEBHOOK_VERSION = '2026-11-21-v2';

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

  getSettings: (): AppSettings => {
    const settings = safeRead<AppSettings>(STORAGE_KEYS.SETTINGS, () => ({
      ...DEFAULT_SETTINGS,
      googleSheetsWebhookUrl: DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL,
    }));

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
        googleSheetsWebhookUrl: DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL,
      };
      safeWrite(STORAGE_KEYS.SETTINGS, upgraded);
      return upgraded;
    }

    const resolvedUrl = resolveWebhookUrl(
      settings.googleSheetsWebhookUrl,
      ENV_GOOGLE_SHEET_WEBHOOK_URL
    );
    if (settings.googleSheetsWebhookUrl !== resolvedUrl) {
      const updated: AppSettings = {
        ...settings,
        googleSheetsWebhookUrl: resolvedUrl,
      };
      safeWrite(STORAGE_KEYS.SETTINGS, updated);
      return updated;
    }
    return settings;
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
    | 'LEADS_BATCH_UPSERT'
    | 'CALL_LOGGED'
    | 'KAWSAR_POST_LOGGED'
    | 'PAID_CUSTOMER_UPSERT'
    | 'CONNECT_CHECK';
  lead?: Lead;
  leads?: Lead[];
  callLog?: CallLog;
  callLogs?: CallLog[];
  post?: ContentPost;
  contentPosts?: ContentPost[];
  paidCustomer?: PaidCustomer;
  paidCustomers?: PaidCustomer[];
  dailySummary: {
    date: string;
    totalLeads: number;
    callsMadeToday: number;
    orderConfirmedCount: number;
    interestedCount: number;
    conversionRate: number;
  };
  finalDailySummary?: FinalDailySummary;
}

/**
 * Triggers a real-time sync POST request to the configured Google Apps Script Web App URL.
 * Uses `text/plain` content-type to avoid CORS preflight failures with Google Apps Script.
 */
export async function pushToGoogleSheetsWebhook(
  webhookUrl: string,
  payload: SheetsSyncPayload
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = webhookUrl.trim();
  if (!trimmed) {
    return { ok: false, error: 'No webhook URL configured' };
  }

  try {
    new URL(trimmed);
  } catch {
    return { ok: false, error: 'Invalid webhook URL format' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    await fetch(trimmed, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error syncing to Google Sheets',
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface PullSheetsResult {
  ok: boolean;
  pulledData: boolean;
  data?: ParsedPullPayload;
  error?: string;
}

/**
 * Pulls active records from Google Sheets via GET (`doGet`).
 * Defaults to `scope: 'today'` so historical sheet rows are NOT bulk-loaded into frontend state/memory.
 */
export async function pullFromGoogleSheetsWebhook(
  webhookUrl: string,
  options?: { timeoutMs?: number; scope?: 'today' | 'all'; date?: string }
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

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 8000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
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
    return {
      ok: false,
      pulledData: false,
      error: err instanceof Error ? err.message : 'Unable to fetch remote data',
    };
  } finally {
    clearTimeout(timer);
  }
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

  let targetUrl: string;
  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.set('action', 'check_lead_duplicate');
    parsed.searchParams.set('phone', phone.trim());
    parsed.searchParams.set('facebookLink', facebookLink.trim());
    targetUrl = parsed.toString();
  } catch {
    return { ok: false, isDuplicate: false, error: 'Invalid webhook URL format' };
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 4000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, isDuplicate: false, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, isDuplicate: false, error: 'Response is not JSON' };
    }
    const parsedResult = parseLeadDuplicateCheckResponse(json);
    if (!parsedResult) {
      return { ok: false, isDuplicate: false, error: 'Unsupported check response' };
    }
    return parsedResult;
  } catch (err) {
    return {
      ok: false,
      isDuplicate: false,
      error: err instanceof Error ? err.message : 'Unable to query sheet duplicate check',
    };
  } finally {
    clearTimeout(timer);
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
  options?: { timeoutMs?: number }
): Promise<PostDuplicateCheckResult> {
  const trimmed = webhookUrl.trim();
  if (!trimmed) {
    return { ok: false, isDuplicate: false, error: 'No webhook URL configured' };
  }

  let targetUrl: string;
  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.set('action', 'check_post_duplicate');
    parsed.searchParams.set('facebookLink', facebookLink.trim());
    parsed.searchParams.set('websiteLink', websiteLink.trim());
    targetUrl = parsed.toString();
  } catch {
    return { ok: false, isDuplicate: false, error: 'Invalid webhook URL format' };
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 4000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, isDuplicate: false, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, isDuplicate: false, error: 'Response is not JSON' };
    }
    const parsedResult = parsePostDuplicateCheckResponse(json);
    if (!parsedResult) {
      return { ok: false, isDuplicate: false, error: 'Unsupported check response' };
    }
    return parsedResult;
  } catch (err) {
    return {
      ok: false,
      isDuplicate: false,
      error: err instanceof Error ? err.message : 'Unable to query sheet duplicate check',
    };
  } finally {
    clearTimeout(timer);
  }
}

