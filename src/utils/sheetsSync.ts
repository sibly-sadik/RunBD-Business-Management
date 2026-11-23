import {
  CALL_STATUSES,
  CallLog,
  CallStatus,
  ContentPost,
  DuplicateAttempt,
  Lead,
  PaidCustomer,
  RenewalStatus,
  RENEWAL_STATUSES,
} from '../types';
import {
  addDaysToYmd,
  computeDaysRemaining,
  deduplicateSameDayCallLogs,
  extractPhoneCoreKey,
  getLocalDateString,
  normalizeBdPhone,
  normalizeFacebookUrl,
  normalizePostUrl,
  normalizeVehicleType,
  parseDateToYmd,
  toYmdString,
} from './leadLogic';

export const HISTORICAL_FALLBACK_ISO = '1970-01-01T00:00:00.000Z';

export const FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbyCPGFliknk1322hJoPwgCWkBIlobMRWd3AnJcAKr8R7oCs1Q5rNT--ydFr8jaWkF3r/exec';

export const LEGACY_GOOGLE_SHEETS_WEBHOOK_URLS: ReadonlySet<string> = new Set([
  'https://script.google.com/macros/s/AKfycbwqMl23Bi200Idn267ySCDpKBY30b1FdYC8OWPOPK90neBvSPwWyn7Eq-VqV8ublfUD/exec',
]);

export function isLegacyWebhookUrl(value?: string | null): boolean {
  const normalized = (value ?? '').trim().replace(/\/+$/, '');
  if (!normalized) return false;
  return LEGACY_GOOGLE_SHEETS_WEBHOOK_URLS.has(normalized);
}

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
  if (candidate && isValidHttpUrl(candidate) && !isLegacyWebhookUrl(candidate)) {
    return candidate;
  }
  return FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL;
}

/**
 * Resolves the active webhook URL: uses the saved custom URL if present
 * and not deprecated, otherwise automatically initializes with the default webhook URL.
 */
export function resolveWebhookUrl(
  savedUrl?: string | null,
  envUrl?: string | null
): string {
  const saved = (savedUrl ?? '').trim();
  if (saved && isValidHttpUrl(saved) && !isLegacyWebhookUrl(saved)) {
    return saved;
  }
  return getDefaultWebhookUrl(envUrl);
}

/**
 * Sanitizes a user/collector/agent name into a safe Google Sheets tab suffix
 * free of forbidden sheet title characters ([ ] * ? : / \) and bounded well within 100 chars.
 */
export function sanitizeSheetTabSuffix(rawName: string): string {
  const cleaned = String(rawName || '')
    .trim()
    .replace(/[\\/*?:[\]]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return cleaned || 'Unknown';
}

export function getCollectorTabName(collectorName: string): string {
  return `Collector_${sanitizeSheetTabSuffix(collectorName)}`;
}

export function getAgentTabName(agentName: string): string {
  return `Agent_${sanitizeSheetTabSuffix(agentName)}`;
}

export function getPaidAgentTabName(agentName: string): string {
  return `Paid_${sanitizeSheetTabSuffix(agentName)}`;
}

export interface SyncPaidCustomerPayload extends PaidCustomer {
  facebookLink?: string;
  collectorName?: string;
  amountOrPackage?: string;
}

export function enrichPaidCustomersForSheetSync(
  customers: PaidCustomer[],
  leads: Lead[]
): SyncPaidCustomerPayload[] {
  if (!customers.length) return [];

  const leadById = new Map<string, Lead>();
  const leadByPhone = new Map<string, Lead>();
  for (const lead of leads) {
    if (lead.id) {
      leadById.set(lead.id, lead);
    }
    const core = extractPhoneCoreKey(lead.phone || lead.rawPhone);
    if (core && !leadByPhone.has(core)) {
      leadByPhone.set(core, lead);
    }
  }

  return customers.map((customer) => {
    const existingExtra = customer as SyncPaidCustomerPayload;
    const derivedLeadId =
      customer.leadId?.trim() ||
      (customer.id.startsWith('PC-') ? customer.id.slice(3) : '');
    const corePhone = extractPhoneCoreKey(customer.phone);
    const matchedLead =
      (derivedLeadId ? leadById.get(derivedLeadId) : undefined) ??
      (corePhone ? leadByPhone.get(corePhone) : undefined);

    const facebookLink =
      existingExtra.facebookLink?.trim() || matchedLead?.facebookLink || '';
    const collectorName =
      existingExtra.collectorName?.trim() || matchedLead?.collectorName || 'Unknown';
    const amountOrPackage =
      existingExtra.amountOrPackage?.trim() ||
      (customer.renewalDate
        ? `1-Month Package (Renewal: ${customer.renewalDate})`
        : '1-Month Package');

    return {
      ...customer,
      facebookLink,
      collectorName,
      amountOrPackage,
    };
  });
}

export const DEFAULT_SHEETS_BATCH_SIZE = 50;

export type SheetsBatchEvent = 'TEST_SYNC' | 'FULL_SYNC' | 'LEADS_BATCH_UPSERT';

export interface SheetsBatchPlanItem {
  chunkIndex: number;
  totalChunks: number;
  event: SheetsBatchEvent;
  leads: Lead[];
  callLogs: CallLog[];
  contentPosts: ContentPost[];
  paidCustomers: SyncPaidCustomerPayload[];
  includeSummaries: boolean;
  skipBackfill: boolean;
  totalRecordsInChunk: number;
}

/**
 * Splits large sync payloads (e.g., 195+ leads, call logs, posts, paid customers)
 * into sequential batches capped at `batchSize` (default 50) total records per request
 * so each Google Apps Script execution finishes well below timeout limits.
 */
export function buildSheetsSyncChunks(input: {
  event: SheetsBatchEvent;
  leads?: Lead[];
  callLogs?: CallLog[];
  contentPosts?: ContentPost[];
  paidCustomers?: SyncPaidCustomerPayload[];
  batchSize?: number;
}): SheetsBatchPlanItem[] {
  const batchSize = Math.max(1, Math.floor(input.batchSize ?? DEFAULT_SHEETS_BATCH_SIZE));
  const leads = input.leads ?? [];
  const callLogs = input.callLogs ?? [];
  const contentPosts = input.contentPosts ?? [];
  const paidCustomers = input.paidCustomers ?? [];

  const rawChunks: Array<{
    leads: Lead[];
    callLogs: CallLog[];
    contentPosts: ContentPost[];
    paidCustomers: SyncPaidCustomerPayload[];
  }> = [];

  let current = {
    leads: [] as Lead[],
    callLogs: [] as CallLog[],
    contentPosts: [] as ContentPost[],
    paidCustomers: [] as SyncPaidCustomerPayload[],
  };
  let currentCount = 0;

  const flushCurrent = () => {
    if (currentCount > 0) {
      rawChunks.push(current);
      current = {
        leads: [],
        callLogs: [],
        contentPosts: [],
        paidCustomers: [],
      };
      currentCount = 0;
    }
  };

  const pushSlice = <T>(items: T[], targetKey: keyof typeof current) => {
    let offset = 0;
    while (offset < items.length) {
      const remainingCapacity = batchSize - currentCount;
      const take = Math.min(remainingCapacity, items.length - offset);
      const slice = items.slice(offset, offset + take);
      (current[targetKey] as unknown[]).push(...slice);
      currentCount += slice.length;
      offset += take;
      if (currentCount >= batchSize) {
        flushCurrent();
      }
    }
  };

  pushSlice(leads, 'leads');
  pushSlice(callLogs, 'callLogs');
  pushSlice(contentPosts, 'contentPosts');
  pushSlice(paidCustomers, 'paidCustomers');
  flushCurrent();

  if (rawChunks.length === 0) {
    rawChunks.push({
      leads: [],
      callLogs: [],
      contentPosts: [],
      paidCustomers: [],
    });
  }

  const totalChunks = rawChunks.length;
  return rawChunks.map((chunk, idx) => {
    const isLast = idx === totalChunks - 1;
    const totalRecordsInChunk =
      chunk.leads.length +
      chunk.callLogs.length +
      chunk.contentPosts.length +
      chunk.paidCustomers.length;

    return {
      chunkIndex: idx + 1,
      totalChunks,
      event: isLast ? input.event : 'LEADS_BATCH_UPSERT',
      leads: chunk.leads,
      callLogs: chunk.callLogs,
      contentPosts: chunk.contentPosts,
      paidCustomers: chunk.paidCustomers,
      includeSummaries: isLast,
      skipBackfill: !isLast || input.event === 'LEADS_BATCH_UPSERT',
      totalRecordsInChunk,
    };
  });
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
  paidCustomers: Partial<PaidCustomer>[];
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

export interface LeadDuplicateCheckResult {
  ok: boolean;
  isDuplicate: boolean;
  matchedBy?: 'phone' | 'facebook';
  existingLead?: {
    id: string;
    customerName: string;
    phone: string;
    facebookLink: string;
    collectorName: string;
    assignedAgentName: string | null;
    status: CallStatus;
    createdAt: string;
  };
  error?: string;
}

export interface PostDuplicateCheckResult {
  ok: boolean;
  isDuplicate: boolean;
  matchedField?: 'Facebook Link' | 'Website Link';
  existingPost?: {
    id: string;
    note: string;
    facebookLink: string;
    websiteLink: string;
    posterName: string;
    createdAt: string;
  };
  error?: string;
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
    Array.isArray(obj.contentPosts) ||
    Array.isArray(obj.paidCustomers);
  if (!hasAnyArray) return null;

  return {
    leads: Array.isArray(obj.leads) ? (obj.leads as Partial<Lead>[]) : [],
    callLogs: Array.isArray(obj.callLogs) ? (obj.callLogs as Partial<CallLog>[]) : [],
    contentPosts: Array.isArray(obj.contentPosts)
      ? (obj.contentPosts as Partial<ContentPost>[])
      : [],
    paidCustomers: Array.isArray(obj.paidCustomers)
      ? (obj.paidCustomers as Partial<PaidCustomer>[])
      : [],
  };
}

function isRecordOnDate(value: unknown, targetDateStr: string): boolean {
  return parseDateToYmd(value) === targetDateStr;
}

/**
 * Filters a pulled Google Sheets payload strictly to rows matching `targetDateStr` (YYYY-MM-DD)
 * for leads, callLogs, and contentPosts so historical Master_Data rows never load into
 * frontend state/memory, while preserving `paidCustomers` in full for 1-month renewal tracking.
 * Never falls back to updatedAt or render time for leads.
 */
export function filterPullPayloadByDate(
  payload: ParsedPullPayload,
  targetDateStr: string = getLocalDateString()
): ParsedPullPayload {
  return {
    leads: payload.leads.filter((l) => {
      const storedDate = l.collectedDate ?? l.date ?? l.createdAt;
      return isRecordOnDate(storedDate, targetDateStr);
    }),
    callLogs: payload.callLogs.filter((c) => isRecordOnDate(c.timestamp, targetDateStr)),
    contentPosts: payload.contentPosts.filter((p) =>
      isRecordOnDate(p.createdAt, targetDateStr)
    ),
    paidCustomers: payload.paidCustomers,
  };
}

function buildExistingLeadSummary(rawLead: Record<string, unknown>): NonNullable<LeadDuplicateCheckResult['existingLead']> {
  const agentRaw = String(
    rawLead.assignedAgentName ?? rawLead.assignedAgent ?? ''
  ).trim();
  const assignedAgentName =
    agentRaw && agentRaw.toLowerCase() !== 'unassigned' ? agentRaw : null;

  const rawPhone = safePhoneString(rawLead.phone ?? rawLead.rawPhone);
  const phone = normalizeBdPhone(rawPhone) || rawPhone;
  const createdAt = toValidTimestamp(
    rawLead.createdAt ?? rawLead.collectedDate ?? rawLead.date ?? rawLead.updatedAt,
    HISTORICAL_FALLBACK_ISO
  );

  return {
    id: typeof rawLead.id === 'string' && rawLead.id.trim() ? rawLead.id.trim() : 'SHEET-DUP',
    customerName:
      typeof rawLead.customerName === 'string' && rawLead.customerName.trim()
        ? rawLead.customerName.trim()
        : 'Existing Sheet Lead',
    phone,
    facebookLink: typeof rawLead.facebookLink === 'string' ? rawLead.facebookLink.trim() : '',
    collectorName:
      typeof rawLead.collectorName === 'string' && rawLead.collectorName.trim()
        ? rawLead.collectorName.trim()
        : typeof rawLead.collector === 'string' && rawLead.collector.trim()
        ? rawLead.collector.trim()
        : 'Unknown Collector',
    assignedAgentName,
    status: normalizeStatus(rawLead.status),
    createdAt,
  };
}

function buildExistingPostSummary(rawPost: Record<string, unknown>): NonNullable<PostDuplicateCheckResult['existingPost']> {
  return {
    id: typeof rawPost.id === 'string' && rawPost.id.trim() ? rawPost.id.trim() : 'SHEET-PST-DUP',
    note: typeof rawPost.note === 'string' ? rawPost.note.trim() : '',
    facebookLink: typeof rawPost.facebookLink === 'string' ? rawPost.facebookLink.trim() : '',
    websiteLink: typeof rawPost.websiteLink === 'string' ? rawPost.websiteLink.trim() : '',
    posterName:
      typeof rawPost.posterName === 'string' && rawPost.posterName.trim()
        ? rawPost.posterName.trim()
        : 'Kawsar',
    createdAt: toValidTimestamp(rawPost.createdAt, HISTORICAL_FALLBACK_ISO),
  };
}

/**
 * Parses an on-demand `?action=check_lead_duplicate` JSON response from Google Apps Script.
 * Supports both dedicated `{ ok, isDuplicate, lead }` responses and pull-style `{ ok: true, leads: [...] }`
 * responses from older Apps Script `doGet` deployments (checking ephemerally without storing rows).
 */
export function parseLeadDuplicateCheckResponse(
  raw: unknown,
  query?: { phone?: string; facebookLink?: string }
): LeadDuplicateCheckResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.ok === false) {
    return {
      ok: false,
      isDuplicate: false,
      error:
        typeof obj.error === 'string' && obj.error.trim()
          ? obj.error.trim()
          : 'Google Sheets Apps Script returned ok: false',
    };
  }

  if (typeof obj.isDuplicate === 'boolean') {
    if (!obj.isDuplicate) {
      return { ok: true, isDuplicate: false };
    }

    const rawLead =
      obj.lead && typeof obj.lead === 'object'
        ? (obj.lead as Record<string, unknown>)
        : obj.existingLead && typeof obj.existingLead === 'object'
        ? (obj.existingLead as Record<string, unknown>)
        : obj;

    const matchedRaw = String(obj.matchedBy ?? rawLead.matchedBy ?? 'phone').toLowerCase();
    const matchedBy: 'phone' | 'facebook' = matchedRaw.includes('face') ? 'facebook' : 'phone';

    return {
      ok: true,
      isDuplicate: true,
      matchedBy,
      existingLead: buildExistingLeadSummary(rawLead),
    };
  }

  // Fallback: Apps Script deployment returned a pull payload `{ ok: true, leads: [...] }`
  const nestedData =
    obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : null;
  const candidateLeads = Array.isArray(obj.leads)
    ? obj.leads
    : nestedData && Array.isArray(nestedData.leads)
    ? nestedData.leads
    : null;

  if (!candidateLeads) return null;

  const targetCorePhone = extractPhoneCoreKey(query?.phone ?? '');
  const targetNormFb = normalizeFacebookUrl(query?.facebookLink ?? '');

  for (const item of candidateLeads) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const rowCorePhone = extractPhoneCoreKey(safePhoneString(row.phone ?? row.rawPhone));
    if (targetCorePhone && rowCorePhone && rowCorePhone === targetCorePhone) {
      return {
        ok: true,
        isDuplicate: true,
        matchedBy: 'phone',
        existingLead: buildExistingLeadSummary(row),
      };
    }

    const rowFbRaw =
      typeof row.facebookLink === 'string'
        ? row.facebookLink
        : typeof row.normalizedFacebookLink === 'string'
        ? row.normalizedFacebookLink
        : '';
    const rowNormFb = normalizeFacebookUrl(rowFbRaw);
    if (targetNormFb && rowNormFb && rowNormFb === targetNormFb) {
      return {
        ok: true,
        isDuplicate: true,
        matchedBy: 'facebook',
        existingLead: buildExistingLeadSummary(row),
      };
    }
  }

  return { ok: true, isDuplicate: false };
}

/**
 * Parses an on-demand `?action=check_post_duplicate` JSON response from Google Apps Script.
 * Supports both dedicated `{ ok, isDuplicate, post }` responses and pull-style `{ ok: true, contentPosts: [...] }`
 * responses from older Apps Script `doGet` deployments.
 */
export function parsePostDuplicateCheckResponse(
  raw: unknown,
  query?: { facebookLink?: string; websiteLink?: string }
): PostDuplicateCheckResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.ok === false) {
    return {
      ok: false,
      isDuplicate: false,
      error:
        typeof obj.error === 'string' && obj.error.trim()
          ? obj.error.trim()
          : 'Google Sheets Apps Script returned ok: false',
    };
  }

  if (typeof obj.isDuplicate === 'boolean') {
    if (!obj.isDuplicate) {
      return { ok: true, isDuplicate: false };
    }

    const rawPost =
      obj.post && typeof obj.post === 'object'
        ? (obj.post as Record<string, unknown>)
        : obj.existingPost && typeof obj.existingPost === 'object'
        ? (obj.existingPost as Record<string, unknown>)
        : obj;

    const matchedRaw = String(
      obj.matchedField ?? rawPost.matchedField ?? 'Facebook Link'
    ).toLowerCase();
    const matchedField: 'Facebook Link' | 'Website Link' = matchedRaw.includes('web')
      ? 'Website Link'
      : 'Facebook Link';

    return {
      ok: true,
      isDuplicate: true,
      matchedField,
      existingPost: buildExistingPostSummary(rawPost),
    };
  }

  // Fallback: Apps Script deployment returned a pull payload `{ ok: true, contentPosts: [...] }`
  const nestedData =
    obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : null;
  const candidatePosts = Array.isArray(obj.contentPosts)
    ? obj.contentPosts
    : Array.isArray(obj.posts)
    ? obj.posts
    : nestedData && Array.isArray(nestedData.contentPosts)
    ? nestedData.contentPosts
    : null;

  if (!candidatePosts) return null;

  const targetFb = normalizePostUrl(query?.facebookLink ?? '');
  const targetWeb = normalizePostUrl(query?.websiteLink ?? '');

  for (const item of candidatePosts) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const rowFb = normalizePostUrl(
      typeof row.facebookLink === 'string'
        ? row.facebookLink
        : typeof row.normalizedFacebookLink === 'string'
        ? row.normalizedFacebookLink
        : ''
    );
    const rowWeb = normalizePostUrl(
      typeof row.websiteLink === 'string'
        ? row.websiteLink
        : typeof row.normalizedWebsiteLink === 'string'
        ? row.normalizedWebsiteLink
        : ''
    );

    if (targetFb && (targetFb === rowFb || targetFb === rowWeb)) {
      return {
        ok: true,
        isDuplicate: true,
        matchedField: 'Facebook Link',
        existingPost: buildExistingPostSummary(row),
      };
    }
    if (targetWeb && (targetWeb === rowWeb || targetWeb === rowFb)) {
      return {
        ok: true,
        isDuplicate: true,
        matchedField: 'Website Link',
        existingPost: buildExistingPostSummary(row),
      };
    }
  }

  return { ok: true, isDuplicate: false };
}

function toValidTimestamp(value: unknown, fallback: string): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.replace(/^'+/, '').trim();
    if (!trimmed) return fallback;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const ymd = parseDateToYmd(trimmed);
      return ymd ? `${ymd}T12:00:00.000Z` : fallback;
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return fallback;
}

function safePhoneString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
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
  if (lower === 'kawsar') return 'collector-kawsar';
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

  remoteLeads.forEach((r, idx) => {
    const rawPhone = safePhoneString(r.rawPhone ?? r.phone);
    const phone = normalizeBdPhone(rawPhone) || rawPhone;
    const facebookLink = typeof r.facebookLink === 'string' ? r.facebookLink.trim() : '';
    const customerName = normalizeVehicleType(r.customerName);

    // Skip completely empty sheet rows
    const explicitId = typeof r.id === 'string' ? r.id.trim() : '';
    if (!explicitId && !phone && !facebookLink && !customerName) return;

    const id = explicitId || buildDeterministicLeadId(r, idx);
    const normalizedFacebookLink =
      r.normalizedFacebookLink?.trim() || normalizeFacebookUrl(facebookLink);
    const existing = byId.get(id);
    const hasExplicitRemoteUpdatedAt = Boolean(
      typeof r.updatedAt === 'string' && r.updatedAt.trim() && !Number.isNaN(Date.parse(r.updatedAt))
    );
    const remoteCreatedRaw = r.createdAt ?? r.collectedDate ?? r.date;
    const createdAt = toValidTimestamp(
      remoteCreatedRaw,
      existing ? existing.createdAt : HISTORICAL_FALLBACK_ISO
    );
    const updatedAt = toValidTimestamp(
      r.updatedAt,
      existing ? existing.updatedAt : createdAt
    );
    const resolvedCollectedDate =
      parseDateToYmd(r.collectedDate ?? r.date) ?? existing?.collectedDate;

    if (existing) {
      const existingTime = Date.parse(existing.updatedAt || existing.createdAt) || 0;
      const remoteTime = Date.parse(updatedAt) || 0;
      if (hasExplicitRemoteUpdatedAt && remoteTime > existingTime) {
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
          createdAt: existing.createdAt || createdAt,
          updatedAt,
          ...(resolvedCollectedDate ? { collectedDate: resolvedCollectedDate } : {}),
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
        ...(resolvedCollectedDate ? { collectedDate: resolvedCollectedDate } : {}),
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
  if (!remoteLogs.length) return deduplicateSameDayCallLogs(localLogs, { perAgent: true });

  const byId = new Map<string, CallLog>();
  for (const log of localLogs) {
    byId.set(log.id, log);
  }

  for (const r of remoteLogs) {
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (!id) continue;

    const existing = byId.get(id);
    const agentName =
      typeof r.agentName === 'string' && r.agentName.trim()
        ? r.agentName.trim()
        : existing?.agentName || 'Agent';
    const remoteTimestamp = toValidTimestamp(r.timestamp, HISTORICAL_FALLBACK_ISO);

    if (existing) {
      const existingTime = Date.parse(existing.timestamp) || 0;
      const remoteTime = Date.parse(remoteTimestamp) || 0;
      if (remoteTime > existingTime) {
        byId.set(id, {
          ...existing,
          leadId: typeof r.leadId === 'string' && r.leadId.trim() ? r.leadId.trim() : existing.leadId,
          customerName:
            typeof r.customerName === 'string' && r.customerName.trim()
              ? r.customerName.trim()
              : existing.customerName,
          phone: safePhoneString(r.phone) || existing.phone,
          agentId:
            typeof r.agentId === 'string' && r.agentId.trim()
              ? r.agentId.trim()
              : existing.agentId,
          agentName,
          previousStatus: existing.previousStatus || normalizeStatus(r.previousStatus),
          newStatus: r.newStatus ? normalizeStatus(r.newStatus) : existing.newStatus,
          notes: typeof r.notes === 'string' ? r.notes : existing.notes,
          followUpAt:
            r.followUpAt !== undefined
              ? typeof r.followUpAt === 'string' && r.followUpAt.trim()
                ? r.followUpAt
                : null
              : existing.followUpAt,
          timestamp: remoteTimestamp,
        });
      }
      continue;
    }

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
      timestamp: remoteTimestamp,
    });
  }

  return deduplicateSameDayCallLogs(Array.from(byId.values()), { perAgent: true });
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
      createdAt: toValidTimestamp(r.createdAt, HISTORICAL_FALLBACK_ISO),
    });
  });

  return Array.from(byId.values()).sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
  );
}

const VALID_RENEWAL_STATUSES: ReadonlySet<RenewalStatus> = new Set(RENEWAL_STATUSES);

function normalizeRenewalStatus(status: unknown): RenewalStatus {
  if (typeof status === 'string') {
    const trimmed = status.trim();
    if (VALID_RENEWAL_STATUSES.has(trimmed as RenewalStatus)) {
      return trimmed as RenewalStatus;
    }
    const lower = trimmed.toLowerCase();
    if (lower === 'renewed') return 'Renewed';
    if (lower === 'expired') return 'Expired';
  }
  return 'Active';
}

function buildDeterministicPaidCustomerId(
  r: Partial<PaidCustomer>,
  index: number
): string {
  const leadId = typeof r.leadId === 'string' ? r.leadId.trim() : '';
  if (leadId && isFirestoreDocIdSafe(leadId)) {
    return `PC-${leadId}`.slice(0, 128);
  }
  const core = extractPhoneCoreKey(safePhoneString(r.phone));
  if (core) return `SHEET-PC-${core}`.slice(0, 120);
  return `SHEET-PC-ROW-${index + 2}`;
}

/**
 * Two-way merge of Paid Customers pulled from Google Sheets (`Paid_Customers` tab)
 * or Firestore into local state. Supports manual edits in Google Sheets (e.g., changing
 * Renewal Status or Renewal Date directly in the sheet) while preserving newer local updates.
 */
export function mergeRemotePaidCustomers(
  localCustomers: PaidCustomer[],
  remoteCustomers: Partial<PaidCustomer>[]
): PaidCustomer[] {
  if (!remoteCustomers.length) return localCustomers;

  const byId = new Map<string, PaidCustomer>();
  for (const c of localCustomers) {
    byId.set(c.id, c);
  }

  const now = new Date();
  const nowIso = now.toISOString();

  remoteCustomers.forEach((r, idx) => {
    const rawPhone = safePhoneString(r.phone);
    const phone = normalizeBdPhone(rawPhone) || rawPhone;
    const customerName = typeof r.customerName === 'string' ? r.customerName.trim() : '';
    const explicitId = typeof r.id === 'string' ? r.id.trim() : '';
    const leadId = typeof r.leadId === 'string' ? r.leadId.trim() : '';

    if (!explicitId && !phone && !customerName) return;

    const id = explicitId || buildDeterministicPaidCustomerId(r, idx);
    const existing = byId.get(id);

    const hasExplicitRemoteUpdatedAt = Boolean(
      typeof r.updatedAt === 'string' && r.updatedAt.trim() && !Number.isNaN(Date.parse(r.updatedAt))
    );
    const updatedAt = toValidTimestamp(
      r.updatedAt,
      existing ? existing.updatedAt : nowIso
    );
    const createdAt = toValidTimestamp(
      r.createdAt,
      existing ? existing.createdAt : updatedAt
    );

    const confirmedDateRaw =
      typeof r.confirmedDate === 'string' && r.confirmedDate.replace(/^'+/, '').trim()
        ? toYmdString(r.confirmedDate.replace(/^'+/, '').trim(), now)
        : existing?.confirmedDate || getLocalDateString(now);

    const renewalDateRaw =
      typeof r.renewalDate === 'string' && r.renewalDate.replace(/^'+/, '').trim()
        ? toYmdString(r.renewalDate.replace(/^'+/, '').trim(), now)
        : existing?.renewalDate || addDaysToYmd(confirmedDateRaw, 30);

    const remoteAgentRaw =
      r.assignedAgentName !== undefined
        ? r.assignedAgentName &&
          String(r.assignedAgentName).trim().toLowerCase() !== 'unassigned'
          ? String(r.assignedAgentName).trim()
          : null
        : existing?.assignedAgentName ?? null;
    const remoteAgentId =
      r.assignedAgentId !== undefined
        ? r.assignedAgentId
        : remoteAgentRaw !== existing?.assignedAgentName
        ? resolveAgentIdFromName(remoteAgentRaw)
        : existing?.assignedAgentId ?? resolveAgentIdFromName(remoteAgentRaw);

    const remoteStatus = r.renewalStatus
      ? normalizeRenewalStatus(r.renewalStatus)
      : existing?.renewalStatus ?? 'Active';

    if (existing) {
      const existingTime = Date.parse(existing.updatedAt || existing.createdAt) || 0;
      const remoteTime = Date.parse(updatedAt) || 0;
      const sheetValuesChanged =
        (customerName && customerName !== existing.customerName) ||
        (phone && phone !== existing.phone) ||
        remoteAgentRaw !== existing.assignedAgentName ||
        confirmedDateRaw !== existing.confirmedDate ||
        renewalDateRaw !== existing.renewalDate ||
        remoteStatus !== existing.renewalStatus;

      // Apply remote update if remote timestamp is strictly newer, OR if remote is not older
      // (same timestamp / manual sheet edit without touching Updated At) and sheet fields changed.
      const shouldUpdate =
        (hasExplicitRemoteUpdatedAt && remoteTime > existingTime) ||
        (remoteTime >= existingTime && sheetValuesChanged) ||
        (!hasExplicitRemoteUpdatedAt && sheetValuesChanged);

      if (shouldUpdate) {
        const effectiveUpdatedAt =
          hasExplicitRemoteUpdatedAt && remoteTime > existingTime
            ? updatedAt
            : sheetValuesChanged
            ? nowIso
            : existing.updatedAt;

        byId.set(id, {
          ...existing,
          leadId: leadId || existing.leadId,
          customerName: customerName || existing.customerName,
          phone: phone || existing.phone,
          assignedAgentId: remoteAgentId,
          assignedAgentName: remoteAgentRaw,
          confirmedDate: confirmedDateRaw,
          renewalDate: renewalDateRaw,
          renewalStatus: remoteStatus,
          lastRenewedAt:
            r.lastRenewedAt !== undefined
              ? r.lastRenewedAt || null
              : remoteStatus === 'Renewed' && existing.renewalStatus !== 'Renewed'
              ? effectiveUpdatedAt
              : existing.lastRenewedAt,
          notes: typeof r.notes === 'string' ? r.notes : existing.notes,
          updatedAt: effectiveUpdatedAt,
        });
      }
    } else {
      byId.set(id, {
        id,
        leadId: leadId || id.replace(/^PC-/, ''),
        customerName: customerName || 'Paid Customer',
        phone,
        assignedAgentId: remoteAgentId,
        assignedAgentName: remoteAgentRaw,
        confirmedDate: confirmedDateRaw,
        renewalDate: renewalDateRaw,
        renewalStatus: remoteStatus,
        lastRenewedAt:
          typeof r.lastRenewedAt === 'string' && r.lastRenewedAt.trim()
            ? r.lastRenewedAt
            : null,
        notes: typeof r.notes === 'string' ? r.notes : '',
        createdAt,
        updatedAt,
      });
    }
  });

  return Array.from(byId.values()).sort(
    (a, b) =>
      computeDaysRemaining(a.renewalDate, now) - computeDaysRemaining(b.renewalDate, now) ||
      (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
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

/**
 * Merges remote DuplicateAttempt records with local blocked attempts by ID
 * so real-time Firestore snapshots never wipe locally recorded duplicate alerts.
 */
export function mergeRemoteDuplicateAttempts(
  localAttempts: DuplicateAttempt[],
  remoteAttempts: DuplicateAttempt[]
): DuplicateAttempt[] {
  if (!remoteAttempts.length) return localAttempts;
  const byId = new Map<string, DuplicateAttempt>();
  for (const item of localAttempts) {
    byId.set(item.id, item);
  }
  for (const item of remoteAttempts) {
    if (item && item.id) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0)
  );
}

