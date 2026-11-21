import {
  AppSettings,
  AuditLog,
  CallLog,
  ContentPost,
  DuplicateAttempt,
  Lead,
  PaidCustomer,
} from '../types';
import { FinalDailySummary, getLocalDateString, normalizeBdPhone } from './leadLogic';
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
  const timeoutMs = options?.timeoutMs ?? 15000;
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

function describeWebhookFetchError(err: unknown, timeoutMs: number): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') {
      return `Google Sheets webhook timed out after ${Math.round(timeoutMs / 1000)}s.`;
    }
    if (err instanceof TypeError) {
      return 'Network or CORS error reaching Google Sheets webhook. Verify internet connection and Apps Script Web App "Anyone" access.';
    }
    return err.message;
  }
  return 'Unable to reach Google Sheets webhook';
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

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
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
    const error = describeWebhookFetchError(err, timeoutMs);
    console.error('[RunBD Sheets Lead Check Network Error]', error, err);
    return {
      ok: false,
      isDuplicate: false,
      error,
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

  const trimmedFb = facebookLink.trim();
  const trimmedWeb = websiteLink.trim();
  if (!trimmedFb && !trimmedWeb) {
    return { ok: true, isDuplicate: false };
  }

  let targetUrl: string;
  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.set('action', 'check_post_duplicate');
    parsed.searchParams.set('facebookLink', trimmedFb);
    parsed.searchParams.set('websiteLink', trimmedWeb);
    targetUrl = parsed.toString();
  } catch {
    return { ok: false, isDuplicate: false, error: 'Invalid webhook URL format' };
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
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
    const error = describeWebhookFetchError(err, timeoutMs);
    console.error('[RunBD Sheets Post Check Network Error]', error, err);
    return {
      ok: false,
      isDuplicate: false,
      error,
    };
  } finally {
    clearTimeout(timer);
  }
}

