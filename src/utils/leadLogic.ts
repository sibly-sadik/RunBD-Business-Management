import {
  AgentPerformanceMetric,
  CallLog,
  CollectorStat,
  ContentPost,
  CsvPreviewRow,
  DateRangeFilter,
  DuplicateAttempt,
  Lead,
  PaidCustomer,
  RenewalStatus,
  User,
} from '../types';

/**
 * Authenticates a user by case-insensitive username/email and exact case-sensitive password.
 */
export function authenticateUser(
  users: User[],
  rawUsername: string,
  password: string
): User | null {
  const normalizedUsername = rawUsername.trim().toLowerCase();
  if (!normalizedUsername || !password) return null;
  return (
    users.find(
      (u) => u.email.toLowerCase() === normalizedUsername && u.password === password
    ) ?? null
  );
}

/**
 * Normalizes Bangladeshi mobile numbers into canonical 11-digit format: 01XXXXXXXXX.
 * Strips spaces, dashes, parentheses, and country prefixes (+880, 880, 00880, +8800, leading 0).
 * Returns null if the input is not a valid Bangladeshi mobile number (01[3-9]XXXXXXXX).
 */
export function normalizeBdPhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');

  let normalized = digits;
  if (digits.startsWith('0088001') && digits.length === 16) {
    normalized = digits.slice(5); // 01XXXXXXXXX
  } else if (digits.startsWith('00880') && digits.length === 15) {
    normalized = digits.slice(4); // 01XXXXXXXXX
  } else if (digits.startsWith('0088') && digits.length === 14) {
    normalized = '0' + digits.slice(4); // 01XXXXXXXXX
  } else if (digits.startsWith('88001') && digits.length === 14) {
    normalized = digits.slice(3); // 01XXXXXXXXX
  } else if (digits.startsWith('880') && digits.length === 13) {
    normalized = digits.slice(2); // 01XXXXXXXXX
  } else if (digits.startsWith('88') && digits.length === 12) {
    normalized = '0' + digits.slice(2);
  } else if (digits.startsWith('1') && digits.length === 10) {
    normalized = '0' + digits;
  }

  if (/^01[3-9]\d{8}$/.test(normalized)) {
    return normalized;
  }
  return null;
}

/**
 * Strips spaces, punctuation, and BD country prefixes (+880, 880, 00880, leading 0)
 * to produce a 10-digit core comparison key (1XXXXXXXXX) for strict duplicate matching.
 */
export function extractPhoneCoreKey(raw: string): string {
  const canonical = normalizeBdPhone(raw);
  if (canonical) return canonical.slice(1); // 1XXXXXXXXX
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/^(00880|880|88)/, '').replace(/^0+/, '');
}

/**
 * Formats a normalized 01XXXXXXXXX phone number for display: +880 1712-345678
 */
export function formatBdPhoneDisplay(phone: string): string {
  const norm = normalizeBdPhone(phone);
  if (!norm) return phone;
  return `+880 ${norm.slice(1, 5)}-${norm.slice(5)}`;
}

/**
 * Builds a WhatsApp link (https://wa.me/8801XXXXXXXXX) for a Bangladeshi phone number.
 */
export function buildWhatsAppUrl(phone: string, customerName?: string): string {
  const norm = normalizeBdPhone(phone) ?? phone.replace(/\D/g, '');
  const international = norm.startsWith('0') ? `88${norm}` : norm;
  const text = customerName
    ? `?text=${encodeURIComponent(`Assalamu Alaikum ${customerName}, contacting you from RunBD regarding your inquiry.`)}`
    : '';
  return `https://wa.me/${international}${text}`;
}

/**
 * Builds a Click-to-Call tel: link.
 */
export function buildTelUrl(phone: string): string {
  const norm = normalizeBdPhone(phone) ?? phone.replace(/\D/g, '');
  const international = norm.startsWith('0') ? `+88${norm}` : `+${norm}`;
  return `tel:${international}`;
}

/**
 * Normalizes a Facebook profile or page URL for consistent duplicate comparison.
 * Strips protocol, www., m., mobile., trailing slashes, and tracking query parameters
 * (while preserving profile.php?id=...).
 */
export function normalizeFacebookUrl(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';

  let cleaned = trimmed
    .replace(/^https?:\/\//, '')
    .replace(/^(www\.|m\.|mobile\.|web\.|mbasic\.|touch\.)+/g, '')
    .replace(/^(fb\.com|fb\.me)\//, 'facebook.com/');

  if (cleaned.includes('profile.php')) {
    const match = cleaned.match(/id=(\d+)/);
    if (match) {
      return `facebook.com/profile.php?id=${match[1]}`;
    }
  }

  if (cleaned.includes('permalink.php') || cleaned.includes('story.php')) {
    const storyFbid = cleaned.match(/story_fbid=([^&#]+)/)?.[1];
    const pageId = cleaned.match(/(?:^|[?&])id=([^&#]+)/)?.[1];
    const pathPart = cleaned.split('?')[0].split('#')[0].replace(/\/+$/, '');
    const params: string[] = [];
    if (storyFbid) params.push(`story_fbid=${storyFbid}`);
    if (pageId) params.push(`id=${pageId}`);
    if (params.length > 0) {
      return `${pathPart}?${params.join('&')}`;
    }
  }

  cleaned = cleaned.split('?')[0].split('#')[0].replace(/\/+$/, '');
  return cleaned;
}

/**
 * Checks whether a lead already exists by normalized Phone Number OR normalized Facebook Link.
 */
export function findDuplicateLead(
  existingLeads: Lead[],
  rawPhone: string,
  facebookLink: string
): { lead: Lead; matchedBy: 'phone' | 'facebook' } | null {
  const corePhone = extractPhoneCoreKey(rawPhone);
  const normFb = normalizeFacebookUrl(facebookLink);

  for (const lead of existingLeads) {
    const existingCore = extractPhoneCoreKey(lead.phone || lead.rawPhone);
    if (corePhone && existingCore && corePhone === existingCore) {
      return { lead, matchedBy: 'phone' };
    }
    const existingFb = lead.normalizedFacebookLink || normalizeFacebookUrl(lead.facebookLink);
    if (normFb && existingFb && existingFb === normFb) {
      return { lead, matchedBy: 'facebook' };
    }
  }
  return null;
}

/**
 * Splits a single CSV line respecting quoted commas.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses bulk CSV text with columns (Name, Phone, Facebook_Link) and validates each row
 * against both existing leads and earlier rows in the same CSV file.
 */
export function parseCsvLeads(csvText: string, existingLeads: Lead[]): CsvPreviewRow[] {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  // Detect optional header row
  const firstCols = parseCsvLine(lines[0]).map((c) => c.toLowerCase());
  const hasHeader =
    firstCols[0]?.includes('name') ||
    firstCols[1]?.includes('phone') ||
    firstCols[2]?.includes('facebook');

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const seenPhones = new Set<string>();
  const seenFacebooks = new Set<string>();

  return dataLines.map((line, idx) => {
    const rowNumber = hasHeader ? idx + 2 : idx + 1;
    const cols = parseCsvLine(line);
    const customerName = (cols[0] ?? '').trim();
    const rawPhone = (cols[1] ?? '').trim();
    const facebookLink = (cols[2] ?? '').trim();
    const normalizedPhone = normalizeBdPhone(rawPhone);
    const normFb = normalizeFacebookUrl(facebookLink);

    if (!customerName) {
      return {
        rowNumber,
        customerName,
        rawPhone,
        normalizedPhone,
        facebookLink,
        status: 'invalid',
        reason: 'Missing customer name',
      };
    }

    if (!normalizedPhone) {
      return {
        rowNumber,
        customerName,
        rawPhone,
        normalizedPhone: null,
        facebookLink,
        status: 'invalid',
        reason: 'Invalid BD phone number (expected 01[3-9]XXXXXXXX)',
      };
    }

    const existingDup = findDuplicateLead(existingLeads, rawPhone, facebookLink);
    if (existingDup) {
      const addedDate = formatShortDate(existingDup.lead.createdAt);
      const agentLabel = existingDup.lead.assignedAgentName ?? 'Unassigned';
      return {
        rowNumber,
        customerName,
        rawPhone,
        normalizedPhone,
        facebookLink,
        status: 'duplicate',
        reason: `Duplicate (${existingDup.matchedBy === 'phone' ? 'Phone' : 'Facebook'}): ${existingDup.lead.customerName} · Agent: ${agentLabel} · Status: ${existingDup.lead.status} · Collector: ${existingDup.lead.collectorName} (${addedDate})`,
      };
    }

    if (seenPhones.has(normalizedPhone)) {
      return {
        rowNumber,
        customerName,
        rawPhone,
        normalizedPhone,
        facebookLink,
        status: 'duplicate',
        reason: 'Duplicate phone number within this CSV batch',
      };
    }

    if (normFb && seenFacebooks.has(normFb)) {
      return {
        rowNumber,
        customerName,
        rawPhone,
        normalizedPhone,
        facebookLink,
        status: 'duplicate',
        reason: 'Duplicate Facebook link within this CSV batch',
      };
    }

    seenPhones.add(normalizedPhone);
    if (normFb) seenFacebooks.add(normFb);

    return {
      rowNumber,
      customerName,
      rawPhone,
      normalizedPhone,
      facebookLink,
      status: 'valid',
    };
  });
}

/**
 * Distributes new leads equally among Call Center Agents using Round-Robin.
 * If autoAssignEnabled is false, leaves assignedAgentId/Name as null.
 */
export function assignLeadsRoundRobin(
  newLeads: Omit<Lead, 'assignedAgentId' | 'assignedAgentName'>[],
  agents: User[],
  startIndex: number,
  autoAssignEnabled: boolean
): { assignedLeads: Lead[]; nextIndex: number } {
  if (!autoAssignEnabled || agents.length === 0) {
    return {
      assignedLeads: newLeads.map((l) => ({
        ...l,
        assignedAgentId: null,
        assignedAgentName: null,
      })),
      nextIndex: startIndex,
    };
  }

  let pointer = ((startIndex % agents.length) + agents.length) % agents.length;
  const assignedLeads: Lead[] = newLeads.map((lead) => {
    const agent = agents[pointer];
    pointer = (pointer + 1) % agents.length;
    return {
      ...lead,
      assignedAgentId: agent.id,
      assignedAgentName: agent.name,
    };
  });

  return { assignedLeads, nextIndex: pointer };
}

export function getLocalDateString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Parses a YYYY-MM-DD date string into local midnight Date, or null if invalid.
 */
export function parseYmdLocal(ymd: string): Date | null {
  const match = String(ymd || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return dt;
}

/**
 * Normalizes a stored date/timestamp (bare YYYY-MM-DD, YYYY/MM/DD, ISO timestamp, or Date)
 * into a local YYYY-MM-DD calendar date string without UTC-midnight off-by-one shifts.
 * Returns null for empty or invalid values (never defaults to Today).
 */
export function parseDateToYmd(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : getLocalDateString(value);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/^'+/, '').trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parseYmdLocal(trimmed) ? trimmed : null;
  }

  const slashIso = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashIso) {
    const ymd = `${slashIso[1]}-${slashIso[2].padStart(2, '0')}-${slashIso[3].padStart(2, '0')}`;
    return parseYmdLocal(ymd) ? ymd : null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return getLocalDateString(parsed);
}

/**
 * Extracts a lead's actual stored collection date (YYYY-MM-DD) from collectedDate / date / createdAt.
 * Never falls back to updatedAt or current render time.
 */
export function getLeadCollectedYmd(
  lead: Partial<Pick<Lead, 'createdAt' | 'collectedDate' | 'date'>>
): string | null {
  return (
    parseDateToYmd(lead.collectedDate) ??
    parseDateToYmd(lead.date) ??
    parseDateToYmd(lead.createdAt)
  );
}

/**
 * Checks whether a lead's stored collection date equals Today's local YYYY-MM-DD date.
 */
export function isLeadCollectedToday(
  lead: Partial<Pick<Lead, 'createdAt' | 'collectedDate' | 'date'>>,
  now: Date = new Date()
): boolean {
  const ymd = getLeadCollectedYmd(lead);
  return ymd !== null && ymd === getLocalDateString(now);
}

/**
 * Checks if an ISO timestamp or bare YYYY-MM-DD falls within the active DateRangeFilter.
 */
export function isWithinDateRange(
  isoTimestamp: string,
  filter: DateRangeFilter,
  now: Date = new Date()
): boolean {
  if (filter.preset === 'all') return true;
  const trimmed = String(isoTimestamp ?? '').replace(/^'+/, '').trim();
  const bareLocal = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? parseYmdLocal(trimmed) : null;
  const date = bareLocal ?? new Date(trimmed);
  if (Number.isNaN(date.getTime())) return false;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (filter.preset === 'today') {
    return date >= startOfToday && date <= endOfToday;
  }

  if (filter.preset === 'week') {
    const weekAgo = new Date(startOfToday);
    weekAgo.setDate(weekAgo.getDate() - 6);
    return date >= weekAgo && date <= endOfToday;
  }

  if (filter.preset === 'month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return date >= monthStart && date <= endOfToday;
  }

  if (filter.preset === 'custom') {
    const start = filter.startDate ? new Date(`${filter.startDate}T00:00:00`) : new Date(0);
    const end = filter.endDate ? new Date(`${filter.endDate}T23:59:59.999`) : new Date(8640000000000000);
    return date >= start && date <= end;
  }

  return true;
}

/**
 * Checks if a follow-up ISO timestamp is scheduled for today.
 */
export function isFollowUpDueToday(followUpAt: string | null, now: Date = new Date()): boolean {
  if (!followUpAt) return false;
  const dt = new Date(followUpAt);
  if (Number.isNaN(dt.getTime())) return false;
  return (
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate()
  );
}

/**
 * Checks whether an ISO timestamp or YYYY-MM-DD date string falls on today's local date (YYYY-MM-DD).
 */
export function isTimestampToday(isoTimestamp: string, now: Date = new Date()): boolean {
  const ymd = parseDateToYmd(isoTimestamp);
  if (!ymd) return false;
  return ymd === getLocalDateString(now);
}

/**
 * Returns only leads collected today (YYYY-MM-DD local date).
 * Checks collectedDate / date / createdAt strictly (never updatedAt or render time).
 */
export function filterTodayLeads(leads: Lead[], now: Date = new Date()): Lead[] {
  const todayYmd = getLocalDateString(now);
  return leads.filter((l) => getLeadCollectedYmd(l) === todayYmd);
}

/**
 * Returns only call logs recorded today (YYYY-MM-DD local date).
 */
export function filterTodayCallLogs(logs: CallLog[], now: Date = new Date()): CallLog[] {
  return logs.filter((c) => isTimestampToday(c.timestamp, now));
}

/**
 * Returns only content posts submitted today (YYYY-MM-DD local date).
 */
export function filterTodayPosts(posts: ContentPost[], now: Date = new Date()): ContentPost[] {
  return posts.filter((p) => isTimestampToday(p.createdAt, now));
}

/**
 * Returns only duplicate attempts recorded today (YYYY-MM-DD local date).
 */
export function filterTodayDuplicateAttempts(
  attempts: DuplicateAttempt[],
  now: Date = new Date()
): DuplicateAttempt[] {
  return attempts.filter((d) => isTimestampToday(d.timestamp, now));
}

/**
 * Returns all leads assigned to an agent that have an active scheduled follow-up
 * (today, upcoming future dates, or pending overdue callbacks), sorted chronologically.
 */
export function getScheduledFollowUps(leads: Lead[], agentId: string): Lead[] {
  return leads
    .filter((l) => l.assignedAgentId === agentId && Boolean(l.followUpAt))
    .filter((l) => !Number.isNaN(new Date(l.followUpAt as string).getTime()))
    .sort(
      (a, b) =>
        new Date(a.followUpAt as string).getTime() - new Date(b.followUpAt as string).getTime()
    );
}

/**
 * Computes top-level Admin KPIs.
 */
export function computeDashboardMetrics(
  leads: Lead[],
  callLogs: CallLog[],
  filter: DateRangeFilter,
  now: Date = new Date()
) {
  const filteredLeads = leads.filter((l) => isWithinDateRange(l.createdAt, filter, now));
  const filteredCalls = callLogs.filter((c) => isWithinDateRange(c.timestamp, filter, now));
  const todayCalls = callLogs.filter((c) =>
    isWithinDateRange(c.timestamp, { preset: 'today', startDate: '', endDate: '' }, now)
  );

  const orderConfirmedCount = filteredLeads.filter((l) => l.status === 'Order Confirmed').length;
  const interestedCount = filteredLeads.filter((l) => l.status === 'Interested').length;
  const totalLeads = filteredLeads.length;
  const conversionRate =
    totalLeads > 0 ? Number(((orderConfirmedCount / totalLeads) * 100).toFixed(1)) : 0;

  return {
    totalLeads,
    totalCallsInRange: filteredCalls.length,
    callsMadeToday: todayCalls.length,
    orderConfirmedCount,
    interestedCount,
    conversionRate,
  };
}

/**
 * Computes per-agent performance leaderboard statistics.
 */
export function computeAgentPerformance(
  agents: User[],
  leads: Lead[],
  callLogs: CallLog[],
  filter: DateRangeFilter,
  now: Date = new Date()
): AgentPerformanceMetric[] {
  const filteredLeads = leads.filter((l) => isWithinDateRange(l.createdAt, filter, now));
  const filteredCalls = callLogs.filter((c) => isWithinDateRange(c.timestamp, filter, now));

  return agents
    .map((agent) => {
      const agentLeads = filteredLeads.filter((l) => l.assignedAgentId === agent.id);
      const agentCalls = filteredCalls.filter((c) => c.agentId === agent.id);
      const orderConfirmed = agentLeads.filter((l) => l.status === 'Order Confirmed').length;
      const interested = agentLeads.filter((l) => l.status === 'Interested').length;
      const conversions = orderConfirmed + interested;
      const denominator = Math.max(agentCalls.length, agentLeads.length);
      const successRate =
        denominator > 0 ? Number(((conversions / denominator) * 100).toFixed(1)) : 0;

      return {
        agentId: agent.id,
        agentName: agent.name,
        assignedLeads: agentLeads.length,
        totalCalls: agentCalls.length,
        orderConfirmed,
        interested,
        conversions,
        successRate,
      };
    })
    .sort((a, b) => b.conversions - a.conversions || b.totalCalls - a.totalCalls);
}

/**
 * Computes daily and total valid leads added by each Data Collector.
 */
export function computeCollectorStats(
  collectors: User[],
  leads: Lead[],
  duplicateAttempts: DuplicateAttempt[],
  now: Date = new Date()
): CollectorStat[] {
  const todayFilter: DateRangeFilter = { preset: 'today', startDate: '', endDate: '' };
  return collectors.map((collector) => {
    const collectorLeads = leads.filter((l) => l.collectorId === collector.id);
    const todayCount = collectorLeads.filter((l) =>
      isWithinDateRange(l.createdAt, todayFilter, now)
    ).length;
    const duplicateBlockedCount = duplicateAttempts.filter(
      (d) => d.collectorId === collector.id
    ).length;

    return {
      collectorId: collector.id,
      collectorName: collector.name,
      todayCount,
      totalCount: collectorLeads.length,
      duplicateBlockedCount,
    };
  });
}

/**
 * Formats an ISO date string into a readable short date, e.g., "Nov 17, 2026".
 */
export function formatShortDate(iso: string): string {
  const trimmed = String(iso ?? '').replace(/^'+/, '').trim();
  const bareLocal = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? parseYmdLocal(trimmed) : null;
  const dt = bareLocal ?? new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats an ISO date string into time, e.g., "02:30 PM".
 */
export function formatTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats an ISO date string into date + time.
 */
export function formatDateTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return `${formatShortDate(iso)}, ${formatTime(iso)}`;
}

/**
 * Generates an RFC-4180 CSV string for Admin database export.
 */
export function generateLeadsCsv(leads: Lead[]): string {
  const headers = [
    'Lead ID',
    'Customer Name',
    'Phone Number',
    'Facebook Link',
    'Collector',
    'Assigned Agent',
    'Call Status',
    'Follow-up At',
    'Latest Call Notes',
    'Created At',
  ];

  const escape = (val: string | null | undefined) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = leads.map((l) =>
    [
      l.id,
      l.customerName,
      l.phone,
      l.facebookLink,
      l.collectorName,
      l.assignedAgentName ?? 'Unassigned',
      l.status,
      l.followUpAt ? formatDateTime(l.followUpAt) : '',
      l.lastCallNotes || l.notes,
      formatDateTime(l.createdAt),
    ]
      .map(escape)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Generates an Excel-compatible (UTF-8 BOM) Daily Report CSV containing that day's
 * total calls made by each agent (Tanjin, Kathy, Tania, Shanaz, Sizon),
 * total successful orders, and follow-ups, plus a TOTAL summary row.
 */
export function generateDailyReportCsv(
  agents: User[],
  leads: Lead[],
  callLogs: CallLog[],
  reportDate: Date = new Date()
): string {
  const dateLabel = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(reportDate.getDate()).padStart(2, '0')}`;
  const todayFilter: DateRangeFilter = { preset: 'today', startDate: '', endDate: '' };

  const escape = (val: string | number) => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'Report Date',
    'Agent Name',
    'Calls Made Today',
    'Successful Orders (Order Confirmed)',
    'Interested',
    'Follow-ups Due Today',
    'Conversion Rate (%)',
  ];

  let totalCalls = 0;
  let totalOrders = 0;
  let totalInterested = 0;
  let totalFollowUps = 0;

  const agentRows = agents.map((agent) => {
    const todaysCalls = callLogs.filter(
      (c) => c.agentId === agent.id && isWithinDateRange(c.timestamp, todayFilter, reportDate)
    );
    const successfulOrders = todaysCalls.filter((c) => c.newStatus === 'Order Confirmed').length;
    const interested = todaysCalls.filter((c) => c.newStatus === 'Interested').length;
    const followUpsDue = leads.filter(
      (l) => l.assignedAgentId === agent.id && isFollowUpDueToday(l.followUpAt, reportDate)
    ).length;

    const conversionRate =
      todaysCalls.length > 0
        ? Number(((successfulOrders / todaysCalls.length) * 100).toFixed(1))
        : 0;

    totalCalls += todaysCalls.length;
    totalOrders += successfulOrders;
    totalInterested += interested;
    totalFollowUps += followUpsDue;

    return [
      dateLabel,
      agent.name,
      todaysCalls.length,
      successfulOrders,
      interested,
      followUpsDue,
      `${conversionRate}%`,
    ]
      .map(escape)
      .join(',');
  });

  const overallRate =
    totalCalls > 0 ? Number(((totalOrders / totalCalls) * 100).toFixed(1)) : 0;

  const totalRow = [
    dateLabel,
    'TOTAL',
    totalCalls,
    totalOrders,
    totalInterested,
    totalFollowUps,
    `${overallRate}%`,
  ]
    .map(escape)
    .join(',');

  return '\uFEFF' + [headers.join(','), ...agentRows, totalRow].join('\n');
}

const TRACKING_QUERY_PARAMS = new Set([
  'fbclid',
  'gclid',
  'ref',
  'refsrc',
  'rdid',
  'share_url',
  'sfnsn',
  '__tn__',
  'mibextid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
]);

function isTrackingQueryParam(key: string): boolean {
  return (
    TRACKING_QUERY_PARAMS.has(key) ||
    key.startsWith('utm_') ||
    key.startsWith('__cft__')
  );
}

/**
 * Normalizes any Facebook or Website URL for strict duplicate comparison:
 * strips protocol, www./m./mbasic., fb.me -> facebook.com, trailing slashes,
 * hash fragments, and tracking query parameters while keeping meaningful params.
 */
export function normalizePostUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProto);
    let host = parsed.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.|mbasic\.|touch\.)+/g, '');
    if (host === 'fb.me' || host === 'fb.com') {
      host = 'facebook.com';
    }
    const pathname = parsed.pathname.replace(/\/+$/, '').toLowerCase();

    const keptParams: Array<[string, string]> = [];
    parsed.searchParams.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!isTrackingQueryParam(lowerKey)) {
        keptParams.push([lowerKey, value]);
      }
    });
    keptParams.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    const queryStr =
      keptParams.length > 0
        ? `?${keptParams.map(([k, v]) => `${k}=${v}`).join('&')}`
        : '';

    return `${host}${pathname}${queryStr}`;
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^(www\.|m\.|mobile\.|mbasic\.|touch\.)+/g, '')
      .split('#')[0]
      .replace(/\/+$/, '');
  }
}

export function isValidPostUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProto);
    return parsed.hostname.includes('.') && parsed.hostname.length >= 4;
  } catch {
    return false;
  }
}

export function findDuplicatePost(
  posts: ContentPost[],
  rawFacebookUrl: string,
  rawWebsiteUrl: string
): { post: ContentPost; matchedField: 'Facebook Link' | 'Website Link' } | null {
  const targetFb = normalizePostUrl(rawFacebookUrl);
  const targetWeb = normalizePostUrl(rawWebsiteUrl);

  for (const post of posts) {
    const existingFb = post.normalizedFacebookLink || normalizePostUrl(post.facebookLink || '');
    const existingWeb = post.normalizedWebsiteLink || normalizePostUrl(post.websiteLink || '');

    if (targetFb && (targetFb === existingFb || targetFb === existingWeb)) {
      return { post, matchedField: 'Facebook Link' };
    }
    if (targetWeb && (targetWeb === existingWeb || targetWeb === existingFb)) {
      return { post, matchedField: 'Website Link' };
    }
  }

  return null;
}

export function computeKawsarPostStats(
  posts: ContentPost[],
  now: Date = new Date()
): {
  todayCount: number;
  todayFacebookCount: number;
  todayWebsiteCount: number;
  facebookCount: number;
  websiteCount: number;
  totalCount: number;
} {
  const todayFilter: DateRangeFilter = { preset: 'today', startDate: '', endDate: '' };
  let todayCount = 0;
  let todayFacebookCount = 0;
  let todayWebsiteCount = 0;
  let facebookCount = 0;
  let websiteCount = 0;

  for (const post of posts) {
    const isToday = isWithinDateRange(post.createdAt, todayFilter, now);
    const hasFb = Boolean(post.facebookLink && post.facebookLink.trim());
    const hasWeb = Boolean(post.websiteLink && post.websiteLink.trim());

    if (isToday) {
      todayCount++;
      if (hasFb) todayFacebookCount++;
      if (hasWeb) todayWebsiteCount++;
    }
    if (hasFb) {
      facebookCount++;
    }
    if (hasWeb) {
      websiteCount++;
    }
  }

  return {
    todayCount,
    todayFacebookCount,
    todayWebsiteCount,
    facebookCount,
    websiteCount,
    totalCount: posts.length,
  };
}

export interface FinalDailyAgentRow {
  agentId: string;
  agentName: string;
  assignedLeads: number;
  callsMade: number;
  orderConfirmed: number;
  interested: number;
  followUp: number;
  noResponse: number;
  cancelled: number;
  pending: number;
}

export interface FinalDailyCollectorRow {
  collectorId: string;
  collectorName: string;
  leadsCollectedOnDate: number;
  totalLeadsAllTime: number;
}

export interface FinalDailySummary {
  date: string; // YYYY-MM-DD
  agents: FinalDailyAgentRow[];
  agentTotals: {
    assignedLeads: number;
    callsMade: number;
    orderConfirmed: number;
    interested: number;
    followUp: number;
    noResponse: number;
    cancelled: number;
    pending: number;
  };
  collectors: FinalDailyCollectorRow[];
  totalCollectedOnDate: number;
  kawsar: {
    entriesCount: number;
    facebookLinks: number;
    websiteLinks: number;
  };
}

function isIsoOnLocalDate(iso: string, targetDateStr: string): boolean {
  return parseDateToYmd(iso) === targetDateStr;
}

export function computeFinalDailySummary(
  agents: User[],
  collectors: User[],
  leads: Lead[],
  callLogs: CallLog[],
  contentPosts: ContentPost[],
  dateStr: string = getLocalDateString()
): FinalDailySummary {
  const agentRows: FinalDailyAgentRow[] = agents.map((agent) => {
    const agentLeads = leads.filter((l) => l.assignedAgentId === agent.id);
    const dateCalls = callLogs.filter(
      (c) => c.agentId === agent.id && isIsoOnLocalDate(c.timestamp, dateStr)
    );
    const confirmedOnDate = dateCalls.filter((c) => c.newStatus === 'Order Confirmed').length;

    const interested = agentLeads.filter((l) => l.status === 'Interested').length;
    const followUp = agentLeads.filter((l) => l.status === 'Busy / Call Later').length;
    const noResponse = agentLeads.filter((l) => l.status === 'Switched Off / No Answer').length;
    const cancelled = agentLeads.filter(
      (l) => l.status === 'Not Interested' || l.status === 'Wrong Number'
    ).length;
    const pending = agentLeads.filter((l) => l.status === 'Pending').length;

    return {
      agentId: agent.id,
      agentName: agent.name,
      assignedLeads: agentLeads.length,
      callsMade: dateCalls.length,
      orderConfirmed: confirmedOnDate,
      interested,
      followUp,
      noResponse,
      cancelled,
      pending,
    };
  });

  const agentTotals = agentRows.reduce(
    (acc, row) => ({
      assignedLeads: acc.assignedLeads + row.assignedLeads,
      callsMade: acc.callsMade + row.callsMade,
      orderConfirmed: acc.orderConfirmed + row.orderConfirmed,
      interested: acc.interested + row.interested,
      followUp: acc.followUp + row.followUp,
      noResponse: acc.noResponse + row.noResponse,
      cancelled: acc.cancelled + row.cancelled,
      pending: acc.pending + row.pending,
    }),
    {
      assignedLeads: 0,
      callsMade: 0,
      orderConfirmed: 0,
      interested: 0,
      followUp: 0,
      noResponse: 0,
      cancelled: 0,
      pending: 0,
    }
  );

  const collectorRows: FinalDailyCollectorRow[] = collectors.map((collector) => {
    const allMine = leads.filter((l) => l.collectorId === collector.id);
    const onDate = allMine.filter((l) => isIsoOnLocalDate(l.createdAt, dateStr)).length;
    return {
      collectorId: collector.id,
      collectorName: collector.name,
      leadsCollectedOnDate: onDate,
      totalLeadsAllTime: allMine.length,
    };
  });

  const totalCollectedOnDate = collectorRows.reduce(
    (sum, c) => sum + c.leadsCollectedOnDate,
    0
  );

  const datePosts = contentPosts.filter((p) => isIsoOnLocalDate(p.createdAt, dateStr));
  const facebookLinks = datePosts.filter((p) => p.facebookLink && p.facebookLink.trim()).length;
  const websiteLinks = datePosts.filter((p) => p.websiteLink && p.websiteLink.trim()).length;

  return {
    date: dateStr,
    agents: agentRows,
    agentTotals,
    collectors: collectorRows,
    totalCollectedOnDate,
    kawsar: {
      entriesCount: datePosts.length,
      facebookLinks,
      websiteLinks,
    },
  };
}

export function generateFinalDailySummaryCsv(summary: FinalDailySummary): string {
  const escape = (val: string | number) => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [];

  lines.push(['RunBD Final Daily Summary', `Date: ${summary.date}`].map(escape).join(','));
  lines.push('');

  // Section 1: Call Center Agents
  lines.push('CALL CENTER AGENTS PERFORMANCE');
  lines.push(
    [
      'Agent Name',
      'Assigned Leads',
      'Calls Made',
      'Order Confirmed',
      'Interested',
      'Follow-up',
      'No Response',
      'Cancelled / Wrong No',
      'Pending',
    ]
      .map(escape)
      .join(',')
  );

  for (const a of summary.agents) {
    lines.push(
      [
        a.agentName,
        a.assignedLeads,
        a.callsMade,
        a.orderConfirmed,
        a.interested,
        a.followUp,
        a.noResponse,
        a.cancelled,
        a.pending,
      ]
        .map(escape)
        .join(',')
    );
  }

  lines.push(
    [
      'TOTAL',
      summary.agentTotals.assignedLeads,
      summary.agentTotals.callsMade,
      summary.agentTotals.orderConfirmed,
      summary.agentTotals.interested,
      summary.agentTotals.followUp,
      summary.agentTotals.noResponse,
      summary.agentTotals.cancelled,
      summary.agentTotals.pending,
    ]
      .map(escape)
      .join(',')
  );

  lines.push('');

  // Section 2: Data Collectors
  lines.push('DATA COLLECTORS HISTORY');
  lines.push(
    ['Collector Name', `Leads Collected (${summary.date})`, 'Total Leads (All Time)']
      .map(escape)
      .join(',')
  );
  for (const c of summary.collectors) {
    lines.push(
      [c.collectorName, c.leadsCollectedOnDate, c.totalLeadsAllTime].map(escape).join(',')
    );
  }
  lines.push(
    [
      'TOTAL',
      summary.totalCollectedOnDate,
      summary.collectors.reduce((sum, c) => sum + c.totalLeadsAllTime, 0),
    ]
      .map(escape)
      .join(',')
  );

  lines.push('');

  // Section 3: Content & Link Poster (Kawsar)
  lines.push('CONTENT & LINK POSTER (KAWSAR)');
  lines.push(
    ['Poster Name', `Total Entries (${summary.date})`, 'Facebook Post Links', 'Website Post Links']
      .map(escape)
      .join(',')
  );
  lines.push(
    [
      'Kawsar',
      summary.kawsar.entriesCount,
      summary.kawsar.facebookLinks,
      summary.kawsar.websiteLinks,
    ]
      .map(escape)
      .join(',')
  );

  return '\uFEFF' + lines.join('\n');
}

// ============================================================================
// Paid Customers & 1-Month Renewal Tracking Logic
// ============================================================================

// Paid Customers helpers continue below (parseYmdLocal defined above)

/**
 * Adds a whole number of calendar days to a YYYY-MM-DD date string and returns YYYY-MM-DD.
 */
export function addDaysToYmd(ymd: string, days: number): string {
  const base = parseYmdLocal(ymd) ?? new Date();
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 0, 0, 0, 0);
  return getLocalDateString(next);
}

/**
 * Normalizes any ISO timestamp, Date, or YYYY-MM-DD string into YYYY-MM-DD (local date).
 */
export function toYmdString(value: string | Date | null | undefined, fallbackNow: Date = new Date()): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? getLocalDateString(fallbackNow) : getLocalDateString(value);
  }
  const str = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  if (str) {
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return getLocalDateString(parsed);
    }
  }
  return getLocalDateString(fallbackNow);
}

/**
 * Computes whole calendar days remaining until renewalDate (YYYY-MM-DD) relative to `now`.
 * Returns 0 if renewalDate is today, positive integer if upcoming, negative if past.
 */
export function computeDaysRemaining(renewalDateYmd: string, now: Date = new Date()): number {
  const renewalDt = parseYmdLocal(toYmdString(renewalDateYmd, now));
  if (!renewalDt) return 0;
  const todayDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const diffMs = renewalDt.getTime() - todayDt.getTime();
  return Math.round(diffMs / 86400000);
}

/**
 * Computes effective RenewalStatus: returns 'Expired' if stored status is 'Expired'
 * or if the renewal date has passed (daysRemaining < 0); otherwise returns stored status ('Active' | 'Renewed').
 */
export function computeEffectiveRenewalStatus(
  customer: Pick<PaidCustomer, 'renewalDate' | 'renewalStatus'>,
  now: Date = new Date()
): RenewalStatus {
  if (customer.renewalStatus === 'Expired') return 'Expired';
  const daysRemaining = computeDaysRemaining(customer.renewalDate, now);
  if (daysRemaining < 0) return 'Expired';
  return customer.renewalStatus === 'Renewed' ? 'Renewed' : 'Active';
}

/**
 * Creates a deterministic PaidCustomer record from an Order Confirmed Lead,
 * setting Confirmed Date = Today (YYYY-MM-DD) and Renewal Date = Confirmed Date + 30 days.
 */
export function createPaidCustomerFromLead(
  lead: Lead,
  now: Date = new Date()
): PaidCustomer {
  const confirmedDate = getLocalDateString(now);
  const renewalDate = addDaysToYmd(confirmedDate, 30);
  const nowIso = now.toISOString();
  const safeId = /^[a-zA-Z0-9_-]{1,120}$/.test(lead.id)
    ? `PC-${lead.id}`.slice(0, 128)
    : `PC-${Date.now().toString(36).toUpperCase()}`;

  return {
    id: safeId,
    leadId: lead.id,
    customerName: lead.customerName,
    phone: normalizeBdPhone(lead.phone || lead.rawPhone) || lead.phone || lead.rawPhone,
    assignedAgentId: lead.assignedAgentId,
    assignedAgentName: lead.assignedAgentName,
    confirmedDate,
    renewalDate,
    renewalStatus: 'Active',
    lastRenewedAt: null,
    notes: lead.lastCallNotes || lead.notes || '',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Marks a PaidCustomer as Renewed (+1 Month / +30 days) and clears any 2-day renewal alert.
 * Extends from the current renewalDate when not yet expired, or from today when expired.
 */
export function renewPaidCustomer(
  customer: PaidCustomer,
  now: Date = new Date()
): PaidCustomer {
  const todayYmd = getLocalDateString(now);
  const currentRenewalYmd = toYmdString(customer.renewalDate, now);
  const baseYmd = currentRenewalYmd >= todayYmd ? currentRenewalYmd : todayYmd;
  const nextRenewalDate = addDaysToYmd(baseYmd, 30);
  const nowIso = now.toISOString();

  return {
    ...customer,
    renewalDate: nextRenewalDate,
    renewalStatus: 'Renewed',
    lastRenewedAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Returns Paid Customers whose Renewal Date is 2 days away or less (0 <= daysRemaining <= 2)
 * and whose status is Active / Renewed (not Expired), sorted soonest first.
 */
export interface DueRenewalItem {
  customer: PaidCustomer;
  daysRemaining: number;
  effectiveStatus: RenewalStatus;
}

export function getDueRenewalCustomers(
  customers: PaidCustomer[],
  now: Date = new Date(),
  agentIdFilter?: string | null
): DueRenewalItem[] {
  const items: DueRenewalItem[] = [];
  for (const customer of customers) {
    if (agentIdFilter && customer.assignedAgentId !== agentIdFilter) continue;
    const daysRemaining = computeDaysRemaining(customer.renewalDate, now);
    const effectiveStatus = computeEffectiveRenewalStatus(customer, now);
    if (effectiveStatus !== 'Expired' && daysRemaining <= 2) {
      items.push({ customer, daysRemaining, effectiveStatus });
    }
  }
  return items.sort(
    (a, b) =>
      a.daysRemaining - b.daysRemaining ||
      a.customer.customerName.localeCompare(b.customer.customerName)
  );
}

/**
 * Generates an Excel-compatible (UTF-8 BOM) CSV export of Paid Customers & Renewals.
 */
export function generatePaidCustomersCsv(
  customers: PaidCustomer[],
  now: Date = new Date()
): string {
  const headers = [
    'Customer ID',
    'Lead ID',
    'Customer Name',
    'Phone',
    'Assigned Agent',
    'Confirmed Date',
    'Renewal Date',
    'Days Remaining',
    'Renewal Status',
  ];

  const escape = (val: string | number | null | undefined) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = customers.map((c) => {
    const daysRemaining = computeDaysRemaining(c.renewalDate, now);
    const effectiveStatus = computeEffectiveRenewalStatus(c, now);
    return [
      c.id,
      c.leadId,
      c.customerName,
      c.phone,
      c.assignedAgentName ?? 'Unassigned',
      c.confirmedDate,
      c.renewalDate,
      daysRemaining,
      effectiveStatus,
    ]
      .map(escape)
      .join(',');
  });

  return '\uFEFF' + [headers.join(','), ...rows].join('\n');
}


