import type { CallStatus, RenewalStatus } from '../types/index.ts';

export const DEFAULT_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbxRNhBGGML3PspDMwunGObPsdI45y6UU1uU1QTxtzg98yRQeFrtqrcAeXbywE1ZWJ4P/exec';

export const DEFAULT_CALL_SCRIPT = `1. Greeting: Assalamu Alaikum! Am I speaking with [Customer Name]? Calling from RunBD.
2. Context: Thank you for reaching out regarding our products/services.
3. Qualification: Share current offer details & confirm delivery address in Dhaka / Outside Dhaka.
4. Close: Request confirmation to finalize the order or schedule a convenient callback time.`;

const VALID_CALL_STATUSES: ReadonlySet<CallStatus> = new Set<CallStatus>([
  'Pending',
  'Done',
  'Interested',
  'Order Confirmed',
  'Busy / Call Later',
  'Not Interested',
  'Switched Off / No Answer',
  'Wrong Number',
]);

const VALID_RENEWAL_STATUSES: ReadonlySet<RenewalStatus> = new Set<RenewalStatus>([
  'Active',
  'Renewed',
  'Expired',
]);

export function sanitizeCallStatus(value: unknown): CallStatus {
  if (typeof value === 'string' && VALID_CALL_STATUSES.has(value as CallStatus)) {
    return value as CallStatus;
  }
  return 'Pending';
}

export function sanitizeRenewalStatus(value: unknown): RenewalStatus {
  if (typeof value === 'string' && VALID_RENEWAL_STATUSES.has(value as RenewalStatus)) {
    return value as RenewalStatus;
  }
  return 'Active';
}

export function normalizeBdPhoneServer(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00880')) digits = digits.slice(4);
  else if (digits.startsWith('8800')) digits = digits.slice(3);
  else if (digits.startsWith('880')) digits = digits.slice(2);
  else if (digits.startsWith('88') && digits.length >= 12) digits = digits.slice(2);
  if (digits.length === 10 && /^1[3-9]\d{8}$/.test(digits)) digits = `0${digits}`;
  if (/^01[3-9]\d{8}$/.test(digits)) return digits;
  return null;
}

export function normalizeFacebookUrlServer(raw: string | undefined | null): string {
  if (!raw) return '';
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.replace(/^(www\.|m\.|mbasic\.|mobile\.|web\.|l\.)+/i, '');
    const pathname = parsed.pathname.replace(/\/+$/, '');
    const idParam = parsed.searchParams.get('id');
    if (pathname === '/profile.php' && idParam) {
      return `${host}${pathname}?id=${idParam}`;
    }
    return `${host}${pathname}`;
  } catch {
    return trimmed
      .replace(/^https?:\/\//, '')
      .replace(/^(www\.|m\.|mbasic\.|mobile\.|web\.|l\.)+/i, '')
      .split('?')[0]
      .replace(/\/+$/, '');
  }
}

const SERVER_TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'ref',
  'refsrc',
  'ref_src',
  'ref_url',
  'rdid',
  'share_url',
  'sfnsn',
  '__tn__',
  'mibextid',
  'igsh',
  'igshid',
  'is_from_webapp',
  'sender_device',
  'sender_web_id',
  'tt_from',
  'u_code',
  'share_app_id',
  '_r',
  '_t',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
]);

export function normalizePostUrlServer(raw: string | undefined | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    let host = parsed.hostname
      .toLowerCase()
      .replace(/^(www\.|m\.|mbasic\.|mobile\.|web\.|touch\.|l\.)+/i, '');
    if (host === 'fb.me' || host === 'fb.com') {
      host = 'facebook.com';
    } else if (host === 'twitter.com') {
      host = 'x.com';
    }
    const pathname = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    const keptParams: Array<[string, string]> = [];
    parsed.searchParams.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      const isTwitterParam =
        (host === 'x.com' || host === 'twitter.com') &&
        (lowerKey === 's' || lowerKey === 't');
      if (
        !SERVER_TRACKING_PARAMS.has(lowerKey) &&
        !lowerKey.startsWith('utm_') &&
        !lowerKey.startsWith('__cft__') &&
        !isTwitterParam
      ) {
        keptParams.push([lowerKey, val]);
      }
    });
    keptParams.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    const qs =
      keptParams.length > 0
        ? `?${keptParams.map(([k, v]) => `${k}=${v}`).join('&')}`
        : '';
    return `${host}${pathname}${qs}`;
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^(www\.|m\.|mbasic\.|mobile\.|web\.|touch\.|l\.)+/i, '')
      .replace(/^twitter\.com\//, 'x.com/')
      .split('#')[0]
      .replace(/\/+$/, '');
  }
}

export function getTodayYmdServer(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback below
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateToYmdServer(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return getTodayYmdServer(parsed);
}
