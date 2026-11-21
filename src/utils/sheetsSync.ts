import { CALL_STATUSES, CallLog, CallStatus, ContentPost, Lead } from '../types';
import {
  extractPhoneCoreKey,
  normalizeBdPhone,
  normalizeFacebookUrl,
  normalizePostUrl,
} from './leadLogic';

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

export interface SheetLeadDuplicateFlag {
  duplicateLeadId: string;
  originalLeadId: string;
  customerName: string;
  originalCustomerName: string;
  phone: string;
  facebookLink: string;
  matchedBy: 'phone' | 'facebook';
  collectorName: string;
  assignedAgentName: string | null;
  status: CallStatus;
}

export interface SheetPostDuplicateFlag {
  duplicatePostId: string;
  originalPostId: string;
  matchedField: 'Facebook Link' | 'Website Link';
  url: string;
  posterName: string;
  note: string;
}

export interface SheetDuplicateReport {
  checkedAt: string;
  leadDuplicates: SheetLeadDuplicateFlag[];
  postDuplicates: SheetPostDuplicateFlag[];
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

function resolveCollectorIdFromName(name: string, explicitId?: unknown): string {
  if (typeof explicitId === 'string' && explicitId.trim()) {
    return explicitId.trim();
  }
  const lower = name.trim().toLowerCase();
  if (lower === 'naim') return 'collector-naim';
  if (lower === 'farhan') return 'collector-farhan';
  if (lower.includes('jahid') || lower === 'admin') return 'admin-1';
  if (!lower) return 'collector-farhan';
  return `collector-${lower.replace(/[^a-z0-9]+/g, '-')}`;
}

function resolveAgentIdFromName(name: string | null, explicitId?: unknown): string | null {
  if (typeof explicitId === 'string' && explicitId.trim()) {
    return explicitId.trim();
  }
  if (!name) return null;
  return `agent-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export function isFirestoreDocIdSafe(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

/**
 * Builds a deterministic Firestore-safe fallback ID if a row in Google Sheets
 * was entered manually without an ID in Column A.
 */
function buildDeterministicLeadId(r: Partial<Lead>, index: number): string {
  const core = extractPhoneCoreKey(safePhoneString(r.rawPhone ?? r.phone));
  if (core) return `SHEET-PH-${core}`.slice(0, 120);
  const fb = normalizeFacebookUrl(typeof r.facebookLink === 'string' ? r.facebookLink : '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (fb) return `SHEET-FB-${fb}`;
  return `SHEET-ROW-${index + 2}`;
}

function buildDeterministicPostId(r: Partial<ContentPost>, index: number): string {
  const fb = normalizePostUrl(typeof r.facebookLink === 'string' ? r.facebookLink : '');
  const web = normalizePostUrl(typeof r.websiteLink === 'string' ? r.websiteLink : '');
  const rawSlug = (fb || web)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (rawSlug) return `SHEET-PST-${rawSlug}`;
  return `SHEET-PST-ROW-${index + 2}`;
}

/**
 * Merges remote leads pulled from Google Sheets into local leads,
 * deduplicating cleanly by unique `id` and normalizing phone & Facebook fields.
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

  remoteLeads.forEach((r, idx) => {
    const rawPhone = safePhoneString(r.rawPhone ?? r.phone);
    const phone = normalizeBdPhone(rawPhone) || rawPhone;
    const facebookLink = typeof r.facebookLink === 'string' ? r.facebookLink.trim() : '';
    const customerName = r.customerName?.trim() || '';

    // Skip completely empty sheet rows
    const explicitId = typeof r.id === 'string' ? r.id.trim() : '';
    if (!explicitId && !phone && !facebookLink && !customerName) return;

    const id = explicitId || buildDeterministicLeadId(r, idx);
    const normalizedFacebookLink =
      r.normalizedFacebookLink?.trim() || normalizeFacebookUrl(facebookLink);
    const updatedAt = toValidTimestamp(r.updatedAt, nowIso);
    const createdAt = toValidTimestamp(r.createdAt, updatedAt);

    const existing = byId.get(id);
    if (existing) {
      const existingTime = Date.parse(existing.updatedAt || existing.createdAt) || 0;
      const remoteTime = Date.parse(updatedAt) || 0;
      if (remoteTime >= existingTime) {
        const assignedName =
          r.assignedAgentName !== undefined
            ? r.assignedAgentName &&
              String(r.assignedAgentName).trim().toLowerCase() !== 'unassigned'
              ? String(r.assignedAgentName).trim()
              : null
            : existing.assignedAgentName;
        const assignedAgentId =
          r.assignedAgentId !== undefined
            ? r.assignedAgentId
            : assignedName !== existing.assignedAgentName
            ? resolveAgentIdFromName(assignedName)
            : existing.assignedAgentId;

        byId.set(id, {
          ...existing,
          customerName: customerName || existing.customerName,
          phone: phone || existing.phone,
          rawPhone: rawPhone || existing.rawPhone,
          facebookLink: facebookLink || existing.facebookLink,
          normalizedFacebookLink:
            normalizedFacebookLink || existing.normalizedFacebookLink,
          collectorId: existing.collectorId,
          collectorName: existing.collectorName,
          assignedAgentId,
          assignedAgentName: assignedName,
          status: r.status ? normalizeStatus(r.status) : existing.status,
          followUpAt: r.followUpAt !== undefined ? r.followUpAt || null : existing.followUpAt,
          notes: r.notes !== undefined ? r.notes : existing.notes,
          lastCallNotes:
            r.lastCallNotes !== undefined ? r.lastCallNotes : existing.lastCallNotes,
          updatedAt,
        });
      }
    } else {
      const collectorName =
        typeof r.collectorName === 'string' && r.collectorName.trim()
          ? r.collectorName.trim()
          : 'Farhan';
      const assignedName =
        typeof r.assignedAgentName === 'string' &&
        r.assignedAgentName.trim() &&
        r.assignedAgentName.trim().toLowerCase() !== 'unassigned'
          ? r.assignedAgentName.trim()
          : null;

      byId.set(id, {
        id,
        customerName: customerName || 'Unknown Customer',
        phone,
        rawPhone,
        facebookLink,
        normalizedFacebookLink,
        notes: typeof r.notes === 'string' ? r.notes : '',
        collectorId: resolveCollectorIdFromName(collectorName, r.collectorId),
        collectorName,
        assignedAgentId: resolveAgentIdFromName(assignedName, r.assignedAgentId),
        assignedAgentName: assignedName,
        status: normalizeStatus(r.status),
        followUpAt:
          typeof r.followUpAt === 'string' && r.followUpAt.trim() ? r.followUpAt : null,
        lastCallNotes: typeof r.lastCallNotes === 'string' ? r.lastCallNotes : '',
        createdAt,
        updatedAt,
      });
    }
  });

  return Array.from(byId.values()).sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
  );
}

/**
 * Merges remote call logs pulled from Google Sheets into local call logs by unique `id`.
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
 * Merges remote Kawsar content posts pulled from Google Sheets into local posts by unique `id`.
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

  remotePosts.forEach((r, idx) => {
    const facebookLink = typeof r.facebookLink === 'string' ? r.facebookLink.trim() : '';
    const websiteLink = typeof r.websiteLink === 'string' ? r.websiteLink.trim() : '';
    if (!facebookLink && !websiteLink) return;

    const explicitId = typeof r.id === 'string' ? r.id.trim() : '';
    const id = explicitId || buildDeterministicPostId(r, idx);
    if (byId.has(id)) return;

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
  });

  return Array.from(byId.values()).sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
  );
}

/**
 * Detects duplicate phone numbers or Facebook URLs across distinct `id` records
 * (e.g., manual duplicate rows added directly inside Google Sheets `Master_Data`).
 * Checks earliest-created record as the original and flags newer duplicates.
 */
export function detectLeadDuplicatesInList(leads: Lead[]): SheetLeadDuplicateFlag[] {
  if (leads.length < 2) return [];

  const chronological = [...leads].sort(
    (a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0)
  );

  const seenPhone = new Map<string, Lead>();
  const seenFb = new Map<string, Lead>();
  const flags: SheetLeadDuplicateFlag[] = [];
  const flaggedPairs = new Set<string>();

  for (const lead of chronological) {
    const corePhone = extractPhoneCoreKey(lead.phone || lead.rawPhone);
    const normFb = lead.normalizedFacebookLink || normalizeFacebookUrl(lead.facebookLink);

    if (corePhone) {
      const orig = seenPhone.get(corePhone);
      if (orig && orig.id !== lead.id) {
        const key = `${lead.id}:${orig.id}:phone`;
        if (!flaggedPairs.has(key)) {
          flaggedPairs.add(key);
          flags.push({
            duplicateLeadId: lead.id,
            originalLeadId: orig.id,
            customerName: lead.customerName,
            originalCustomerName: orig.customerName,
            phone: lead.phone || lead.rawPhone,
            facebookLink: lead.facebookLink,
            matchedBy: 'phone',
            collectorName: lead.collectorName,
            assignedAgentName: lead.assignedAgentName,
            status: lead.status,
          });
        }
      } else if (!orig) {
        seenPhone.set(corePhone, lead);
      }
    }

    if (normFb) {
      const orig = seenFb.get(normFb);
      if (orig && orig.id !== lead.id) {
        const key = `${lead.id}:${orig.id}:facebook`;
        if (!flaggedPairs.has(key)) {
          flaggedPairs.add(key);
          flags.push({
            duplicateLeadId: lead.id,
            originalLeadId: orig.id,
            customerName: lead.customerName,
            originalCustomerName: orig.customerName,
            phone: lead.phone || lead.rawPhone,
            facebookLink: lead.facebookLink,
            matchedBy: 'facebook',
            collectorName: lead.collectorName,
            assignedAgentName: lead.assignedAgentName,
            status: lead.status,
          });
        }
      } else if (!orig) {
        seenFb.set(normFb, lead);
      }
    }
  }

  return flags;
}

/**
 * Detects duplicate Facebook Links or Website Links across distinct `id` records
 * (e.g., manual duplicate rows added directly inside Google Sheets `Kawsar_Posts_Log`).
 */
export function detectPostDuplicatesInList(
  posts: ContentPost[]
): SheetPostDuplicateFlag[] {
  if (posts.length < 2) return [];

  const chronological = [...posts].sort(
    (a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0)
  );

  const seenUrls = new Map<string, { post: ContentPost; field: 'Facebook Link' | 'Website Link' }>();
  const flags: SheetPostDuplicateFlag[] = [];
  const flaggedKeys = new Set<string>();

  for (const post of chronological) {
    const fbNorm = post.normalizedFacebookLink || normalizePostUrl(post.facebookLink || '');
    const webNorm = post.normalizedWebsiteLink || normalizePostUrl(post.websiteLink || '');

    if (fbNorm) {
      const orig = seenUrls.get(fbNorm);
      if (orig && orig.post.id !== post.id) {
        const key = `${post.id}:${orig.post.id}:fb`;
        if (!flaggedKeys.has(key)) {
          flaggedKeys.add(key);
          flags.push({
            duplicatePostId: post.id,
            originalPostId: orig.post.id,
            matchedField: 'Facebook Link',
            url: post.facebookLink,
            posterName: post.posterName,
            note: post.note,
          });
        }
      } else if (!orig) {
        seenUrls.set(fbNorm, { post, field: 'Facebook Link' });
      }
    }

    if (webNorm) {
      const orig = seenUrls.get(webNorm);
      if (orig && orig.post.id !== post.id) {
        const key = `${post.id}:${orig.post.id}:web`;
        if (!flaggedKeys.has(key)) {
          flaggedKeys.add(key);
          flags.push({
            duplicatePostId: post.id,
            originalPostId: orig.post.id,
            matchedField: 'Website Link',
            url: post.websiteLink,
            posterName: post.posterName,
            note: post.note,
          });
        }
      } else if (!orig) {
        seenUrls.set(webNorm, { post, field: 'Website Link' });
      }
    }
  }

  return flags;
}
