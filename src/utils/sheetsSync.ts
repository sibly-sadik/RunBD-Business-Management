import { CALL_STATUSES, CallLog, CallStatus, ContentPost, Lead } from '../types';
import { normalizeBdPhone, normalizeFacebookUrl, normalizePostUrl } from './leadLogic';

export const FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbwqMl23Bi200Idn267ySCDpKBY30b1FdYC8OWPOPK90neBvSPwWyn7Eq-VqV8ublfUD/exec';

export function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Resolves the default Google Sheets webhook URL from environment config
 * or falls back to the built-in RunBD Apps Script Web App URL.
 */
export function getDefaultWebhookUrl(envUrl?: string | null): string {
  const candidate = (envUrl ?? '').trim();
  if (candidate && isValidHttpUrl(candidate)) {
    return candidate;
  }
  return FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL;
}

/**
 * Resolves the active webhook URL: uses the saved custom URL if present,
 * otherwise automatically initializes with the default webhook URL.
 */
export function resolveWebhookUrl(
  savedUrl?: string | null,
  envUrl?: string | null
): string {
  const saved = (savedUrl ?? '').trim();
  if (saved && isValidHttpUrl(saved)) {
    return saved;
  }
  return getDefaultWebhookUrl(envUrl);
}

const VALID_CALL_STATUSES: ReadonlySet<CallStatus> = new Set(CALL_STATUSES);

function normalizeStatus(status: unknown): CallStatus {
  if (typeof status === 'string' && VALID_CALL_STATUSES.has(status as CallStatus)) {
    return status as CallStatus;
  }
  return 'Pending';
}

export interface ParsedPullPayload {
  leads: Partial<Lead>[];
  callLogs: Partial<CallLog>[];
  contentPosts: Partial<ContentPost>[];
}

/**
 * Validates and extracts structured arrays from a Google Apps Script `doGet` JSON response.
 * Returns null if the response does not match an expected JSON payload.
 */
export function parsePullPayload(raw: unknown): ParsedPullPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const hasAnyArray =
    Array.isArray(obj.leads) ||
    Array.isArray(obj.callLogs) ||
    Array.isArray(obj.contentPosts);
  if (!hasAnyArray) return null;

  return {
    leads: Array.isArray(obj.leads) ? (obj.leads as Partial<Lead>[]) : [],
    callLogs: Array.isArray(obj.callLogs) ? (obj.callLogs as Partial<CallLog>[]) : [],
    contentPosts: Array.isArray(obj.contentPosts)
      ? (obj.contentPosts as Partial<ContentPost>[])
      : [],
  };
}

function toValidTimestamp(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return fallback;
}

function safePhoneString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/^'+/, '').trim();
}

/**
 * Merges remote leads pulled from Google Sheets into local leads.
 * - Preserves local unsynced leads.
 * - Updates matching leads when the remote record has a newer or equal `updatedAt`.
 */
export function mergeRemoteLeads(
  localLeads: Lead[],
  remoteLeads: Partial<Lead>[]
): Lead[] {
  if (!remoteLeads.length) return localLeads;

  const byId = new Map<string, Lead>();
  for (const lead of localLeads) {
    byId.set(lead.id, lead);
  }

  const nowIso = new Date().toISOString();

  for (const r of remoteLeads) {
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (!id) continue;

    const rawPhone = safePhoneString(r.rawPhone ?? r.phone);
    const phone = normalizeBdPhone(rawPhone) || rawPhone;
    const facebookLink = typeof r.facebookLink === 'string' ? r.facebookLink.trim() : '';
    const normalizedFacebookLink =
      r.normalizedFacebookLink?.trim() || normalizeFacebookUrl(facebookLink);
    const updatedAt = toValidTimestamp(r.updatedAt, nowIso);
    const createdAt = toValidTimestamp(r.createdAt, updatedAt);

    const existing = byId.get(id);
    if (existing) {
      const existingTime = Date.parse(existing.updatedAt || existing.createdAt) || 0;
      const remoteTime = Date.parse(updatedAt) || 0;
      if (remoteTime >= existingTime) {
        byId.set(id, {
          ...existing,
          customerName: r.customerName?.trim() || existing.customerName,
          phone: phone || existing.phone,
          rawPhone: rawPhone || existing.rawPhone,
          facebookLink: facebookLink || existing.facebookLink,
          normalizedFacebookLink:
            normalizedFacebookLink || existing.normalizedFacebookLink,
          collectorId: r.collectorId ?? existing.collectorId,
          collectorName: r.collectorName?.trim() || existing.collectorName,
          assignedAgentId:
            r.assignedAgentId !== undefined ? r.assignedAgentId : existing.assignedAgentId,
          assignedAgentName:
            r.assignedAgentName !== undefined
              ? r.assignedAgentName
              : existing.assignedAgentName,
          status: r.status ? normalizeStatus(r.status) : existing.status,
          followUpAt: r.followUpAt !== undefined ? r.followUpAt || null : existing.followUpAt,
          notes: r.notes !== undefined ? r.notes : existing.notes,
          lastCallNotes:
            r.lastCallNotes !== undefined ? r.lastCallNotes : existing.lastCallNotes,
          updatedAt,
        });
      }
    } else {
      const assignedName =
        typeof r.assignedAgentName === 'string' &&
        r.assignedAgentName.trim() &&
        r.assignedAgentName.trim().toLowerCase() !== 'unassigned'
          ? r.assignedAgentName.trim()
          : null;

      byId.set(id, {
        id,
        customerName: r.customerName?.trim() || 'Unknown Customer',
        phone,
        rawPhone,
        facebookLink,
        normalizedFacebookLink,
        notes: typeof r.notes === 'string' ? r.notes : '',
        collectorId: typeof r.collectorId === 'string' ? r.collectorId : 'collector-farhan',
        collectorName:
          typeof r.collectorName === 'string' && r.collectorName.trim()
            ? r.collectorName.trim()
            : 'Farhan',
        assignedAgentId:
          typeof r.assignedAgentId === 'string'
            ? r.assignedAgentId
            : assignedName
            ? `agent-${assignedName.toLowerCase()}`
            : null,
        assignedAgentName: assignedName,
        status: normalizeStatus(r.status),
        followUpAt:
          typeof r.followUpAt === 'string' && r.followUpAt.trim() ? r.followUpAt : null,
        lastCallNotes: typeof r.lastCallNotes === 'string' ? r.lastCallNotes : '',
        createdAt,
        updatedAt,
      });
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
  );
}

/**
 * Merges remote call logs pulled from Google Sheets into local call logs by ID.
 */
export function mergeRemoteCallLogs(
  localLogs: CallLog[],
  remoteLogs: Partial<CallLog>[]
): CallLog[] {
  if (!remoteLogs.length) return localLogs;

  const byId = new Map<string, CallLog>();
  for (const log of localLogs) {
    byId.set(log.id, log);
  }

  const nowIso = new Date().toISOString();

  for (const r of remoteLogs) {
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (!id || byId.has(id)) continue;

    const agentName = typeof r.agentName === 'string' ? r.agentName.trim() : 'Agent';
    byId.set(id, {
      id,
      leadId: typeof r.leadId === 'string' ? r.leadId.trim() : '',
      customerName: typeof r.customerName === 'string' ? r.customerName.trim() : '',
      phone: safePhoneString(r.phone),
      agentId:
        typeof r.agentId === 'string' && r.agentId.trim()
          ? r.agentId.trim()
          : `agent-${agentName.toLowerCase()}`,
      agentName,
      previousStatus: normalizeStatus(r.previousStatus),
      newStatus: normalizeStatus(r.newStatus),
      notes: typeof r.notes === 'string' ? r.notes : '',
      followUpAt:
        typeof r.followUpAt === 'string' && r.followUpAt.trim() ? r.followUpAt : null,
      timestamp: toValidTimestamp(r.timestamp, nowIso),
    });
  }

  return Array.from(byId.values()).sort(
    (a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0)
  );
}

/**
 * Merges remote Kawsar content posts pulled from Google Sheets into local posts by ID.
 */
export function mergeRemoteContentPosts(
  localPosts: ContentPost[],
  remotePosts: Partial<ContentPost>[]
): ContentPost[] {
  if (!remotePosts.length) return localPosts;

  const byId = new Map<string, ContentPost>();
  for (const post of localPosts) {
    byId.set(post.id, post);
  }

  const nowIso = new Date().toISOString();

  for (const r of remotePosts) {
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (!id || byId.has(id)) continue;

    const facebookLink = typeof r.facebookLink === 'string' ? r.facebookLink.trim() : '';
    const websiteLink = typeof r.websiteLink === 'string' ? r.websiteLink.trim() : '';
    if (!facebookLink && !websiteLink) continue;

    byId.set(id, {
      id,
      facebookLink,
      normalizedFacebookLink:
        r.normalizedFacebookLink?.trim() ||
        (facebookLink ? normalizePostUrl(facebookLink) : ''),
      websiteLink,
      normalizedWebsiteLink:
        r.normalizedWebsiteLink?.trim() ||
        (websiteLink ? normalizePostUrl(websiteLink) : ''),
      note: typeof r.note === 'string' ? r.note.trim() : '',
      posterId: typeof r.posterId === 'string' ? r.posterId : 'poster-kawsar',
      posterName:
        typeof r.posterName === 'string' && r.posterName.trim()
          ? r.posterName.trim()
          : 'Kawsar',
      createdAt: toValidTimestamp(r.createdAt, nowIso),
    });
  }

  return Array.from(byId.values()).sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
  );
}
