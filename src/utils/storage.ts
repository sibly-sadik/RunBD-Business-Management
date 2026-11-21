import { AppSettings, AuditLog, CallLog, ContentPost, DuplicateAttempt, Lead } from '../types';
import type { FinalDailySummary } from './leadLogic';
import {
  getDefaultWebhookUrl,
  ParsedPullPayload,
  parsePullPayload,
  resolveWebhookUrl,
} from './sheetsSync';
import {
  createSeedAuditLogs,
  createSeedCallLogs,
  createSeedContentPosts,
  createSeedDuplicateAttempts,
  createSeedLeads,
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
  SETTINGS: 'runbd_settings_v2',
  SESSION_USER_ID: 'runbd_session_user_v2',
  THEME: 'runbd_theme_v1',
};

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

  getSettings: (): AppSettings => {
    const settings = safeRead<AppSettings>(STORAGE_KEYS.SETTINGS, () => ({
      ...DEFAULT_SETTINGS,
      googleSheetsWebhookUrl: DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL,
    }));
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
  saveSettings: (settings: AppSettings) => safeWrite(STORAGE_KEYS.SETTINGS, settings),

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
    | 'CALL_LOGGED'
    | 'KAWSAR_POST_LOGGED'
    | 'CONNECT_CHECK';
  lead?: Lead;
  leads?: Lead[];
  callLog?: CallLog;
  callLogs?: CallLog[];
  post?: ContentPost;
  contentPosts?: ContentPost[];
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

  try {
    await fetch(trimmed, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error syncing to Google Sheets',
    };
  }
}

export interface PullSheetsResult {
  ok: boolean;
  pulledData: boolean;
  data?: ParsedPullPayload;
  error?: string;
}

/**
 * Attempts to pull the latest leads, call logs, and Kawsar posts from Google Sheets
 * via a GET request to the Apps Script Web App (`doGet`).
 */
export async function pullFromGoogleSheetsWebhook(
  webhookUrl: string,
  options?: { timeoutMs?: number }
): Promise<PullSheetsResult> {
  const trimmed = webhookUrl.trim();
  if (!trimmed) {
    return { ok: false, pulledData: false, error: 'No webhook URL configured' };
  }

  let targetUrl: string;
  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.set('action', 'pull');
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
    const data = parsePullPayload(json);
    if (!data) {
      return { ok: false, pulledData: false, error: 'Unexpected payload structure' };
    }
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

