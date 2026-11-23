import { DEFAULT_CALL_SCRIPT } from '../data/seedData';
import { supabase } from '../lib/supabase';
import {
  AppSettings,
  AuditAction,
  AuditLog,
  CALL_STATUSES,
  CallLog,
  CallStatus,
  ContentPost,
  DuplicateAttempt,
  Lead,
  PaidCustomer,
  RENEWAL_STATUSES,
  RenewalStatus,
  UserRole,
} from '../types';
import {
  clampDateToDhakaToday,
  extractPhoneCoreKey,
  getAuthoritativeDhakaTodayYmd,
  getLocalDateString,
  normalizeBdPhone,
  normalizeFacebookUrl,
  normalizePostUrl,
  normalizeVehicleType,
  parseDateToYmd,
} from './leadLogic';
import { FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL } from './sheetsSync';

export interface SupabaseLeadRow {
  id: string;
  customer_name: string;
  phone: string;
  raw_phone?: string | null;
  phone_normalized: string;
  facebook_link: string | null;
  facebook_normalized: string | null;
  notes?: string | null;
  collector_id?: string | null;
  collector_name: string | null;
  assigned_agent_id?: string | null;
  assigned_agent_name: string | null;
  status: string;
  follow_up_at: string | null;
  last_call_notes: string | null;
  collected_date: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseCallLogRow {
  id: string;
  lead_id: string;
  customer_name: string;
  phone: string;
  agent_id?: string | null;
  agent_name: string;
  previous_status: string;
  new_status: string;
  notes: string | null;
  follow_up_at: string | null;
  call_date: string;
  created_at: string;
}

export interface SupabasePaidCustomerRow {
  id: string;
  lead_id?: string | null;
  customer_name: string;
  phone: string;
  facebook_link?: string | null;
  assigned_agent_id?: string | null;
  assigned_agent_name: string | null;
  confirmed_date: string;
  renewal_date: string;
  renewal_status: string;
  last_renewed_at?: string | null;
  notes: string | null;
  created_at?: string | null;
  updated_at: string;
}

export interface SupabaseContentPostRow {
  id: string;
  title: string | null;
  facebook_link: string | null;
  facebook_normalized: string | null;
  website_link: string | null;
  website_normalized: string | null;
  poster_id?: string | null;
  poster_name?: string | null;
  posted_date: string;
  created_at: string;
}

export interface SupabaseDuplicateAttemptRow {
  id: string;
  attempted_phone: string | null;
  attempted_fb: string | null;
  attempted_name?: string | null;
  collector_id?: string | null;
  collector_name: string | null;
  matched_by?: string | null;
  existing_lead_id: string | null;
  existing_collector_name?: string | null;
  existing_date?: string | null;
  attempt_date: string;
  created_at: string;
}

export interface SupabaseAuditLogRow {
  id: string;
  actor_id?: string | null;
  actor_name: string;
  actor_role?: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

export interface SupabaseSettingsRow {
  id: string;
  auto_assign_enabled: boolean;
  round_robin_index: number;
  disabled_agents?: string[] | string | null;
  google_sheets_webhook_url: string;
  call_script: string;
  last_synced_at: string | null;
  updated_at: string;
}

export function sanitizeDisabledAgentIds(raw: unknown): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
  }
  return result;
}

export function isMissingColumnError(
  err: { code?: string; message?: string } | null,
  columnName?: string
): boolean {
  if (!err) return false;
  const code = (err.code ?? '').toUpperCase();
  const msg = (err.message ?? '').toLowerCase();
  if (code === '42703' || code === 'PGRST204') return true;
  if (columnName && msg.includes(columnName.toLowerCase()) && (msg.includes('column') || msg.includes('schema cache'))) {
    return true;
  }
  return false;
}

function sanitizeCallStatus(raw: string | undefined | null): CallStatus {
  const val = (raw ?? '').trim();
  return (CALL_STATUSES as string[]).includes(val) ? (val as CallStatus) : 'Pending';
}

function sanitizeRenewalStatus(raw: string | undefined | null): RenewalStatus {
  const val = (raw ?? '').trim();
  return (RENEWAL_STATUSES as string[]).includes(val) ? (val as RenewalStatus) : 'Active';
}

function slugId(prefix: string, name: string | null | undefined): string {
  const slug = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `${prefix}-${slug}` : '';
}

export function isSchemaMissingError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = (err.code ?? '').toUpperCase();
  const msg = (err.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table')
  );
}

export function rowToLead(row: SupabaseLeadRow): Lead {
  const collectorName = row.collector_name?.trim() || 'Unknown';
  const assignedAgentName = row.assigned_agent_name?.trim() || null;
  return {
    id: row.id,
    customerName: normalizeVehicleType(row.customer_name) || row.customer_name,
    phone: row.phone,
    rawPhone: row.raw_phone || row.phone,
    facebookLink: row.facebook_link ?? '',
    normalizedFacebookLink: row.facebook_normalized ?? '',
    notes: row.notes ?? '',
    collectorId: row.collector_id?.trim() || slugId('collector', collectorName) || 'collector-farhan',
    collectorName,
    assignedAgentId:
      row.assigned_agent_id?.trim() ||
      (assignedAgentName ? slugId('agent', assignedAgentName) : null),
    assignedAgentName,
    status: sanitizeCallStatus(row.status),
    followUpAt: row.follow_up_at,
    lastCallNotes: row.last_call_notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    collectedDate: row.collected_date,
    date: row.collected_date,
  };
}

export function leadToSupabaseRow(lead: Lead): SupabaseLeadRow {
  const normalizedPhone =
    normalizeBdPhone(lead.phone || lead.rawPhone) ||
    lead.phone.trim() ||
    lead.rawPhone.trim();
  const facebookNormalized =
    lead.normalizedFacebookLink?.trim() || normalizeFacebookUrl(lead.facebookLink);
  const collectedDate = clampDateToDhakaToday(
    lead.collectedDate ?? lead.date ?? lead.createdAt,
    getAuthoritativeDhakaTodayYmd()
  ).ymd;

  return {
    id: lead.id,
    customer_name: normalizeVehicleType(lead.customerName) || lead.customerName,
    phone: normalizedPhone,
    raw_phone: lead.rawPhone || normalizedPhone,
    phone_normalized: normalizedPhone,
    facebook_link: lead.facebookLink ?? '',
    facebook_normalized: facebookNormalized,
    notes: lead.notes ?? '',
    collector_id: lead.collectorId,
    collector_name: lead.collectorName,
    assigned_agent_id: lead.assignedAgentId ?? null,
    assigned_agent_name: lead.assignedAgentName ?? null,
    status: sanitizeCallStatus(lead.status),
    follow_up_at: lead.followUpAt ?? null,
    last_call_notes: lead.lastCallNotes ?? '',
    collected_date: collectedDate,
    created_at: lead.createdAt,
    updated_at: lead.updatedAt,
  };
}

export function rowToCallLog(row: SupabaseCallLogRow): CallLog {
  return {
    id: row.id,
    leadId: row.lead_id,
    customerName: row.customer_name,
    phone: row.phone,
    agentId: row.agent_id?.trim() || slugId('agent', row.agent_name) || 'agent-tanjin',
    agentName: row.agent_name,
    previousStatus: sanitizeCallStatus(row.previous_status),
    newStatus: sanitizeCallStatus(row.new_status),
    notes: row.notes ?? '',
    followUpAt: row.follow_up_at,
    timestamp: row.created_at,
  };
}

export function callLogToSupabaseRow(log: CallLog): SupabaseCallLogRow {
  const callDate = parseDateToYmd(log.timestamp) ?? getLocalDateString();
  return {
    id: log.id,
    lead_id: log.leadId,
    customer_name: log.customerName,
    phone: normalizeBdPhone(log.phone) || log.phone,
    agent_id: log.agentId,
    agent_name: log.agentName,
    previous_status: sanitizeCallStatus(log.previousStatus),
    new_status: sanitizeCallStatus(log.newStatus),
    notes: log.notes ?? '',
    follow_up_at: log.followUpAt ?? null,
    call_date: callDate,
    created_at: log.timestamp,
  };
}

export function rowToPaidCustomer(row: SupabasePaidCustomerRow): PaidCustomer {
  const agentName = row.assigned_agent_name?.trim() || null;
  return {
    id: row.id,
    leadId: row.lead_id?.trim() || row.id.replace(/^PC-/, ''),
    customerName: row.customer_name,
    phone: row.phone,
    assignedAgentId:
      row.assigned_agent_id?.trim() || (agentName ? slugId('agent', agentName) : null),
    assignedAgentName: agentName,
    confirmedDate: row.confirmed_date,
    renewalDate: row.renewal_date,
    renewalStatus: sanitizeRenewalStatus(row.renewal_status),
    lastRenewedAt: row.last_renewed_at ?? null,
    notes: row.notes ?? '',
    createdAt: row.created_at || row.updated_at,
    updatedAt: row.updated_at,
  };
}

export function paidCustomerToSupabaseRow(
  customer: PaidCustomer,
  facebookLink = ''
): SupabasePaidCustomerRow {
  return {
    id: customer.id,
    lead_id: customer.leadId,
    customer_name: customer.customerName,
    phone: normalizeBdPhone(customer.phone) || customer.phone.trim(),
    facebook_link: facebookLink,
    assigned_agent_id: customer.assignedAgentId ?? null,
    assigned_agent_name: customer.assignedAgentName ?? null,
    confirmed_date: customer.confirmedDate,
    renewal_date: customer.renewalDate,
    renewal_status: sanitizeRenewalStatus(customer.renewalStatus),
    last_renewed_at: customer.lastRenewedAt ?? null,
    notes: customer.notes ?? '',
    created_at: customer.createdAt,
    updated_at: customer.updatedAt,
  };
}

export function rowToContentPost(row: SupabaseContentPostRow): ContentPost {
  return {
    id: row.id,
    facebookLink: row.facebook_link ?? '',
    normalizedFacebookLink: row.facebook_normalized ?? '',
    websiteLink: row.website_link ?? '',
    normalizedWebsiteLink: row.website_normalized ?? '',
    note: row.title ?? '',
    posterId: row.poster_id?.trim() || 'poster-kawsar',
    posterName: row.poster_name?.trim() || 'Kawsar',
    createdAt: row.created_at,
  };
}

export function contentPostToSupabaseRow(post: ContentPost): SupabaseContentPostRow {
  const fbNorm = post.facebookLink
    ? post.normalizedFacebookLink || normalizePostUrl(post.facebookLink)
    : '';
  const webNorm = post.websiteLink
    ? post.normalizedWebsiteLink || normalizePostUrl(post.websiteLink)
    : '';
  const postedDate = parseDateToYmd(post.createdAt) ?? getLocalDateString();
  return {
    id: post.id,
    title: post.note ?? '',
    facebook_link: post.facebookLink ?? '',
    facebook_normalized: fbNorm,
    website_link: post.websiteLink ?? '',
    website_normalized: webNorm,
    poster_id: post.posterId,
    poster_name: post.posterName,
    posted_date: postedDate,
    created_at: post.createdAt,
  };
}

export function rowToDuplicateAttempt(row: SupabaseDuplicateAttemptRow): DuplicateAttempt {
  const collectorName = row.collector_name?.trim() || 'Unknown';
  return {
    id: row.id,
    collectorId: row.collector_id?.trim() || slugId('collector', collectorName) || 'collector-farhan',
    collectorName,
    attemptedName: row.attempted_name ?? '',
    attemptedPhone: row.attempted_phone ?? '',
    attemptedFacebook: row.attempted_fb ?? '',
    matchedBy: row.matched_by === 'facebook' ? 'facebook' : 'phone',
    existingCollectorName: row.existing_collector_name ?? '',
    existingDate: row.existing_date ?? '',
    timestamp: row.created_at,
  };
}

export function duplicateAttemptToSupabaseRow(
  attempt: DuplicateAttempt,
  existingLeadId = ''
): SupabaseDuplicateAttemptRow {
  const attemptDate = parseDateToYmd(attempt.timestamp) ?? getLocalDateString();
  return {
    id: attempt.id,
    attempted_phone: attempt.attemptedPhone ?? '',
    attempted_fb: attempt.attemptedFacebook ?? '',
    attempted_name: attempt.attemptedName ?? '',
    collector_id: attempt.collectorId,
    collector_name: attempt.collectorName,
    matched_by: attempt.matchedBy,
    existing_lead_id: existingLeadId,
    existing_collector_name: attempt.existingCollectorName ?? '',
    existing_date: attempt.existingDate ?? '',
    attempt_date: attemptDate,
    created_at: attempt.timestamp,
  };
}

export function rowToAuditLog(row: SupabaseAuditLogRow): AuditLog {
  return {
    id: row.id,
    actorId: row.actor_id?.trim() || slugId('user', row.actor_name) || 'admin-1',
    actorName: row.actor_name,
    actorRole: (row.actor_role as UserRole) || 'admin',
    action: row.action as AuditAction,
    details: row.details ?? '',
    timestamp: row.created_at,
  };
}

export function rowToSettings(row: SupabaseSettingsRow): AppSettings {
  return {
    autoAssignEnabled: row.auto_assign_enabled,
    roundRobinIndex: row.round_robin_index,
    disabledAgentIds: sanitizeDisabledAgentIds(row.disabled_agents),
    googleSheetsWebhookUrl:
      row.google_sheets_webhook_url || FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL,
    callScript: row.call_script || DEFAULT_CALL_SCRIPT,
    lastSyncedAt: row.last_synced_at,
  };
}

export async function fetchBootstrapFromSupabase(
  role: UserRole,
  todayYmd: string
): Promise<{
  ok: boolean;
  schemaMissing?: boolean;
  leads?: Lead[];
  callLogs?: CallLog[];
  contentPosts?: ContentPost[];
  paidCustomers?: PaidCustomer[];
  duplicateAttempts?: DuplicateAttempt[];
  auditLogs?: AuditLog[];
  settings?: AppSettings;
  settingsHasDisabledAgentsColumn?: boolean;
  error?: string;
}> {
  try {
    const isAdmin = role === 'admin';

    const leadsQuery = isAdmin
      ? supabase
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(2000)
      : supabase
          .from('leads')
          .select('*')
          .gte('collected_date', todayYmd)
          .order('created_at', { ascending: false })
          .limit(500);

    const callLogsQuery = isAdmin
      ? supabase
          .from('call_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(2000)
      : supabase
          .from('call_logs')
          .select('*')
          .eq('call_date', todayYmd)
          .order('created_at', { ascending: false })
          .limit(500);

    const postsQuery = isAdmin
      ? supabase
          .from('kawsar_posts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000)
      : supabase
          .from('kawsar_posts')
          .select('*')
          .eq('posted_date', todayYmd)
          .order('created_at', { ascending: false })
          .limit(300);

    const paidQuery =
      isAdmin || role === 'agent'
        ? supabase
            .from('paid_customers')
            .select('*')
            .order('renewal_date', { ascending: true })
            .limit(1000)
        : Promise.resolve({ data: [] as SupabasePaidCustomerRow[], error: null });

    const dupQuery = isAdmin
      ? supabase
          .from('duplicate_attempts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500)
      : supabase
          .from('duplicate_attempts')
          .select('*')
          .eq('attempt_date', todayYmd)
          .order('created_at', { ascending: false })
          .limit(200);

    const auditQuery = isAdmin
      ? supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [] as SupabaseAuditLogRow[], error: null });

    const settingsQuery = supabase
      .from('app_settings')
      .select('*')
      .eq('id', 'global')
      .maybeSingle();

    const [
      leadsRes,
      callLogsRes,
      postsRes,
      paidRes,
      dupRes,
      auditRes,
      settingsRes,
    ] = await Promise.all([
      leadsQuery,
      callLogsQuery,
      postsQuery,
      paidQuery,
      dupQuery,
      auditQuery,
      settingsQuery,
    ]);

    if (leadsRes.error) {
      return {
        ok: false,
        schemaMissing: isSchemaMissingError(leadsRes.error),
        error: leadsRes.error.message,
      };
    }

    return {
      ok: true,
      leads: ((leadsRes.data ?? []) as SupabaseLeadRow[]).map(rowToLead),
      callLogs: ((callLogsRes.data ?? []) as SupabaseCallLogRow[]).map(rowToCallLog),
      contentPosts: ((postsRes.data ?? []) as SupabaseContentPostRow[]).map(rowToContentPost),
      paidCustomers: ((paidRes.data ?? []) as SupabasePaidCustomerRow[]).map(
        rowToPaidCustomer
      ),
      duplicateAttempts: ((dupRes.data ?? []) as SupabaseDuplicateAttemptRow[]).map(
        rowToDuplicateAttempt
      ),
      auditLogs: ((auditRes.data ?? []) as SupabaseAuditLogRow[]).map(rowToAuditLog),
      settings: settingsRes.data
        ? rowToSettings(settingsRes.data as SupabaseSettingsRow)
        : undefined,
      settingsHasDisabledAgentsColumn: Boolean(
        settingsRes.data &&
          'disabled_agents' in (settingsRes.data as Record<string, unknown>) &&
          (settingsRes.data as Record<string, unknown>).disabled_agents !== undefined
      ),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Supabase connection error.',
    };
  }
}

export async function checkLeadDuplicateInSupabase(
  rawPhone: string,
  rawFacebookLink: string
): Promise<{
  ok: boolean;
  isDuplicate: boolean;
  matchedBy?: 'phone' | 'facebook';
  existingLead?: Lead;
  schemaMissing?: boolean;
  error?: string;
}> {
  try {
    const phoneNorm = normalizeBdPhone(rawPhone);
    if (phoneNorm) {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('phone_normalized', phoneNorm)
        .limit(1)
        .maybeSingle();

      if (error) {
        return {
          ok: false,
          isDuplicate: false,
          schemaMissing: isSchemaMissingError(error),
          error: error.message,
        };
      }
      if (data) {
        return {
          ok: true,
          isDuplicate: true,
          matchedBy: 'phone',
          existingLead: rowToLead(data as SupabaseLeadRow),
        };
      }
    }

    const fbNorm = normalizeFacebookUrl(rawFacebookLink);
    if (fbNorm) {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('facebook_normalized', fbNorm)
        .limit(1)
        .maybeSingle();

      if (error) {
        return {
          ok: false,
          isDuplicate: false,
          schemaMissing: isSchemaMissingError(error),
          error: error.message,
        };
      }
      if (data) {
        return {
          ok: true,
          isDuplicate: true,
          matchedBy: 'facebook',
          existingLead: rowToLead(data as SupabaseLeadRow),
        };
      }
    }

    return { ok: true, isDuplicate: false };
  } catch (err) {
    return {
      ok: false,
      isDuplicate: false,
      error: err instanceof Error ? err.message : 'Supabase duplicate check failed.',
    };
  }
}

export async function checkPostDuplicateInSupabase(
  rawFacebookLink: string,
  rawWebsiteLink: string
): Promise<{
  ok: boolean;
  isDuplicate: boolean;
  matchedField?: 'Facebook Link' | 'Website Link';
  existingPost?: ContentPost;
  schemaMissing?: boolean;
  error?: string;
}> {
  try {
    const fbNorm = rawFacebookLink.trim() ? normalizePostUrl(rawFacebookLink) : '';
    if (fbNorm) {
      const { data, error } = await supabase
        .from('kawsar_posts')
        .select('*')
        .eq('facebook_normalized', fbNorm)
        .limit(1)
        .maybeSingle();

      if (error) {
        return {
          ok: false,
          isDuplicate: false,
          schemaMissing: isSchemaMissingError(error),
          error: error.message,
        };
      }
      if (data) {
        return {
          ok: true,
          isDuplicate: true,
          matchedField: 'Facebook Link',
          existingPost: rowToContentPost(data as SupabaseContentPostRow),
        };
      }
    }

    const webNorm = rawWebsiteLink.trim() ? normalizePostUrl(rawWebsiteLink) : '';
    if (webNorm) {
      const { data, error } = await supabase
        .from('kawsar_posts')
        .select('*')
        .eq('website_normalized', webNorm)
        .limit(1)
        .maybeSingle();

      if (error) {
        return {
          ok: false,
          isDuplicate: false,
          schemaMissing: isSchemaMissingError(error),
          error: error.message,
        };
      }
      if (data) {
        return {
          ok: true,
          isDuplicate: true,
          matchedField: 'Website Link',
          existingPost: rowToContentPost(data as SupabaseContentPostRow),
        };
      }
    }

    return { ok: true, isDuplicate: false };
  } catch (err) {
    return {
      ok: false,
      isDuplicate: false,
      error: err instanceof Error ? err.message : 'Supabase post duplicate check failed.',
    };
  }
}

export async function createLeadInSupabase(
  lead: Lead,
  nextRoundRobinIndex: number
): Promise<{
  ok: boolean;
  isDuplicate?: boolean;
  matchedBy?: 'phone' | 'facebook';
  existingLead?: Lead;
  error?: string;
}> {
  const dup = await checkLeadDuplicateInSupabase(
    lead.phone || lead.rawPhone,
    lead.facebookLink
  );
  if (dup.ok && dup.isDuplicate && dup.existingLead) {
    return {
      ok: false,
      isDuplicate: true,
      matchedBy: dup.matchedBy ?? 'phone',
      existingLead: dup.existingLead,
    };
  }

  try {
    const row = leadToSupabaseRow(lead);
    const { error } = await supabase
      .from('leads')
      .upsert(row, { onConflict: 'id' });
    if (error) {
      return { ok: false, error: error.message };
    }

    await supabase
      .from('app_settings')
      .update({
        round_robin_index: Math.max(0, Math.floor(nextRoundRobinIndex)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'global');

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to save lead to Supabase.',
    };
  }
}

export async function importLeadsBatchInSupabase(
  leads: Lead[],
  nextRoundRobinIndex: number
): Promise<{ ok: boolean; error?: string }> {
  if (leads.length === 0) return { ok: true };
  try {
    const rows = leads.map(leadToSupabaseRow);
    const { error } = await supabase
      .from('leads')
      .upsert(rows, { onConflict: 'id' });
    if (error) return { ok: false, error: error.message };

    await supabase
      .from('app_settings')
      .update({
        round_robin_index: Math.max(0, Math.floor(nextRoundRobinIndex)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'global');

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to batch import leads to Supabase.',
    };
  }
}

export async function updateLeadInSupabase(
  lead: Lead,
  paidCustomer?: PaidCustomer
): Promise<void> {
  const row = leadToSupabaseRow(lead);
  await supabase.from('leads').upsert(row, { onConflict: 'id' });
  if (paidCustomer) {
    await upsertPaidCustomerInSupabase(paidCustomer, lead.facebookLink);
  }
}

export function resolveUpsertSupabaseCallLogRow(
  candidate: SupabaseCallLogRow,
  existingSameDayRows: SupabaseCallLogRow[]
): { rowToUpsert: SupabaseCallLogRow; duplicateIdsToDelete: string[] } {
  const candidateAgentName = (candidate.agent_name || '').trim().toLowerCase();
  const candidateAgentId = (candidate.agent_id || '').trim();
  const candidateLeadId = (candidate.lead_id || '').trim();
  const candidatePhoneCore = extractPhoneCoreKey(candidate.phone);

  const matching = existingSameDayRows
    .filter((row) => {
      if (row.call_date !== candidate.call_date) return false;
      const rowAgentName = (row.agent_name || '').trim().toLowerCase();
      const rowAgentId = (row.agent_id || '').trim();
      const sameAgent =
        (candidateAgentId && rowAgentId && candidateAgentId === rowAgentId) ||
        (candidateAgentName && rowAgentName && candidateAgentName === rowAgentName);
      if (!sameAgent) return false;

      if (candidateLeadId && row.lead_id && row.lead_id.trim() === candidateLeadId) {
        return true;
      }
      const rowPhoneCore = extractPhoneCoreKey(row.phone);
      return Boolean(candidatePhoneCore && rowPhoneCore && candidatePhoneCore === rowPhoneCore);
    })
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));

  if (matching.length === 0) {
    return { rowToUpsert: candidate, duplicateIdsToDelete: [] };
  }

  // Keep the primary (or candidate-id-matching) row, preserve original starting status, and clean any stale extras
  const exactIdMatch = matching.find((r) => r.id === candidate.id);
  const primary = exactIdMatch ?? matching[0];
  const earliest = matching[matching.length - 1];
  const duplicateIdsToDelete = matching
    .map((r) => r.id)
    .filter((id) => id !== primary.id);

  return {
    rowToUpsert: {
      ...candidate,
      id: primary.id,
      previous_status: sanitizeCallStatus(earliest.previous_status || candidate.previous_status),
    },
    duplicateIdsToDelete,
  };
}

export async function saveCallLogInSupabase(
  updatedLead: Lead,
  callLog: CallLog,
  paidCustomer?: PaidCustomer
): Promise<void> {
  const leadRow = leadToSupabaseRow(updatedLead);
  const candidateLogRow = callLogToSupabaseRow(callLog);

  let finalLogRow = candidateLogRow;
  let duplicateIdsToDelete: string[] = [];

  try {
    const { data: existingRows } = await supabase
      .from('call_logs')
      .select('*')
      .eq('call_date', candidateLogRow.call_date);

    if (Array.isArray(existingRows) && existingRows.length > 0) {
      const resolved = resolveUpsertSupabaseCallLogRow(
        candidateLogRow,
        existingRows as SupabaseCallLogRow[]
      );
      finalLogRow = resolved.rowToUpsert;
      duplicateIdsToDelete = resolved.duplicateIdsToDelete;
    }
  } catch {
    // Fall back to direct id upsert if lookup fails
  }

  const ops: Promise<unknown>[] = [
    Promise.resolve(supabase.from('leads').upsert(leadRow, { onConflict: 'id' })),
    Promise.resolve(supabase.from('call_logs').upsert(finalLogRow, { onConflict: 'id' })),
  ];

  if (duplicateIdsToDelete.length > 0) {
    ops.push(
      Promise.resolve(supabase.from('call_logs').delete().in('id', duplicateIdsToDelete))
    );
  }

  if (paidCustomer) {
    ops.push(upsertPaidCustomerInSupabase(paidCustomer, updatedLead.facebookLink));
  }

  await Promise.all(ops);
}

export async function createPostInSupabase(post: ContentPost): Promise<{
  ok: boolean;
  isDuplicate?: boolean;
  matchedField?: 'Facebook Link' | 'Website Link';
  existingPost?: ContentPost;
  error?: string;
}> {
  const dup = await checkPostDuplicateInSupabase(post.facebookLink, post.websiteLink);
  if (dup.ok && dup.isDuplicate && dup.existingPost) {
    return {
      ok: false,
      isDuplicate: true,
      matchedField: dup.matchedField ?? 'Facebook Link',
      existingPost: dup.existingPost,
    };
  }

  try {
    const row = contentPostToSupabaseRow(post);
    const { error } = await supabase
      .from('kawsar_posts')
      .upsert(row, { onConflict: 'id' });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to save post to Supabase.',
    };
  }
}

export async function upsertPaidCustomerInSupabase(
  customer: PaidCustomer,
  facebookLink = ''
): Promise<void> {
  const row = paidCustomerToSupabaseRow(customer, facebookLink);
  await supabase.from('paid_customers').upsert(row, { onConflict: 'id' });
}

export async function saveDuplicateAttemptInSupabase(
  attempt: DuplicateAttempt,
  existingLeadId = ''
): Promise<void> {
  const row = duplicateAttemptToSupabaseRow(attempt, existingLeadId);
  await supabase.from('duplicate_attempts').upsert(row, { onConflict: 'id' });
}

export async function saveAuditLogInSupabase(log: AuditLog): Promise<void> {
  await supabase.from('audit_logs').upsert(
    {
      id: log.id,
      actor_id: log.actorId,
      actor_name: log.actorName,
      actor_role: log.actorRole,
      action: log.action,
      details: log.details,
      created_at: log.timestamp,
    },
    { onConflict: 'id' }
  );
}

export async function fetchAppSettingsFromSupabase(): Promise<{
  settings: AppSettings;
  hasDisabledAgentsColumn: boolean;
} | null> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 'global')
      .maybeSingle();
    if (error || !data) return null;
    const row = data as SupabaseSettingsRow;
    return {
      settings: rowToSettings(row),
      hasDisabledAgentsColumn:
        'disabled_agents' in (row as unknown as Record<string, unknown>) &&
        row.disabled_agents !== undefined,
    };
  } catch {
    return null;
  }
}

export async function saveSettingsInSupabase(settings: AppSettings): Promise<void> {
  const payload = {
    id: 'global',
    auto_assign_enabled: Boolean(settings.autoAssignEnabled),
    round_robin_index: Math.max(0, Math.floor(Number(settings.roundRobinIndex) || 0)),
    disabled_agents: sanitizeDisabledAgentIds(settings.disabledAgentIds),
    google_sheets_webhook_url: settings.googleSheetsWebhookUrl,
    call_script: settings.callScript,
    last_synced_at: settings.lastSyncedAt,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('app_settings')
    .upsert(payload, { onConflict: 'id' });

  if (error && isMissingColumnError(error, 'disabled_agents')) {
    const { disabled_agents: _ignored, ...legacyPayload } = payload;
    await supabase.from('app_settings').upsert(legacyPayload, { onConflict: 'id' });
  }
}

export async function syncPulledRecordsToSupabase(payload: {
  leads?: Lead[];
  callLogs?: CallLog[];
  contentPosts?: ContentPost[];
  paidCustomers?: PaidCustomer[];
}): Promise<void> {
  const ops: Promise<unknown>[] = [];

  if (payload.leads && payload.leads.length > 0) {
    ops.push(
      Promise.resolve(
        supabase
          .from('leads')
          .upsert(payload.leads.map(leadToSupabaseRow), { onConflict: 'id' })
      )
    );
  }
  if (payload.callLogs && payload.callLogs.length > 0) {
    ops.push(
      Promise.resolve(
        supabase
          .from('call_logs')
          .upsert(payload.callLogs.map(callLogToSupabaseRow), { onConflict: 'id' })
      )
    );
  }
  if (payload.contentPosts && payload.contentPosts.length > 0) {
    ops.push(
      Promise.resolve(
        supabase
          .from('kawsar_posts')
          .upsert(payload.contentPosts.map(contentPostToSupabaseRow), { onConflict: 'id' })
      )
    );
  }
  if (payload.paidCustomers && payload.paidCustomers.length > 0) {
    ops.push(
      Promise.resolve(
        supabase
          .from('paid_customers')
          .upsert(
            payload.paidCustomers.map((c) => paidCustomerToSupabaseRow(c)),
            { onConflict: 'id' }
          )
      )
    );
  }

  await Promise.all(ops);
}
