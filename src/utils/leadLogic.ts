import {
  AgentPerformanceMetric,
  CallLog,
  CallStatus,
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
 * Returns the clean copyable phone string (01XXXXXXXXX for BD mobile numbers).
 */
export function getCopyablePhoneNumber(rawPhone: string): string {
  const norm = normalizeBdPhone(rawPhone);
  if (norm) return norm;
  const trimmed = String(rawPhone ?? '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('8801') && digits.length === 13) {
    return `0${digits.slice(2)}`;
  }
  return trimmed;
}

/**
 * Normalizes and validates an external HTTP(S) URL (blocks javascript:/data: schemes).
 */
export function buildSafeExternalUrl(rawUrl: string | null | undefined): string | null {
  const trimmed = String(rawUrl ?? '').trim();
  if (!trimmed) return null;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProto);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export const WHATSAPP_WINDOW_NAME = 'runbd_whatsapp_tab';

export interface WhatsAppWindowTarget {
  focus?: () => void;
}

export interface WhatsAppAnchorElement {
  href: string;
  target: string;
  rel?: string;
  style?: { display?: string };
  click: () => void;
  remove?: () => void;
}

export interface WhatsAppDocumentLike {
  createElement: (tag: 'a') => WhatsAppAnchorElement;
  body?: {
    appendChild: (node: WhatsAppAnchorElement) => void;
    removeChild?: (node: WhatsAppAnchorElement) => void;
  } | null;
}

export interface OpenWhatsAppOptions {
  /** Optional window-like object for unit testing */
  win?: {
    open: (url: string, target?: string, features?: string) => WhatsAppWindowTarget | null;
  };
  /** Optional document-like object for popup-blocker fallback testing */
  doc?: WhatsAppDocumentLike;
  /** Optional callback when popup was blocked and anchor fallback ran */
  onPopupBlocked?: () => void;
}

/**
 * Normalizes a Bangladeshi phone number to WhatsApp international digits: 8801XXXXXXXXX.
 */
export function normalizeWhatsAppPhone(phone: string): string {
  const norm = normalizeBdPhone(phone);
  if (norm) {
    return `88${norm}`;
  }
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0') && digits.length >= 10) return `88${digits}`;
  return digits;
}

/**
 * Builds a direct WhatsApp Web URL (https://web.whatsapp.com/send?phone=8801XXXXXXXXX)
 * without intermediate wa.me redirect hops for fast chat loading.
 */
export function buildWhatsAppUrl(phone: string): string {
  const international = normalizeWhatsAppPhone(phone);
  if (!international) return 'https://web.whatsapp.com/';
  return `https://web.whatsapp.com/send?phone=${international}`;
}

/**
 * Opens or reuses a single dedicated WhatsApp Web tab ('runbd_whatsapp_tab')
 * and focuses it, with a safe fallback if popups are blocked.
 */
export function openWhatsAppChat(
  phone: string,
  options?: OpenWhatsAppOptions
): { url: string; opened: boolean; fallbackUsed: boolean } {
  const url = buildWhatsAppUrl(phone);
  const win = options?.win ?? (typeof window !== 'undefined' ? window : undefined);
  const doc: WhatsAppDocumentLike | undefined =
    options?.doc ??
    (typeof document !== 'undefined'
      ? (document as unknown as WhatsAppDocumentLike)
      : undefined);

  if (!win) {
    return { url, opened: false, fallbackUsed: false };
  }

  let targetWin: WhatsAppWindowTarget | null = null;
  try {
    // Omit noopener/noreferrer so the browser keeps the named context and reuses
    // the exact same 'runbd_whatsapp_tab' tab on every subsequent click.
    targetWin = win.open(url, WHATSAPP_WINDOW_NAME);
  } catch {
    targetWin = null;
  }

  if (targetWin) {
    try {
      targetWin.focus?.();
    } catch {
      // Cross-origin focus may be restricted by browser policies; ignore safely.
    }
    return { url, opened: true, fallbackUsed: false };
  }

  // Safe fallback if browser popup blocker prevented window.open
  options?.onPopupBlocked?.();
  if (doc) {
    try {
      const link = doc.createElement('a');
      link.href = url;
      link.target = WHATSAPP_WINDOW_NAME;
      if (link.style) {
        link.style.display = 'none';
      }
      doc.body?.appendChild(link);
      link.click();
      if (typeof link.remove === 'function') {
        link.remove();
      } else {
        doc.body?.removeChild?.(link);
      }
      return { url, opened: false, fallbackUsed: true };
    } catch {
      return { url, opened: false, fallbackUsed: false };
    }
  }

  return { url, opened: false, fallbackUsed: false };
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
 * Normalizes vehicle category names (including the common "Track" -> "Truck" typo
 * and case/spacing variations) while preserving non-vehicle customer names for
 * backward compatibility with older records.
 */
export function normalizeVehicleType(raw: string | null | undefined): string {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) return '';

  const key = cleaned.toLowerCase();
  if (key === 'car' || key === 'cars') return 'Car';
  if (key === 'bike' || key === 'bikes' || key === 'motorbike' || key === 'motorcycle') {
    return 'Bike';
  }
  if (key === 'truck' || key === 'trucks' || key === 'track' || key === 'tracks' || key === 'trak') {
    return 'Truck';
  }
  if (key === 'bus' || key === 'buses') return 'Bus';
  if (
    key === 'pickup truck' ||
    key === 'pick up truck' ||
    key === 'pickup-truck' ||
    key === 'pickup' ||
    key === 'pick up' ||
    key === 'pick-up' ||
    key === 'pickup track' ||
    key === 'pickuptrack'
  ) {
    return 'Pickup Truck';
  }

  return cleaned;
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
    firstCols[0]?.includes('vehicle') ||
    firstCols[1]?.includes('phone') ||
    firstCols[2]?.includes('facebook');

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const seenPhones = new Set<string>();
  const seenFacebooks = new Set<string>();

  return dataLines.map((line, idx) => {
    const rowNumber = hasHeader ? idx + 2 : idx + 1;
    const cols = parseCsvLine(line);
    const customerName = normalizeVehicleType(cols[0] ?? '');
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
        reason: 'Missing vehicle type / customer name',
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
 * Returns only Call Center Agents that are currently active (not in disabledAgentIds).
 */
export function getActiveAgents(
  agents: User[],
  disabledAgentIds: readonly string[] = []
): User[] {
  if (!disabledAgentIds || disabledAgentIds.length === 0) return agents;
  const disabledSet = new Set(disabledAgentIds);
  return agents.filter((agent) => !disabledSet.has(agent.id));
}

/**
 * Resolves the next active agent in the Round-Robin queue.
 */
export function getNextRoundRobinAgent(
  agents: User[],
  roundRobinIndex: number,
  disabledAgentIds: readonly string[] = []
): User | null {
  const activeAgents = getActiveAgents(agents, disabledAgentIds);
  if (activeAgents.length === 0) return null;
  const normalizedIdx =
    ((roundRobinIndex % activeAgents.length) + activeAgents.length) %
    activeAgents.length;
  return activeAgents[normalizedIdx] ?? null;
}

/**
 * Distributes new leads equally among active Call Center Agents using Round-Robin.
 * Skips any agent whose id is listed in disabledAgentIds.
 * If autoAssignEnabled is false or no active agents remain, leaves assignedAgentId/Name as null.
 */
export function assignLeadsRoundRobin(
  newLeads: Omit<Lead, 'assignedAgentId' | 'assignedAgentName'>[],
  agents: User[],
  startIndex: number,
  autoAssignEnabled: boolean,
  disabledAgentIds: readonly string[] = []
): { assignedLeads: Lead[]; nextIndex: number } {
  const activeAgents = getActiveAgents(agents, disabledAgentIds);
  if (!autoAssignEnabled || activeAgents.length === 0) {
    return {
      assignedLeads: newLeads.map((l) => ({
        ...l,
        assignedAgentId: null,
        assignedAgentName: null,
      })),
      nextIndex: startIndex,
    };
  }

  let pointer = ((startIndex % activeAgents.length) + activeAgents.length) % activeAgents.length;
  const assignedLeads: Lead[] = newLeads.map((lead) => {
    const agent = activeAgents[pointer];
    pointer = (pointer + 1) % activeAgents.length;
    return {
      ...lead,
      assignedAgentId: agent.id,
      assignedAgentName: agent.name,
    };
  });

  return { assignedLeads, nextIndex: pointer };
}

export const DHAKA_TIME_ZONE = 'Asia/Dhaka';

const DHAKA_YMD_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: DHAKA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DHAKA_HHMM_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: DHAKA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

let serverClockOffsetMs: number | null = null;

/**
 * Records an authoritative HTTP `Date` header offset (serverMs - clientMs)
 * so the browser can detect a misconfigured device clock set ahead of Asia/Dhaka.
 */
export function recordServerClockHeader(dateHeader: string | null | undefined): void {
  if (!dateHeader) return;
  const parsedMs = Date.parse(dateHeader);
  if (!Number.isFinite(parsedMs)) return;
  serverClockOffsetMs = parsedMs - Date.now();
}

export function getEstimatedServerNow(clientNowMs: number = Date.now()): Date | null {
  if (serverClockOffsetMs === null) return null;
  return new Date(clientNowMs + serverClockOffsetMs);
}

/**
 * Formats a Date into an explicit `Asia/Dhaka` (UTC+6) `YYYY-MM-DD` calendar string.
 */
export function getDhakaDateString(date: Date = new Date()): string {
  const target = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = DHAKA_YMD_FORMATTER.formatToParts(target);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }
  const formatted = DHAKA_YMD_FORMATTER.format(target);
  if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
    return formatted;
  }
  const shifted = new Date(target.getTime() + 6 * 3600 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

export function getAuthoritativeDhakaTodayYmd(): string {
  const serverNow = getEstimatedServerNow();
  return getDhakaDateString(serverNow ?? new Date());
}

/**
 * Returns the device's own local calendar date (YYYY-MM-DD) for clock-skew detection.
 */
export function getDeviceLocalDateString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Canonical RunBD date string helper (strictly Asia/Dhaka UTC+6).
 */
export function getLocalDateString(date: Date = new Date()): string {
  return getDhakaDateString(date);
}

/**
 * Validates and extracts numeric calendar parts from a bare `YYYY-MM-DD` string.
 */
export function parseYmdParts(
  ymd: string
): { year: number; month: number; day: number } | null {
  const match = String(ymd || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * Parses a YYYY-MM-DD date string into a local-midnight Date, or null if invalid.
 */
export function parseYmdLocal(ymd: string): Date | null {
  const parts = parseYmdParts(ymd);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
}

/**
 * Normalizes a stored date/timestamp (bare YYYY-MM-DD, YYYY/MM/DD, ISO timestamp, or Date)
 * into an Asia/Dhaka `YYYY-MM-DD` calendar date string without double-shifting bare YYYY-MM-DD values.
 * Returns null for empty or invalid values (never defaults to Today).
 */
export function parseDateToYmd(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : getDhakaDateString(value);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/^'+/, '').trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parseYmdParts(trimmed) ? trimmed : null;
  }

  const slashIso = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashIso) {
    const ymd = `${slashIso[1]}-${slashIso[2].padStart(2, '0')}-${slashIso[3].padStart(2, '0')}`;
    return parseYmdParts(ymd) ? ymd : null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return getDhakaDateString(parsed);
}

/**
 * Clamps any candidate date/timestamp so it never exceeds `authoritativeDhakaTodayYmd`
 * (preventing future `collected_date` values caused by ahead device clocks).
 */
export function clampDateToDhakaToday(
  candidate: string | Date | null | undefined,
  authoritativeDhakaTodayYmd: string = getAuthoritativeDhakaTodayYmd()
): { ymd: string; wasClamped: boolean; originalYmd: string | null } {
  const originalYmd = parseDateToYmd(candidate);
  if (!originalYmd) {
    return { ymd: authoritativeDhakaTodayYmd, wasClamped: false, originalYmd: null };
  }
  if (originalYmd > authoritativeDhakaTodayYmd) {
    return {
      ymd: authoritativeDhakaTodayYmd,
      wasClamped: true,
      originalYmd,
    };
  }
  return { ymd: originalYmd, wasClamped: false, originalYmd };
}

/**
 * Detects whether the collector's device clock or local calendar is ahead of Asia/Dhaka today.
 */
export function detectDeviceClockAhead(
  deviceNow: Date = new Date(),
  serverNow: Date | null = getEstimatedServerNow()
): { isAhead: boolean; deviceYmd: string; dhakaTodayYmd: string } {
  const deviceDhakaYmd = getDhakaDateString(deviceNow);
  const deviceLocalYmd = getDeviceLocalDateString(deviceNow);
  const serverDhakaYmd =
    serverNow && !Number.isNaN(serverNow.getTime())
      ? getDhakaDateString(serverNow)
      : null;
  const dhakaTodayYmd = serverDhakaYmd ?? deviceDhakaYmd;

  if (serverDhakaYmd && deviceDhakaYmd > serverDhakaYmd) {
    return { isAhead: true, deviceYmd: deviceDhakaYmd, dhakaTodayYmd };
  }
  if (deviceLocalYmd > dhakaTodayYmd) {
    return { isAhead: true, deviceYmd: deviceLocalYmd, dhakaTodayYmd };
  }
  return { isAhead: false, deviceYmd: deviceLocalYmd, dhakaTodayYmd };
}

/**
 * Extracts `YYYY-MM-DD` and `HH:mm` values in Asia/Dhaka for the Call Log follow-up modal.
 */
export function getDhakaFollowUpFields(
  followUpAt: string | null | undefined,
  now: Date = new Date()
): { date: string; time: string } {
  if (followUpAt) {
    const dt = new Date(followUpAt);
    if (!Number.isNaN(dt.getTime())) {
      const ymd = getDhakaDateString(dt);
      const hhmm = DHAKA_HHMM_FORMATTER.format(dt);
      return {
        date: ymd,
        time: /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : '16:00',
      };
    }
  }
  return {
    date: getDhakaDateString(now),
    time: '16:00',
  };
}

/**
 * Converts a YYYY-MM-DD + HH:mm pair entered in Dhaka (+06:00) into an ISO timestamp.
 */
export function buildDhakaFollowUpIso(ymd: string, time: string): string | null {
  if (!parseYmdParts(ymd)) return null;
  const safeTime = /^\d{2}:\d{2}$/.test(time) ? time : '10:00';
  const parsed = new Date(`${ymd}T${safeTime}:00+06:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
 * Checks whether a lead's stored collection date equals Today's Asia/Dhaka YYYY-MM-DD date.
 */
export function isLeadCollectedToday(
  lead: Partial<Pick<Lead, 'createdAt' | 'collectedDate' | 'date'>>,
  now: Date = new Date()
): boolean {
  const ymd = getLeadCollectedYmd(lead);
  return ymd !== null && ymd === getDhakaDateString(now);
}

/**
 * Checks if an ISO timestamp or bare YYYY-MM-DD falls within the active DateRangeFilter (Asia/Dhaka).
 */
export function isWithinDateRange(
  isoTimestamp: string,
  filter: DateRangeFilter,
  now: Date = new Date()
): boolean {
  if (filter.preset === 'all') return true;
  const recordYmd = parseDateToYmd(isoTimestamp);
  if (!recordYmd) return false;

  const todayYmd = getDhakaDateString(now);

  if (filter.preset === 'today') {
    return recordYmd === todayYmd;
  }

  if (filter.preset === 'week') {
    const weekStartYmd = addDaysToYmd(todayYmd, -6);
    return recordYmd >= weekStartYmd && recordYmd <= todayYmd;
  }

  if (filter.preset === 'month') {
    const monthStartYmd = `${todayYmd.slice(0, 7)}-01`;
    return recordYmd >= monthStartYmd && recordYmd <= todayYmd;
  }

  if (filter.preset === 'custom') {
    const startOk = !filter.startDate || recordYmd >= filter.startDate;
    const endOk = !filter.endDate || recordYmd <= filter.endDate;
    return startOk && endOk;
  }

  return true;
}

/**
 * Checks if a follow-up ISO timestamp is scheduled for today in Asia/Dhaka.
 */
export function isFollowUpDueToday(followUpAt: string | null, now: Date = new Date()): boolean {
  if (!followUpAt) return false;
  const ymd = parseDateToYmd(followUpAt);
  return ymd !== null && ymd === getDhakaDateString(now);
}

/**
 * Checks whether an ISO timestamp or YYYY-MM-DD date string falls on today's Asia/Dhaka date.
 */
export function isTimestampToday(isoTimestamp: string, now: Date = new Date()): boolean {
  const ymd = parseDateToYmd(isoTimestamp);
  if (!ymd) return false;
  return ymd === getDhakaDateString(now);
}

/**
 * Returns only leads collected today (YYYY-MM-DD Asia/Dhaka date).
 * Checks collectedDate / date / createdAt strictly (never updatedAt or render time).
 */
export function filterTodayLeads(leads: Lead[], now: Date = new Date()): Lead[] {
  const todayYmd = getDhakaDateString(now);
  return leads.filter((l) => getLeadCollectedYmd(l) === todayYmd);
}

/**
 * Returns today's Asia/Dhaka leads for the Data Collector's Today-only list AND safely
 * surfaces any leads accidentally stamped with a future date (>= todayYmd) so newly collected
 * leads never vanish if a device clock was ahead.
 */
export function filterCollectorTodayLeads(leads: Lead[], now: Date = new Date()): Lead[] {
  const todayYmd = getDhakaDateString(now);
  return leads.filter((l) => {
    const ymd = getLeadCollectedYmd(l);
    return ymd !== null && ymd >= todayYmd;
  });
}

/**
 * Checks whether a call log matches a target lead by `leadId` or normalized BD phone core key.
 */
export function doesCallLogMatchTarget(
  log: Pick<CallLog, 'leadId' | 'phone'>,
  leadId: string,
  phone: string
): boolean {
  const cleanLeadId = String(leadId || '').trim();
  const existingLeadId = String(log.leadId || '').trim();
  if (cleanLeadId && existingLeadId && cleanLeadId === existingLeadId) {
    return true;
  }
  const targetPhone = extractPhoneCoreKey(phone);
  const existingPhone = extractPhoneCoreKey(log.phone);
  return Boolean(targetPhone && existingPhone && targetPhone === existingPhone);
}

/**
 * Deduplicates call logs so there is at most 1 call entry per lead/phone per calendar day (YYYY-MM-DD),
 * always keeping the entry with the newest timestamp.
 */
export function deduplicateSameDayCallLogs(
  logs: CallLog[],
  options?: { perAgent?: boolean }
): CallLog[] {
  if (logs.length <= 1) return [...logs];

  const sorted = [...logs].sort(
    (a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0)
  );
  const perAgent = Boolean(options?.perAgent);
  const seenBuckets = new Map<string, { leadIds: Set<string>; phones: Set<string> }>();
  const deduped: CallLog[] = [];

  for (const log of sorted) {
    const day = parseDateToYmd(log.timestamp) ?? 'unknown';
    const agentKey = perAgent
      ? (log.agentId?.trim() || log.agentName?.trim().toLowerCase() || '*')
      : '*';
    const bucketKey = `${day}::${agentKey}`;
    let bucket = seenBuckets.get(bucketKey);
    if (!bucket) {
      bucket = { leadIds: new Set<string>(), phones: new Set<string>() };
      seenBuckets.set(bucketKey, bucket);
    }

    const cleanLeadId = String(log.leadId || '').trim();
    const phoneCore = extractPhoneCoreKey(log.phone);

    if (
      (cleanLeadId && bucket.leadIds.has(cleanLeadId)) ||
      (phoneCore && bucket.phones.has(phoneCore))
    ) {
      continue;
    }

    if (cleanLeadId) bucket.leadIds.add(cleanLeadId);
    if (phoneCore) bucket.phones.add(phoneCore);
    deduped.push(log);
  }

  return deduped;
}

/**
 * Finds an existing call log recorded on `targetDateStr` (default Today YYYY-MM-DD)
 * for the specified agent and target `leadId` / normalized phone number.
 * Returns the newest matching entry if multiple legacy entries exist.
 */
export function findExistingTodayCallLog(
  logs: CallLog[],
  agentId: string,
  agentName: string,
  leadId: string,
  phone: string,
  targetDateStr: string = getLocalDateString()
): CallLog | undefined {
  const normalizedAgentName = agentName.trim().toLowerCase();
  const matches = logs.filter((c) => {
    if (parseDateToYmd(c.timestamp) !== targetDateStr) return false;
    const sameAgent =
      (agentId && c.agentId === agentId) ||
      (normalizedAgentName && c.agentName.trim().toLowerCase() === normalizedAgentName);
    if (!sameAgent) return false;
    return doesCallLogMatchTarget(c, leadId, phone);
  });

  if (matches.length === 0) return undefined;
  return matches.sort(
    (a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0)
  )[0];
}

/**
 * Upserts a call log in place for the same `(day, agent, leadId / normalized phone)`:
 * removes any older same-day entries for that same agent & phone/lead and places the updated
 * record at the top (sorted newest-first).
 */
export function upsertTodayCallLogInList(
  logs: CallLog[],
  upsertedLog: CallLog
): CallLog[] {
  const targetDay = parseDateToYmd(upsertedLog.timestamp) ?? getLocalDateString();
  const normalizedAgentName = upsertedLog.agentName.trim().toLowerCase();

  const remaining = logs.filter((c) => {
    if (c.id === upsertedLog.id) return false;
    if (parseDateToYmd(c.timestamp) !== targetDay) return true;
    const sameAgent =
      (upsertedLog.agentId && c.agentId === upsertedLog.agentId) ||
      (normalizedAgentName && c.agentName.trim().toLowerCase() === normalizedAgentName);
    if (!sameAgent) return true;
    return !doesCallLogMatchTarget(c, upsertedLog.leadId, upsertedLog.phone);
  });

  return [upsertedLog, ...remaining].sort(
    (a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0)
  );
}

/**
 * Returns only unique call logs recorded today (YYYY-MM-DD local date),
 * deduplicated by leadId / normalized phone number (keeping the latest entry per number).
 */
export function filterTodayCallLogs(logs: CallLog[], now: Date = new Date()): CallLog[] {
  return deduplicateSameDayCallLogs(
    logs.filter((c) => isTimestampToday(c.timestamp, now))
  );
}

/**
 * Returns only call logs recorded Today (YYYY-MM-DD local date) by the specified agent,
 * deduplicated to max 1 entry per lead/phone and sorted newest-first by timestamp.
 * Excludes previous-day logs and other agents' calls.
 */
export function getAgentTodayCallLogs(
  logs: CallLog[],
  agentId: string,
  now: Date = new Date()
): CallLog[] {
  if (!agentId) return [];
  const todayForAgent = logs.filter(
    (c) => c.agentId === agentId && isTimestampToday(c.timestamp, now)
  );
  return deduplicateSameDayCallLogs(todayForAgent);
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
    .filter((l) => l.assignedAgentId === agentId && l.status !== 'Done' && Boolean(l.followUpAt))
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
  const filteredLeads = leads.filter((l) =>
    isWithinDateRange(getLeadCollectedYmd(l) ?? l.createdAt, filter, now)
  );
  const filteredCalls = deduplicateSameDayCallLogs(
    callLogs.filter((c) => isWithinDateRange(c.timestamp, filter, now))
  );
  const todayCalls = deduplicateSameDayCallLogs(
    callLogs.filter((c) =>
      isWithinDateRange(c.timestamp, { preset: 'today', startDate: '', endDate: '' }, now)
    )
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
  const filteredLeads = leads.filter((l) =>
    isWithinDateRange(getLeadCollectedYmd(l) ?? l.createdAt, filter, now)
  );
  const filteredCalls = callLogs.filter((c) => isWithinDateRange(c.timestamp, filter, now));

  return agents
    .map((agent) => {
      const agentLeads = filteredLeads.filter((l) => l.assignedAgentId === agent.id);
      const agentCalls = deduplicateSameDayCallLogs(
        filteredCalls.filter((c) => c.agentId === agent.id)
      );
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
      isWithinDateRange(getLeadCollectedYmd(l) ?? l.createdAt, todayFilter, now)
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
 * Formats an ISO date string or bare YYYY-MM-DD into a readable short date in Asia/Dhaka,
 * e.g., "Nov 23, 2026". Bare YYYY-MM-DD values are formatted directly without timezone shifting.
 */
export function formatShortDate(iso: string): string {
  const trimmed = String(iso ?? '').replace(/^'+/, '').trim();
  if (!trimmed || trimmed === '1970-01-01T00:00:00.000Z') return 'Historical Sheet';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parts = parseYmdParts(trimmed);
    if (!parts) return iso;
    const monthLabel = SHORT_MONTH_NAMES[parts.month - 1];
    return `${monthLabel} ${parts.day}, ${parts.year}`;
  }
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString('en-US', {
    timeZone: DHAKA_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats an ISO date string into time in Asia/Dhaka, e.g., "02:30 PM".
 * Returns empty string for bare YYYY-MM-DD dates without a time component.
 */
export function formatTime(iso: string): string {
  const trimmed = String(iso ?? '').replace(/^'+/, '').trim();
  if (!trimmed || /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return '';
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('en-US', {
    timeZone: DHAKA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats an ISO date string into date + time in Asia/Dhaka (or short date for bare YYYY-MM-DD).
 */
export function formatDateTime(iso: string): string {
  const trimmed = String(iso ?? '').replace(/^'+/, '').trim();
  if (!trimmed || trimmed === '1970-01-01T00:00:00.000Z') return 'Historical Sheet';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return formatShortDate(trimmed);
  }
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return iso;
  return `${formatShortDate(trimmed)}, ${formatTime(trimmed)}`;
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
  const dateLabel = getDhakaDateString(reportDate);
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
    const todaysCalls = deduplicateSameDayCallLogs(
      callLogs.filter(
        (c) => c.agentId === agent.id && isWithinDateRange(c.timestamp, todayFilter, reportDate)
      )
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
  done: number;
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
    done: number;
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

function isLeadOnLocalDate(
  lead: Partial<Pick<Lead, 'createdAt' | 'collectedDate' | 'date'>>,
  targetDateStr: string
): boolean {
  return getLeadCollectedYmd(lead) === targetDateStr;
}

export function computeFinalDailySummary(
  agents: User[],
  collectors: User[],
  leads: Lead[],
  callLogs: CallLog[],
  contentPosts: ContentPost[],
  dateStr: string = getLocalDateString()
): FinalDailySummary {
  const dateLeads = leads.filter((l) => isLeadOnLocalDate(l, dateStr));

  const agentRows: FinalDailyAgentRow[] = agents.map((agent) => {
    const agentDateLeads = dateLeads.filter((l) => l.assignedAgentId === agent.id);
    const dateCalls = deduplicateSameDayCallLogs(
      callLogs.filter(
        (c) => c.agentId === agent.id && isIsoOnLocalDate(c.timestamp, dateStr)
      )
    );
    const confirmedOnDate = dateCalls.filter((c) => c.newStatus === 'Order Confirmed').length;
    const interested = dateCalls.filter((c) => c.newStatus === 'Interested').length;
    const followUp = dateCalls.filter((c) => c.newStatus === 'Busy / Call Later').length;
    const noResponse = dateCalls.filter(
      (c) => c.newStatus === 'Switched Off / No Answer'
    ).length;
    const cancelled = dateCalls.filter(
      (c) => c.newStatus === 'Not Interested' || c.newStatus === 'Wrong Number'
    ).length;
    const done = dateCalls.filter((c) => c.newStatus === 'Done').length;
    const pending = agentDateLeads.filter((l) => l.status === 'Pending').length;

    return {
      agentId: agent.id,
      agentName: agent.name,
      assignedLeads: agentDateLeads.length,
      callsMade: dateCalls.length,
      orderConfirmed: confirmedOnDate,
      interested,
      followUp,
      noResponse,
      cancelled,
      done,
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
      done: acc.done + row.done,
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
      done: 0,
      pending: 0,
    }
  );

  const collectorRows: FinalDailyCollectorRow[] = collectors.map((collector) => {
    const allMine = leads.filter((l) => l.collectorId === collector.id);
    const onDate = allMine.filter((l) => isLeadOnLocalDate(l, dateStr)).length;
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
  lines.push(`CALL CENTER AGENTS PERFORMANCE (${summary.date})`);
  lines.push(
    [
      'Agent Name',
      `Assigned (${summary.date})`,
      'Calls Made',
      'Order Confirmed',
      'Interested',
      'Follow-up',
      'No Response',
      'Cancelled / Wrong No',
      'Done',
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
        a.done,
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
      summary.agentTotals.done,
      summary.agentTotals.pending,
    ]
      .map(escape)
      .join(',')
  );

  lines.push('');

  // Section 2: Data Collectors (Selected Date Only)
  lines.push(`DATA COLLECTORS (${summary.date})`);
  lines.push(['Collector Name', `Leads Collected (${summary.date})`].map(escape).join(','));
  for (const c of summary.collectors) {
    lines.push([c.collectorName, c.leadsCollectedOnDate].map(escape).join(','));
  }
  lines.push(['TOTAL', summary.totalCollectedOnDate].map(escape).join(','));

  lines.push('');

  // Section 3: Content & Link Poster (Kawsar)
  lines.push(`CONTENT & LINK POSTER (KAWSAR - ${summary.date})`);
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
  const parts = parseYmdParts(ymd) ?? parseYmdParts(getDhakaDateString());
  if (!parts) return getDhakaDateString();
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Normalizes any ISO timestamp, Date, or YYYY-MM-DD string into YYYY-MM-DD (Asia/Dhaka).
 */
export function toYmdString(value: string | Date | null | undefined, fallbackNow: Date = new Date()): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? getDhakaDateString(fallbackNow) : getDhakaDateString(value);
  }
  const str = String(value ?? '').replace(/^'+/, '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return parseYmdParts(str) ? str : getDhakaDateString(fallbackNow);
  }
  if (str) {
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return getDhakaDateString(parsed);
    }
  }
  return getDhakaDateString(fallbackNow);
}

/**
 * Computes whole calendar days remaining until renewalDate (YYYY-MM-DD) relative to Asia/Dhaka `now`.
 * Returns 0 if renewalDate is today, positive integer if upcoming, negative if past.
 */
export function computeDaysRemaining(renewalDateYmd: string, now: Date = new Date()): number {
  const renParts = parseYmdParts(toYmdString(renewalDateYmd, now));
  const todayParts = parseYmdParts(getDhakaDateString(now));
  if (!renParts || !todayParts) return 0;
  const renUtc = Date.UTC(renParts.year, renParts.month - 1, renParts.day);
  const todayUtc = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
  return Math.round((renUtc - todayUtc) / 86400000);
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

/**
 * Filters an agent's assigned leads queue for the "My Assigned Leads" table.
 * By default (`statusFilter === 'ALL'`), leads marked `'Done'` are automatically excluded
 * so they cleanly move out of the active call queue into "Today calls".
 * When the agent explicitly selects `'Done'` in the status filter dropdown, `'Done'` leads remain accessible.
 */
export function filterAgentAssignedQueueLeads(
  leads: Lead[],
  statusFilter: CallStatus | 'ALL',
  searchQuery: string = ''
): Lead[] {
  const q = searchQuery.trim().toLowerCase();
  return leads.filter((l) => {
    if (statusFilter === 'ALL') {
      if (l.status === 'Done') return false;
    } else if (l.status !== statusFilter) {
      return false;
    }
    if (!q) return true;
    return (
      l.customerName.toLowerCase().includes(q) ||
      l.phone.toLowerCase().includes(q) ||
      l.lastCallNotes.toLowerCase().includes(q)
    );
  });
}
