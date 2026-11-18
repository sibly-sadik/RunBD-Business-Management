import { AppSettings, AuditLog, CallLog, ContentPost, DuplicateAttempt, Lead } from '../types';
import type { FinalDailySummary } from './leadLogic';
import {
  createSeedAuditLogs,
  createSeedCallLogs,
  createSeedContentPosts,
  createSeedDuplicateAttempts,
  createSeedLeads,
  DEFAULT_SETTINGS,
} from '../data/seedData';

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

  getSettings: () => safeRead<AppSettings>(STORAGE_KEYS.SETTINGS, () => DEFAULT_SETTINGS),
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
  event: 'TEST_SYNC' | 'FULL_SYNC' | 'LEAD_UPSERT' | 'CALL_LOGGED' | 'KAWSAR_POST_LOGGED';
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
