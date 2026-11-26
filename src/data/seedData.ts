import {
  AppSettings,
  AuditLog,
  CallLog,
  ContentPost,
  DuplicateAttempt,
  Lead,
  PaidCustomer,
  User,
} from '../types';
import { FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL } from '../utils/sheetsSync';

export const DEMO_USERS: User[] = [
  {
    id: 'admin-1',
    name: 'Jahid Islam',
    email: 'admin@runbd',
    password: 'admin@/#312',
    role: 'admin',
    title: 'Manager',
    avatarInitials: 'MH',
  },
  {
    id: 'agent-tanjin',
    name: 'Tanjin',
    email: 'tazin@runbd',
    password: 'tazin@/#312',
    role: 'agent',
    title: 'Senior Call Center Agent',
    avatarInitials: 'TJ',
  },
  {
    id: 'agent-kathy',
    name: 'Kathy',
    email: 'kathy@runbd',
    password: 'kathy@/#312',
    role: 'agent',
    title: 'Call Center Agent',
    avatarInitials: 'KT',
  },
  {
    id: 'agent-tania',
    name: 'Tania',
    email: 'tania@runbd',
    password: 'tania@/#312',
    role: 'agent',
    title: 'Call Center Agent',
    avatarInitials: 'TN',
  },
  {
    id: 'agent-shanaz',
    name: 'Shanaz',
    email: 'shanaz@runbd',
    password: 'shanaz@/#312',
    role: 'agent',
    title: 'Call Center Agent',
    avatarInitials: 'SH',
  },
  {
    id: 'agent-sizon',
    name: 'Sizon',
    email: 'sizon@runbd',
    password: 'sizon@/#312',
    role: 'agent',
    title: 'Call Center Agent',
    avatarInitials: 'SZ',
  },
  {
    id: 'agent-sakib',
    name: 'Sakib',
    email: 'sakib@runbd',
    password: 'sakib@/#312',
    role: 'agent',
    title: 'Call Center Agent',
    avatarInitials: 'SK',
  },
  {
    id: 'collector-farhan',
    name: 'Farhan',
    email: 'farhan@runbd',
    password: 'farhan@/#312',
    role: 'collector',
    title: 'Data Collector',
    avatarInitials: 'FR',
  },
  {
    id: 'collector-naim',
    name: 'Naim',
    email: 'naim@runbd',
    password: 'naim@/#312',
    role: 'collector',
    title: 'Data Collector',
    avatarInitials: 'NM',
  },
  {
    id: 'poster-kawsar',
    name: 'Kawsar',
    email: 'kawsar@runbd',
    password: 'kawsar@/#312',
    role: 'poster',
    title: 'Content & Link Poster',
    avatarInitials: 'KW',
  },
];

export const CALL_CENTER_AGENTS = DEMO_USERS.filter((u) => u.role === 'agent');
export const DATA_COLLECTORS = DEMO_USERS.filter((u) => u.role === 'collector');

export function createSeedLeads(): Lead[] {
  return [];
}

export function createSeedCallLogs(): CallLog[] {
  return [];
}

export function createSeedAuditLogs(): AuditLog[] {
  return [];
}

export function createSeedDuplicateAttempts(): DuplicateAttempt[] {
  return [];
}

export function createSeedContentPosts(): ContentPost[] {
  return [];
}

export function createSeedPaidCustomers(): PaidCustomer[] {
  return [];
}

export const DEFAULT_CALL_SCRIPT = `1. GREETING (Warm & Clear)
"Assalamu Alaikum [Customer Name]! Ami [Agent Name] bolchi RunBD theke. Apni amader Facebook page-e ekti product/service niye inquiry korechilen — ekhon ki 1 minute kotha bola jabe?"

2. VALUE & OFFER SUMMARY
- Highlight Dhaka Cash-on-Delivery (24-48 hrs) & Outside Dhaka Courier (48-72 hrs).
- Confirm exact product variant, quantity, and special bundle discount if ordering 2+ units.

3. CLOSING / FOLLOW-UP
- If Ready: Confirm full delivery address & alternate phone number, mark "Order Confirmed".
- If Busy: Ask exact callback time, mark "Busy / Call Later", and schedule Follow-up.
- Always offer to send product photos/invoice directly on WhatsApp.`;

export const DEFAULT_SETTINGS: AppSettings = {
  autoAssignEnabled: true,
  roundRobinIndex: 0,
  disabledAgentIds: [],
  googleSheetsWebhookUrl: FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL,
  callScript: DEFAULT_CALL_SCRIPT,
  lastSyncedAt: null,
};

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * RunBD Business Management Application - Google Sheets Real-Time Multi-Tab Sync
 * Automatically creates and syncs:
 *   - Core Tabs: Master_Data, Agent_Logs, Daily_Summary, Kawsar_Posts_Log, Paid_Customers, Final_Daily_Summary
 *   - Dedicated Agent Tabs: Agent_Tanjin, Agent_Kathy, Agent_Tania, Agent_Shanaz, Agent_Sizon, Agent_Sakib (and dynamic Agent_<Name>)
 *   - Dedicated Paid Agent Tabs: Paid_Tanjin, Paid_Kathy, Paid_Tania, Paid_Shanaz, Paid_Sizon, Paid_Sakib (and dynamic Paid_<Name>)
 *   - Dedicated Collector Tabs: Collector_Farhan, Collector_Naim (and dynamic Collector_<Name> for Team Management collectors)
 *
 * Instructions:
 * 1. Open your Google Sheet -> Extensions -> Apps Script
 * 2. Paste this entire code into Code.gs and click Save
 * 3. Click Deploy -> New deployment -> Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the Web App URL and paste it into RunBD Admin -> Google Sheets Sync
 */

var AGENT_NAMES = ['Tanjin', 'Kathy', 'Tania', 'Shanaz', 'Sizon', 'Sakib'];
var COLLECTOR_NAMES = ['Farhan', 'Naim'];
var MASTER_HEADERS = [
  'Lead ID', 'Customer Name', 'Phone', 'Facebook Link', 'Collector',
  'Assigned Agent', 'Latest Status', 'Follow-up At', 'Notes', 'Updated At', 'Created At'
];
var AGENT_TAB_HEADERS = [
  'Lead ID', 'Customer Name', 'Phone', 'Facebook Link',
  'Latest Status', 'Follow-up At', 'Call Notes', 'Added By', 'Updated At'
];
var COLLECTOR_TAB_HEADERS = [
  'Lead ID', 'Customer Name', 'Phone', 'Facebook Link', 'Assigned Agent',
  'Latest Status', 'Follow-up At', 'Notes', 'Collector', 'Updated At', 'Created At'
];
var KAWSAR_POST_HEADERS = [
  'Post ID', 'Title / Note', 'Facebook Link', 'Website Link',
  'TikTok Link', 'Instagram Link', 'Twitter Link', 'Posted By', 'Timestamp'
];
var PAID_CUSTOMER_HEADERS = [
  'Customer ID', 'Lead ID', 'Customer Name', 'Phone', 'Assigned Agent',
  'Confirmed Date', 'Renewal Date', 'Days Remaining', 'Renewal Status', 'Updated At',
  'Package', 'Notes'
];
var PAID_AGENT_TAB_HEADERS = [
  'ID', 'Date', 'Customer / Vehicle', 'Phone', 'Facebook Link',
  'Collector', 'Agent', 'Amount / Package', 'Notes', 'Updated At'
];

function normalizeBdPhone_(raw) {
  var digits = String(raw || '').replace(/^'+/, '').replace(/\\D/g, '');
  if (!digits) return '';
  var normalized = digits;
  if (digits.indexOf('0088001') === 0 && digits.length === 16) {
    normalized = digits.slice(5);
  } else if (digits.indexOf('00880') === 0 && digits.length === 15) {
    normalized = digits.slice(4);
  } else if (digits.indexOf('0088') === 0 && digits.length === 14) {
    normalized = '0' + digits.slice(4);
  } else if (digits.indexOf('88001') === 0 && digits.length === 14) {
    normalized = digits.slice(3);
  } else if (digits.indexOf('880') === 0 && digits.length === 13) {
    normalized = digits.slice(2);
  } else if (digits.indexOf('88') === 0 && digits.length === 12) {
    normalized = '0' + digits.slice(2);
  } else if (digits.indexOf('1') === 0 && digits.length === 10) {
    normalized = '0' + digits;
  }
  if (/^01[3-9]\\d{8}$/.test(normalized)) {
    return normalized;
  }
  return '';
}

function extractPhoneCore_(raw) {
  var canonical = normalizeBdPhone_(raw);
  if (canonical) return canonical.slice(1);
  var digits = String(raw || '').replace(/^'+/, '').replace(/\\D/g, '');
  if (!digits) return '';
  return digits.replace(/^(00880|0088|880|88)/, '').replace(/^0+/, '');
}

function normalizePhoneKey_(raw) {
  return extractPhoneCore_(raw);
}

function sanitizeTabSuffix_(raw) {
  var clean = String(raw || '').trim()
    .replace(/[\\\\\\/\\?\\*\\[\\]:]/g, '_')
    .replace(/\\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return clean || 'Unknown';
}

function getAgentTabName_(agentName) {
  return 'Agent_' + sanitizeTabSuffix_(agentName);
}

function getCollectorTabName_(collectorName) {
  return 'Collector_' + sanitizeTabSuffix_(collectorName);
}

function getPaidAgentTabName_(agentName) {
  return 'Paid_' + sanitizeTabSuffix_(agentName);
}

function isPaidAgentTabName_(sheetName) {
  return Boolean(sheetName && sheetName.indexOf('Paid_') === 0 && sheetName !== 'Paid_Customers');
}

function collectUniqueNames_(baseList, extraList) {
  var seen = {};
  var out = [];
  var combined = [];
  if (Array.isArray(baseList)) combined = combined.concat(baseList);
  if (Array.isArray(extraList)) combined = combined.concat(extraList);
  for (var i = 0; i < combined.length; i++) {
    var name = String(combined[i] || '').trim();
    if (!name || name.toLowerCase() === 'unassigned') continue;
    var key = name.toLowerCase();
    if (!seen[key]) {
      seen[key] = true;
      out.push(name);
    }
  }
  return out;
}

function normalizeFb_(raw) {
  var cleaned = String(raw || '').trim().toLowerCase()
    .replace(/^https?:\\/\\//, '')
    .replace(/^(www\\.|m\\.|mobile\\.|web\\.|mbasic\\.|touch\\.)+/g, '')
    .replace(/^(fb\\.com|fb\\.me)\\//, 'facebook.com/');
  if (!cleaned) return '';
  if (cleaned.indexOf('profile.php') !== -1) {
    var m = cleaned.match(/id=(\\d+)/);
    if (m) return 'facebook.com/profile.php?id=' + m[1];
  }
  if (cleaned.indexOf('permalink.php') !== -1 || cleaned.indexOf('story.php') !== -1) {
    var storyMatch = cleaned.match(/story_fbid=([^&#]+)/);
    var pageMatch = cleaned.match(/(?:^|[?&])id=([^&#]+)/);
    var pathPart = cleaned.split('?')[0].split('#')[0].replace(/\\/+$/, '');
    var qParts = [];
    if (storyMatch && storyMatch[1]) qParts.push('story_fbid=' + storyMatch[1]);
    if (pageMatch && pageMatch[1]) qParts.push('id=' + pageMatch[1]);
    if (qParts.length > 0) return pathPart + '?' + qParts.join('&');
  }
  return cleaned.split('?')[0].split('#')[0].replace(/\\/+$/, '');
}

function normalizeUrlKey_(raw) {
  var cleaned = String(raw || '').trim().toLowerCase()
    .replace(/^https?:\\/\\//, '')
    .replace(/^(www\\.|m\\.|mobile\\.|mbasic\\.|touch\\.)+/g, '')
    .replace(/^(fb\\.com|fb\\.me)\\//, 'facebook.com/')
    .replace(/^twitter\\.com\\//, 'x.com/')
    .split('#')[0];
  if (!cleaned) return '';
  var parts = cleaned.split('?');
  var base = parts[0].replace(/\\/+$/, '');
  if (parts.length < 2 || !parts[1]) return base;
  var isTwitterHost = base.indexOf('x.com/') === 0 || base === 'x.com';
  var kept = parts[1].split('&').filter(function(kv) {
    var k = kv.split('=')[0].toLowerCase();
    return k && k !== 'fbclid' && k !== 'gclid' && k !== 'ref' && k !== 'refsrc' &&
      k !== 'ref_src' && k !== 'ref_url' && k !== 'rdid' && k !== 'share_url' &&
      k !== 'sfnsn' && k !== '__tn__' && k !== 'mibextid' &&
      k !== 'igsh' && k !== 'igshid' && k !== 'is_from_webapp' &&
      k !== 'sender_device' && k !== 'sender_web_id' && k !== 'tt_from' &&
      k !== 'u_code' && k !== 'share_app_id' && k !== '_r' && k !== '_t' &&
      !(isTwitterHost && (k === 's' || k === 't')) &&
      k.indexOf('utm_') !== 0 && k.indexOf('__cft__') !== 0;
  }).sort();
  return kept.length ? (base + '?' + kept.join('&')) : base;
}

function getKawsarColMap_(kawsarSheet) {
  var lastCol = kawsarSheet ? Math.max(6, kawsarSheet.getLastColumn()) : 9;
  var hdrRow = (kawsarSheet && kawsarSheet.getLastRow() >= 1)
    ? kawsarSheet.getRange(1, 1, 1, lastCol).getValues()[0]
    : KAWSAR_POST_HEADERS;
  var map = { id: 0, note: 1, fb: 2, web: 3, tt: -1, ig: -1, tw: -1, poster: 4, ts: 5, totalCols: lastCol };
  for (var c = 0; c < hdrRow.length; c++) {
    var h = String(hdrRow[c] || '').trim().toLowerCase();
    if (h === 'post id') map.id = c;
    else if (h.indexOf('title') !== -1 || h.indexOf('note') !== -1) map.note = c;
    else if (h.indexOf('facebook') !== -1) map.fb = c;
    else if (h.indexOf('website') !== -1) map.web = c;
    else if (h.indexOf('tiktok') !== -1) map.tt = c;
    else if (h.indexOf('instagram') !== -1) map.ig = c;
    else if (h.indexOf('twitter') !== -1) map.tw = c;
    else if (h.indexOf('posted by') !== -1) map.poster = c;
    else if (h.indexOf('timestamp') !== -1) map.ts = c;
  }
  return map;
}

function ensureKawsarPostHeaders_(kawsarSheet) {
  if (!kawsarSheet) return;
  if (kawsarSheet.getLastRow() < 1) {
    kawsarSheet.appendRow(KAWSAR_POST_HEADERS);
    kawsarSheet.getRange(1, 1, 1, KAWSAR_POST_HEADERS.length).setFontWeight('bold');
    return;
  }
  var lastCol = Math.max(6, kawsarSheet.getLastColumn());
  var hdr = kawsarSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var col5 = String(hdr[4] || '').trim().toLowerCase();
  if (col5 === 'posted by' && typeof kawsarSheet.insertColumnsBefore === 'function') {
    kawsarSheet.insertColumnsBefore(5, 3);
  }
  if (col5 === 'posted by' || lastCol < KAWSAR_POST_HEADERS.length || String(hdr[4] || '').trim().toLowerCase() !== 'tiktok link') {
    kawsarSheet.getRange(1, 1, 1, KAWSAR_POST_HEADERS.length).setValues([KAWSAR_POST_HEADERS]);
    kawsarSheet.getRange(1, 1, 1, KAWSAR_POST_HEADERS.length).setFontWeight('bold');
  }
}

function sanitizePaidPackageName_(val) {
  if (val === null || val === undefined || val instanceof Date) return '';
  var trimmed = String(val).trim();
  if (!trimmed) return '';
  if (
    /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}/.test(trimmed) ||
    /^\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}/.test(trimmed) ||
    /GMT[+-]\\d{4}|\\((?:[A-Za-z]+\\s+)+(?:Standard|Daylight|Summer)\\s+Time\\)|Coordinated Universal Time/i.test(trimmed)
  ) {
    return '';
  }
  return trimmed;
}

function ensurePaidCustomerHeaders_(paidSheet) {
  if (!paidSheet) return;
  if (paidSheet.getLastRow() < 1) {
    paidSheet.appendRow(PAID_CUSTOMER_HEADERS);
    paidSheet.getRange(1, 1, 1, PAID_CUSTOMER_HEADERS.length).setFontWeight('bold');
    return;
  }
  var lastCol = Math.max(10, paidSheet.getLastColumn());
  var hdr = paidSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var col11 = String(hdr[10] || '').trim().toLowerCase();
  if (col11 === 'notes' && typeof paidSheet.insertColumnsBefore === 'function') {
    paidSheet.insertColumnsBefore(11, 1);
    lastCol = Math.max(lastCol + 1, PAID_CUSTOMER_HEADERS.length);
    hdr = paidSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  }
  if (
    col11 === 'notes' ||
    lastCol < PAID_CUSTOMER_HEADERS.length ||
    String(hdr[10] || '').trim().toLowerCase() !== 'package'
  ) {
    paidSheet.getRange(1, 1, 1, PAID_CUSTOMER_HEADERS.length).setValues([PAID_CUSTOMER_HEADERS]);
    paidSheet.getRange(1, 1, 1, PAID_CUSTOMER_HEADERS.length).setFontWeight('bold');
  }
}

function formatKawsarPostRow_(cp) {
  return [
    cp.id,
    cp.note || '',
    cp.facebookLink || '',
    cp.websiteLink || '',
    cp.tiktokLink || '',
    cp.instagramLink || '',
    cp.twitterLink || '',
    cp.posterName || 'Kawsar',
    cp.createdAt
  ];
}

function getDhakaTodayYmd_() {
  return Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyyy-MM-dd');
}

function toYmd_(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    var trimmed = val.replace(/^'+/, '').trim();
    if (!trimmed) return '';
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(trimmed)) return trimmed;
  }
  var d = (val instanceof Date) ? val : new Date(val);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, 'Asia/Dhaka', 'yyyy-MM-dd');
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = String(params.action || 'pull').toLowerCase();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var masterSheet = ss.getSheetByName('Master_Data');
    var logsSheet = ss.getSheetByName('Agent_Logs');
    var kawsarSheet = ss.getSheetByName('Kawsar_Posts_Log');

    // 1. Lightweight on-demand Lead Duplicate Check
    if (action === 'check_lead_duplicate') {
      var targetCanonicalPhone = normalizeBdPhone_(params.phone || '');
      var targetPhone = targetCanonicalPhone ? targetCanonicalPhone.slice(1) : extractPhoneCore_(params.phone || '');
      var targetFb = normalizeFb_(params.facebookLink || '');

      if (masterSheet && masterSheet.getLastRow() > 1 && (targetPhone || targetFb)) {
        var colCount = Math.max(11, masterSheet.getLastColumn());
        var rows = masterSheet.getRange(2, 1, masterSheet.getLastRow() - 1, colCount).getValues();
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var rowPhoneRaw = String(r[2] || '').replace(/^'+/, '').trim();
          var rowNormalizedPhone = normalizeBdPhone_(rowPhoneRaw) || rowPhoneRaw;
          var rowFbRaw = String(r[3] || '').trim();
          var phoneMatch = targetPhone && extractPhoneCore_(rowPhoneRaw) === targetPhone;
          var fbMatch = targetFb && normalizeFb_(rowFbRaw) === targetFb;

          if (phoneMatch || fbMatch) {
            return jsonOut_({
              ok: true,
              isDuplicate: true,
              matchedBy: phoneMatch ? 'phone' : 'facebook',
              lead: {
                id: r[0] ? String(r[0]).trim() : ('SHEET-ROW-' + (i + 2)),
                customerName: String(r[1] || 'Existing Customer').trim(),
                phone: rowNormalizedPhone,
                facebookLink: rowFbRaw,
                collectorName: String(r[4] || 'Unknown').trim(),
                assignedAgentName: String(r[5] || '') === 'Unassigned' ? null : String(r[5] || '').trim(),
                status: String(r[6] || 'Pending').trim(),
                updatedAt: r[9] ? new Date(r[9]).toISOString() : '',
                createdAt: r[10] ? new Date(r[10]).toISOString() : ''
              }
            });
          }
        }
      }
      return jsonOut_({ ok: true, isDuplicate: false });
    }

    // 2. Lightweight on-demand Kawsar Post Duplicate Check
    if (action === 'check_post_duplicate') {
      var targetPostFb = normalizeUrlKey_(params.facebookLink || '');
      var targetPostWeb = normalizeUrlKey_(params.websiteLink || '');
      var targetPostTt = normalizeUrlKey_(params.tiktokLink || '');
      var targetPostIg = normalizeUrlKey_(params.instagramLink || '');
      var targetPostTw = normalizeUrlKey_(params.twitterLink || '');

      if (kawsarSheet && kawsarSheet.getLastRow() > 1 && (targetPostFb || targetPostWeb || targetPostTt || targetPostIg || targetPostTw)) {
        var colMap = getKawsarColMap_(kawsarSheet);
        var pRows = kawsarSheet.getRange(2, 1, kawsarSheet.getLastRow() - 1, colMap.totalCols).getValues();
        for (var p = 0; p < pRows.length; p++) {
          var pr = pRows[p];
          var existingFbRaw = String(pr[colMap.fb] || '').trim();
          var existingWebRaw = String(pr[colMap.web] || '').trim();
          var existingTtRaw = colMap.tt >= 0 ? String(pr[colMap.tt] || '').trim() : '';
          var existingIgRaw = colMap.ig >= 0 ? String(pr[colMap.ig] || '').trim() : '';
          var existingTwRaw = colMap.tw >= 0 ? String(pr[colMap.tw] || '').trim() : '';

          var existingList = [
            normalizeUrlKey_(existingFbRaw),
            normalizeUrlKey_(existingWebRaw),
            normalizeUrlKey_(existingTtRaw),
            normalizeUrlKey_(existingIgRaw),
            normalizeUrlKey_(existingTwRaw)
          ].filter(Boolean);

          var matchedField = '';
          if (targetPostFb && existingList.indexOf(targetPostFb) !== -1) matchedField = 'Facebook Link';
          else if (targetPostWeb && existingList.indexOf(targetPostWeb) !== -1) matchedField = 'Website Link';
          else if (targetPostTt && existingList.indexOf(targetPostTt) !== -1) matchedField = 'TikTok Link';
          else if (targetPostIg && existingList.indexOf(targetPostIg) !== -1) matchedField = 'Instagram Link';
          else if (targetPostTw && existingList.indexOf(targetPostTw) !== -1) matchedField = 'Twitter Link';

          if (matchedField) {
            return jsonOut_({
              ok: true,
              isDuplicate: true,
              matchedField: matchedField,
              post: {
                id: pr[colMap.id] ? String(pr[colMap.id]).trim() : ('SHEET-PST-' + (p + 2)),
                note: String(pr[colMap.note] || '').trim(),
                facebookLink: existingFbRaw,
                websiteLink: existingWebRaw,
                tiktokLink: existingTtRaw,
                instagramLink: existingIgRaw,
                twitterLink: existingTwRaw,
                posterName: String(pr[colMap.poster] || 'Kawsar').trim(),
                createdAt: pr[colMap.ts] ? new Date(pr[colMap.ts]).toISOString() : new Date().toISOString()
              }
            });
          }
        }
      }
      return jsonOut_({ ok: true, isDuplicate: false });
    }

    // 3. Pull records (filtered to Today when scope=today)
    var scope = String(params.scope || 'today').toLowerCase();
    var targetDate = params.date ? String(params.date).trim() : Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyyy-MM-dd');
    var todayOnly = scope !== 'all';

    var leads = [];
    if (masterSheet && masterSheet.getLastRow() > 1) {
      var mColCount = Math.max(11, masterSheet.getLastColumn());
      var mRows = masterSheet.getRange(2, 1, masterSheet.getLastRow() - 1, mColCount).getValues();
      for (var i = 0; i < mRows.length; i++) {
        var r = mRows[i];
        var rowPhone = String(r[2] || '').replace(/^'+/, '').trim();
        var rowFb = String(r[3] || '').trim();
        var rowName = String(r[1] || '').trim();
        if (!r[0] && !rowPhone && !rowFb && !rowName) continue;
        var rowCreatedVal = r[10];
        var rowFollowUpRaw = r[7];
        var rowFollowUpYmd = rowFollowUpRaw ? toYmd_(rowFollowUpRaw) : '';
        var rowStatusStr = String(r[6] || 'Pending');
        var hasActiveFollowUp = Boolean(
          rowFollowUpYmd &&
          rowStatusStr !== 'Done' &&
          rowStatusStr !== 'Order Confirmed' &&
          rowStatusStr !== 'Not Interested' &&
          rowStatusStr !== 'Wrong Number'
        );
        if (todayOnly && toYmd_(rowCreatedVal) !== targetDate && !hasActiveFollowUp) continue;
        var rowId = r[0] ? String(r[0]).trim() : ('SHEET-ROW-' + (i + 2));
        var followUpIso = rowFollowUpRaw
          ? (rowFollowUpRaw instanceof Date ? rowFollowUpRaw.toISOString() : String(rowFollowUpRaw))
          : null;
        leads.push({
          id: rowId,
          customerName: rowName,
          phone: rowPhone,
          facebookLink: rowFb,
          collectorName: String(r[4] || 'Farhan'),
          assignedAgentName: String(r[5] || '') === 'Unassigned' ? null : String(r[5] || ''),
          status: rowStatusStr,
          followUpAt: followUpIso,
          lastCallNotes: String(r[8] || ''),
          updatedAt: r[9] ? new Date(r[9]).toISOString() : '',
          createdAt: rowCreatedVal ? new Date(rowCreatedVal).toISOString() : ''
        });
      }
    }

    var callLogs = [];
    if (logsSheet && logsSheet.getLastRow() > 1) {
      var lRows = logsSheet.getRange(2, 1, logsSheet.getLastRow() - 1, 10).getValues();
      for (var j = 0; j < lRows.length; j++) {
        var lr = lRows[j];
        if (!lr[0]) continue;
        if (todayOnly && toYmd_(lr[9]) !== targetDate) continue;
        callLogs.push({
          id: String(lr[0]),
          leadId: String(lr[1] || ''),
          customerName: String(lr[2] || ''),
          phone: String(lr[3] || '').replace(/^'+/, ''),
          agentName: String(lr[4] || ''),
          previousStatus: String(lr[5] || 'Pending'),
          newStatus: String(lr[6] || 'Pending'),
          notes: String(lr[7] || ''),
          followUpAt: lr[8] ? String(lr[8]) : null,
          timestamp: lr[9] ? new Date(lr[9]).toISOString() : new Date().toISOString()
        });
      }
    }

    var contentPosts = [];
    if (kawsarSheet && kawsarSheet.getLastRow() > 1) {
      var pMap = getKawsarColMap_(kawsarSheet);
      var kRows = kawsarSheet.getRange(2, 1, kawsarSheet.getLastRow() - 1, pMap.totalCols).getValues();
      for (var k = 0; k < kRows.length; k++) {
        var kr = kRows[k];
        var postFb = String(kr[pMap.fb] || '').trim();
        var postWeb = String(kr[pMap.web] || '').trim();
        var postTt = pMap.tt >= 0 ? String(kr[pMap.tt] || '').trim() : '';
        var postIg = pMap.ig >= 0 ? String(kr[pMap.ig] || '').trim() : '';
        var postTw = pMap.tw >= 0 ? String(kr[pMap.tw] || '').trim() : '';
        if (!kr[pMap.id] && !postFb && !postWeb && !postTt && !postIg && !postTw) continue;
        if (todayOnly && toYmd_(kr[pMap.ts]) !== targetDate) continue;
        var postId = kr[pMap.id] ? String(kr[pMap.id]).trim() : ('SHEET-PST-' + (k + 2));
        contentPosts.push({
          id: postId,
          note: String(kr[pMap.note] || ''),
          facebookLink: postFb,
          websiteLink: postWeb,
          tiktokLink: postTt,
          instagramLink: postIg,
          twitterLink: postTw,
          posterName: String(kr[pMap.poster] || 'Kawsar'),
          createdAt: kr[pMap.ts] ? new Date(kr[pMap.ts]).toISOString() : new Date().toISOString()
        });
      }
    }

    var paidSheet = ss.getSheetByName('Paid_Customers');
    var paidCustomers = [];
    if (paidSheet && paidSheet.getLastRow() > 1) {
      var pcCols = Math.max(10, paidSheet.getLastColumn());
      var pcHeaderRow = paidSheet.getRange(1, 1, 1, pcCols).getValues()[0];
      var pcMap = {
        id: 0,
        leadId: 1,
        name: 2,
        phone: 3,
        agent: 4,
        confirmedDate: 5,
        renewalDate: 6,
        renewalStatus: 8,
        updatedAt: 9,
        pkg: -1,
        notes: -1
      };
      for (var phIdx = 0; phIdx < pcHeaderRow.length; phIdx++) {
        var phName = String(pcHeaderRow[phIdx] || '').trim().toLowerCase();
        if (phName === 'customer id' || phName === 'id') pcMap.id = phIdx;
        else if (phName === 'lead id') pcMap.leadId = phIdx;
        else if (phName === 'customer name' || phName === 'customer') pcMap.name = phIdx;
        else if (phName === 'phone') pcMap.phone = phIdx;
        else if (phName === 'assigned agent' || phName === 'agent') pcMap.agent = phIdx;
        else if (phName === 'confirmed date') pcMap.confirmedDate = phIdx;
        else if (phName === 'renewal date') pcMap.renewalDate = phIdx;
        else if (phName === 'renewal status' || phName === 'status') pcMap.renewalStatus = phIdx;
        else if (phName === 'updated at') pcMap.updatedAt = phIdx;
        else if (phName === 'package' || phName === 'amount / package') pcMap.pkg = phIdx;
        else if (phName === 'notes') pcMap.notes = phIdx;
      }
      var pcRows = paidSheet.getRange(2, 1, paidSheet.getLastRow() - 1, pcCols).getValues();
      for (var pcIdx = 0; pcIdx < pcRows.length; pcIdx++) {
        var pr = pcRows[pcIdx];
        var rawPcId = String(pr[pcMap.id] || '').trim();
        var pcPhone = String(pr[pcMap.phone] || '').replace(/^'+/, '').trim();
        var pcName = String(pr[pcMap.name] || '').trim();
        if (!rawPcId && !pcPhone && !pcName) continue;
        var pcId = rawPcId || ('SHEET-PC-ROW-' + (pcIdx + 2));
        var confYmd = toYmd_(String(pr[pcMap.confirmedDate] || '').replace(/^'+/, '')) || targetDate;
        var renYmd = toYmd_(String(pr[pcMap.renewalDate] || '').replace(/^'+/, ''));
        var rawUpd = pr[pcMap.updatedAt];
        var updDateObj = rawUpd ? new Date(rawUpd) : null;
        var updIso = (updDateObj && !isNaN(updDateObj.getTime())) ? updDateObj.toISOString() : '';
        var rawAgentStr = String(pr[pcMap.agent] || '').trim();
        var pcItem = {
          id: pcId,
          leadId: String(pr[pcMap.leadId] || '').trim(),
          customerName: pcName,
          phone: pcPhone,
          assignedAgentName: (!rawAgentStr || rawAgentStr.toLowerCase() === 'unassigned') ? null : rawAgentStr,
          confirmedDate: confYmd,
          renewalDate: renYmd,
          renewalStatus: String(pr[pcMap.renewalStatus] || 'Active').trim(),
          updatedAt: updIso
        };
        if (pcMap.pkg >= 0) {
          pcItem.packageName = sanitizePaidPackageName_(pr[pcMap.pkg]);
        }
        if (pcMap.notes >= 0) {
          pcItem.notes = String(pr[pcMap.notes] || '').trim();
        }
        paidCustomers.push(pcItem);
      }
    }

    return jsonOut_({
      ok: true,
      scope: todayOnly ? 'today' : 'all',
      date: targetDate,
      leads: leads,
      callLogs: callLogs,
      contentPosts: contentPosts,
      paidCustomers: paidCustomers,
      syncedAt: new Date().toISOString()
    });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    if (payload.event === 'CONNECT_CHECK') {
      return jsonOut_({ ok: true, connected: true, syncedAt: new Date().toISOString() });
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetsByName = buildSheetsMap_(ss);
    var sessionCache = new Map();

    // Ensure core tabs exist (cached in sheetsByName)
    var masterSheet = getOrCreateSheetCached_(ss, sheetsByName, 'Master_Data', MASTER_HEADERS);
    var logsSheet = getOrCreateSheetCached_(ss, sheetsByName, 'Agent_Logs', [
      'Log ID', 'Lead ID', 'Customer Name', 'Phone', 'Agent',
      'Previous Status', 'New Status', 'Call Notes', 'Follow-up At', 'Timestamp'
    ]);
    var summarySheet = getOrCreateSheetCached_(ss, sheetsByName, 'Daily_Summary', [
      'Date', 'Total Leads', 'Calls Made Today', 'Order Confirmed',
      'Interested', 'Conversion Rate (%)', 'Last Synced At'
    ]);
    var kawsarSheet = getOrCreateSheetCached_(ss, sheetsByName, 'Kawsar_Posts_Log', KAWSAR_POST_HEADERS);
    ensureKawsarPostHeaders_(kawsarSheet);
    var paidSheet = getOrCreateSheetCached_(ss, sheetsByName, 'Paid_Customers', PAID_CUSTOMER_HEADERS);
    ensurePaidCustomerHeaders_(paidSheet);
    var deletedPaidSet = buildDeletedPaidSet_(payload);
    var finalSummarySheet = getOrCreateSheetCached_(ss, sheetsByName, 'Final_Daily_Summary', [
      'Date', 'Total Calls', 'Orders Confirmed', 'Farhan Leads', 'Naim Leads',
      'Kawsar FB Links', 'Kawsar Web Links', 'Kawsar TikTok Links', 'Kawsar IG Links', 'Kawsar Twitter Links',
      'Agent Breakdown (Calls/Orders)', 'Last Synced At'
    ]);

    // Collect dynamic agent and collector names from defaults, Team Management payload, and records
    var extraAgents = Array.isArray(payload.agentNames) ? payload.agentNames.slice() : [];
    var extraCollectors = Array.isArray(payload.collectorNames) ? payload.collectorNames.slice() : [];
    if (payload.lead) {
      if (payload.lead.assignedAgentName) extraAgents.push(payload.lead.assignedAgentName);
      if (payload.lead.collectorName) extraCollectors.push(payload.lead.collectorName);
    }
    if (Array.isArray(payload.leads)) {
      for (var al = 0; al < payload.leads.length; al++) {
        if (payload.leads[al] && payload.leads[al].assignedAgentName) extraAgents.push(payload.leads[al].assignedAgentName);
        if (payload.leads[al] && payload.leads[al].collectorName) extraCollectors.push(payload.leads[al].collectorName);
      }
    }
    if (payload.paidCustomer && payload.paidCustomer.assignedAgentName) {
      extraAgents.push(payload.paidCustomer.assignedAgentName);
    }
    if (Array.isArray(payload.paidCustomers)) {
      for (var ap = 0; ap < payload.paidCustomers.length; ap++) {
        if (payload.paidCustomers[ap] && payload.paidCustomers[ap].assignedAgentName) {
          extraAgents.push(payload.paidCustomers[ap].assignedAgentName);
        }
      }
    }

    var allAgentNames = collectUniqueNames_(AGENT_NAMES, extraAgents);
    var allCollectorNames = collectUniqueNames_(COLLECTOR_NAMES, extraCollectors);

    // Ensure all dedicated Agent_<Name>, Paid_<Name>, and Collector_<Name> tabs exist
    var agentSheets = {};
    var paidAgentSheets = {};
    for (var i = 0; i < allAgentNames.length; i++) {
      var name = allAgentNames[i];
      var agentTab = getAgentTabName_(name);
      agentSheets[agentTab] = getOrCreateSheetCached_(ss, sheetsByName, agentTab, AGENT_TAB_HEADERS);
      var paidAgentTab = getPaidAgentTabName_(name);
      paidAgentSheets[paidAgentTab] = getOrCreateSheetCached_(ss, sheetsByName, paidAgentTab, PAID_AGENT_TAB_HEADERS);
    }

    var collectorSheets = {};
    for (var ci0 = 0; ci0 < allCollectorNames.length; ci0++) {
      var cName = allCollectorNames[ci0];
      var collectorTab = getCollectorTabName_(cName);
      collectorSheets[collectorTab] = getOrCreateSheetCached_(ss, sheetsByName, collectorTab, COLLECTOR_TAB_HEADERS);
    }

    // Read Master_Data ONCE into session memory when needed for lookup or upsert
    var deletedLeadSet = buildDeletedLeadSet_(payload);
    var isBatchEvent =
      payload.event === 'FULL_SYNC' ||
      payload.event === 'TEST_SYNC' ||
      payload.event === 'LEADS_BATCH_UPSERT';
    var masterSession = getSheetSession_(sessionCache, masterSheet, MASTER_HEADERS.length, 'lead');
    var leadLookup = buildLeadLookupMapsFromSession_(masterSession, payload.leads, payload.lead);

    if (isBatchEvent) {
      if (deletedLeadSet.size > 0) {
        deleteLeadAcrossAllSheets_(ss, sheetsByName, sessionCache, masterSheet, null, deletedLeadSet);
      }
      var syncedPaidLeadKeys = new Map();
      var leadsList = Array.isArray(payload.leads) ? payload.leads : [];
      var desiredAgentTabById = new Map();
      var leadsByAgentTab = new Map();
      var desiredCollectorTabById = new Map();
      var leadsByCollectorTab = new Map();
      var confirmedLeadsForPaid = [];

      // 1. Upsert all leads into Master_Data session + bucket by Agent & Collector tabs
      for (var li = 0; li < leadsList.length; li++) {
        var leadItem = leadsList[li];
        if (!leadItem || !leadItem.id) continue;
        if (isLeadRecordDeleted_(leadItem, deletedLeadSet)) continue;
        var leadIdStr = String(leadItem.id).trim();
        upsertSessionRowById_(masterSession, leadIdStr, formatMasterRow(leadItem), '');

        var targetAgent = leadItem.assignedAgentName ? String(leadItem.assignedAgentName).trim() : '';
        var targetAgentTab = (targetAgent && targetAgent.toLowerCase() !== 'unassigned')
          ? getAgentTabName_(targetAgent)
          : '';
        desiredAgentTabById.set(leadIdStr, targetAgentTab);
        if (targetAgentTab) {
          if (!agentSheets[targetAgentTab]) {
            agentSheets[targetAgentTab] = getOrCreateSheetCached_(ss, sheetsByName, targetAgentTab, AGENT_TAB_HEADERS);
          }
          if (!leadsByAgentTab.has(targetAgentTab)) leadsByAgentTab.set(targetAgentTab, []);
          leadsByAgentTab.get(targetAgentTab).push(leadItem);
        }

        var rawCollector = leadItem.collectorName ? String(leadItem.collectorName).trim() : '';
        var targetCollectorTab = rawCollector ? getCollectorTabName_(rawCollector) : '';
        desiredCollectorTabById.set(leadIdStr, targetCollectorTab);
        if (targetCollectorTab) {
          if (!collectorSheets[targetCollectorTab]) {
            collectorSheets[targetCollectorTab] = getOrCreateSheetCached_(ss, sheetsByName, targetCollectorTab, COLLECTOR_TAB_HEADERS);
          }
          if (!leadsByCollectorTab.has(targetCollectorTab)) leadsByCollectorTab.set(targetCollectorTab, []);
          leadsByCollectorTab.get(targetCollectorTab).push(leadItem);
        }

        if (leadItem.status === 'Order Confirmed') {
          confirmedLeadsForPaid.push(leadItem);
        }
      }

      // 2. Sync each Agent_* tab ONCE in memory (O(1) lookup, batched flush)
      if (leadsList.length > 0) {
        sheetsByName.forEach(function(sheet, sheetName) {
          if (sheetName.indexOf('Agent_') !== 0 || sheetName === 'Agent_Logs') return;
          var aSession = getSheetSession_(sessionCache, sheet, AGENT_TAB_HEADERS.length, 'lead');
          var rowsForAgent = leadsByAgentTab.get(sheetName) || [];
          for (var ai = 0; ai < rowsForAgent.length; ai++) {
            var aLead = rowsForAgent[ai];
            upsertSessionRowById_(
              aSession,
              String(aLead.id).trim(),
              formatAgentRow(aLead),
              normalizePhoneKey_(aLead.phone || aLead.rawPhone)
            );
          }
          desiredAgentTabById.forEach(function(targetTab, lId) {
            if (targetTab !== sheetName && aSession.idIndex.has(lId)) {
              deleteSessionRowsByKeys_(aSession, [lId], '');
            }
          });
        });

        // 3. Sync each Collector_* tab ONCE in memory
        sheetsByName.forEach(function(sheet, sheetName) {
          if (sheetName.indexOf('Collector_') !== 0) return;
          var cSession = getSheetSession_(sessionCache, sheet, COLLECTOR_TAB_HEADERS.length, 'lead');
          var rowsForCollector = leadsByCollectorTab.get(sheetName) || [];
          for (var cli = 0; cli < rowsForCollector.length; cli++) {
            var cLead = rowsForCollector[cli];
            upsertSessionRowById_(
              cSession,
              String(cLead.id).trim(),
              formatCollectorRow(cLead),
              normalizePhoneKey_(cLead.phone || cLead.rawPhone)
            );
          }
          desiredCollectorTabById.forEach(function(targetTab, lId) {
            if (targetTab !== sheetName && cSession.idIndex.has(lId)) {
              deleteSessionRowsByKeys_(cSession, [lId], '');
            }
          });
        });
      }

      // 4. Batch upsert Agent_Logs ONCE
      if (Array.isArray(payload.callLogs) && payload.callLogs.length > 0) {
        var logsSession = getSheetSession_(sessionCache, logsSheet, 10, 'callLog');
        for (var ci = 0; ci < payload.callLogs.length; ci++) {
          upsertCallLogInSession_(logsSession, payload.callLogs[ci]);
        }
      }

      // 5. Batch upsert Kawsar_Posts_Log ONCE
      if (Array.isArray(payload.contentPosts) && payload.contentPosts.length > 0) {
        var kawsarSession = getSheetSession_(sessionCache, kawsarSheet, KAWSAR_POST_HEADERS.length, 'id');
        for (var pi = 0; pi < payload.contentPosts.length; pi++) {
          var cp = payload.contentPosts[pi];
          upsertSessionRowById_(kawsarSession, String(cp.id || '').trim(), formatKawsarPostRow_(cp), '');
        }
      }

      // 6. Batch upsert Paid_Customers & Paid_<AgentName> tabs ONCE (respecting deleted tombstones)
      var paidList = [];
      if (Array.isArray(payload.paidCustomers)) {
        for (var rpi = 0; rpi < payload.paidCustomers.length; rpi++) {
          var candPaid = payload.paidCustomers[rpi];
          if (candPaid && !isPaidRecordDeleted_(candPaid, deletedPaidSet)) {
            paidList.push(candPaid);
          }
        }
      }
      for (var pki = 0; pki < paidList.length; pki++) {
        var pkItem = paidList[pki];
        if (!pkItem) continue;
        if (pkItem.leadId) syncedPaidLeadKeys.set(String(pkItem.leadId).trim(), true);
        if (pkItem.phone) {
          var pkPhone = normalizePhoneKey_(pkItem.phone);
          if (pkPhone) syncedPaidLeadKeys.set('PH:' + pkPhone, true);
        }
      }
      for (var oli = 0; oli < confirmedLeadsForPaid.length; oli++) {
        var ol = confirmedLeadsForPaid[oli];
        var olIdStr = String(ol.id || '').trim();
        var olPhoneKey = ol.phone ? ('PH:' + normalizePhoneKey_(ol.phone)) : '';
        if (
          !isPaidRecordDeleted_({ id: 'PC-' + olIdStr, leadId: olIdStr, phone: ol.phone || ol.rawPhone }, deletedPaidSet) &&
          !syncedPaidLeadKeys.has(olIdStr) &&
          (!olPhoneKey || !syncedPaidLeadKeys.has(olPhoneKey))
        ) {
          paidList.push(buildPaidCustomerFromLead_(ol));
        }
      }

      var paidSession = getSheetSession_(sessionCache, paidSheet, PAID_CUSTOMER_HEADERS.length, 'paid');
      if (deletedPaidSet.size > 0) {
        deletePaidCustomerAcrossAllSheets_(ss, sheetsByName, sessionCache, paidSheet, null, deletedPaidSet);
      }
      if (paidList.length > 0) {
        syncPaidBatchAcrossPaidTabs_(
          ss,
          sheetsByName,
          sessionCache,
          paidSession,
          paidAgentSheets,
          paidList,
          leadLookup
        );
      }

      // 7. In-memory Backfill across Collector_* and Paid_* tabs (only on final FULL_SYNC / TEST_SYNC)
      if (!payload.skipBackfill && (payload.event === 'FULL_SYNC' || payload.event === 'TEST_SYNC')) {
        backfillCollectorTabsFromMasterSession_(ss, sheetsByName, sessionCache, collectorSheets, masterSession);
        backfillPaidAgentTabsFromPaidSession_(ss, sheetsByName, sessionCache, paidAgentSheets, paidSession, leadLookup, deletedPaidSet);
      }
    } else if ((payload.event === 'LEAD_UPSERT' || payload.event === 'LEAD_UPDATED') && payload.lead) {
      if (!isLeadRecordDeleted_(payload.lead, deletedLeadSet)) {
        var prevLeadPhoneKey = payload.previousPhone ? normalizePhoneKey_(payload.previousPhone) : '';
        upsertSessionRowById_(masterSession, String(payload.lead.id || '').trim(), formatMasterRow(payload.lead), prevLeadPhoneKey);
        syncLeadAcrossAgentTabsSession_(ss, sheetsByName, sessionCache, agentSheets, payload.lead, prevLeadPhoneKey);
        syncLeadAcrossCollectorTabsSession_(ss, sheetsByName, sessionCache, collectorSheets, payload.lead, prevLeadPhoneKey);
        var leadPaid = payload.paidCustomer || (payload.lead.status === 'Order Confirmed' ? buildPaidCustomerFromLead_(payload.lead) : null);
        if (leadPaid && !isPaidRecordDeleted_(leadPaid, deletedPaidSet)) {
          var paidSessionL = getSheetSession_(sessionCache, paidSheet, PAID_CUSTOMER_HEADERS.length, 'paid');
          syncPaidBatchAcrossPaidTabs_(ss, sheetsByName, sessionCache, paidSessionL, paidAgentSheets, [leadPaid], leadLookup, prevLeadPhoneKey);
        }
      }
    } else if (payload.event === 'LEAD_DELETED') {
      deleteLeadAcrossAllSheets_(
        ss,
        sheetsByName,
        sessionCache,
        masterSheet,
        payload.deletedLead || null,
        deletedLeadSet
      );
    } else if (payload.event === 'CALL_LOGGED' && payload.callLog) {
      if (payload.lead) {
        upsertSessionRowById_(masterSession, String(payload.lead.id || '').trim(), formatMasterRow(payload.lead), '');
        syncLeadAcrossAgentTabsSession_(ss, sheetsByName, sessionCache, agentSheets, payload.lead);
        syncLeadAcrossCollectorTabsSession_(ss, sheetsByName, sessionCache, collectorSheets, payload.lead);
      }
      var logsSessionSingle = getSheetSession_(sessionCache, logsSheet, 10, 'callLog');
      upsertCallLogInSession_(logsSessionSingle, payload.callLog);
      var callPaid = payload.paidCustomer || (payload.lead && payload.lead.status === 'Order Confirmed' ? buildPaidCustomerFromLead_(payload.lead) : null);
      if (callPaid && !isPaidRecordDeleted_(callPaid, deletedPaidSet)) {
        var paidSessionC = getSheetSession_(sessionCache, paidSheet, PAID_CUSTOMER_HEADERS.length, 'paid');
        syncPaidBatchAcrossPaidTabs_(ss, sheetsByName, sessionCache, paidSessionC, paidAgentSheets, [callPaid], leadLookup);
      }
    } else if (payload.event === 'KAWSAR_POST_LOGGED' && payload.post) {
      var p = payload.post;
      var kawsarSessionSingle = getSheetSession_(sessionCache, kawsarSheet, KAWSAR_POST_HEADERS.length, 'id');
      upsertSessionRowById_(kawsarSessionSingle, String(p.id || '').trim(), formatKawsarPostRow_(p), '');
    } else if (payload.event === 'PAID_CUSTOMER_UPSERT' && payload.paidCustomer) {
      var paidSessionP = getSheetSession_(sessionCache, paidSheet, PAID_CUSTOMER_HEADERS.length, 'paid');
      var prevPaidPhoneKey = payload.previousPhone ? normalizePhoneKey_(payload.previousPhone) : '';
      syncPaidBatchAcrossPaidTabs_(ss, sheetsByName, sessionCache, paidSessionP, paidAgentSheets, [payload.paidCustomer], leadLookup, prevPaidPhoneKey);
    } else if (payload.event === 'PAID_CUSTOMER_DELETED') {
      deletePaidCustomerAcrossAllSheets_(
        ss,
        sheetsByName,
        sessionCache,
        paidSheet,
        payload.deletedPaidCustomer || null,
        deletedPaidSet
      );
    }

    if (payload.dailySummary) {
      var summarySession = getSheetSession_(sessionCache, summarySheet, 7, 'id');
      upsertSessionRowById_(summarySession, String(payload.dailySummary.date || '').trim(), [
        payload.dailySummary.date,
        payload.dailySummary.totalLeads,
        payload.dailySummary.callsMadeToday,
        payload.dailySummary.orderConfirmedCount,
        payload.dailySummary.interestedCount,
        payload.dailySummary.conversionRate,
        new Date().toISOString()
      ], '');
    }

    if (payload.finalDailySummary) {
      var f = payload.finalDailySummary;
      var farhanCount = 0;
      var naimCount = 0;
      if (Array.isArray(f.collectors)) {
        for (var colIdx = 0; colIdx < f.collectors.length; colIdx++) {
          if (f.collectors[colIdx].collectorName === 'Farhan') farhanCount = f.collectors[colIdx].leadsCollectedOnDate;
          if (f.collectors[colIdx].collectorName === 'Naim') naimCount = f.collectors[colIdx].leadsCollectedOnDate;
        }
      }
      var agentSummaryStr = Array.isArray(f.agents)
        ? f.agents.map(function(a) { return a.agentName + ':' + a.callsMade + '/' + a.orderConfirmed; }).join(' | ')
        : '';
      var finalHeaders = [
        'Date', 'Total Calls', 'Orders Confirmed', 'Farhan Leads', 'Naim Leads',
        'Kawsar FB Links', 'Kawsar Web Links', 'Kawsar TikTok Links', 'Kawsar IG Links', 'Kawsar Twitter Links',
        'Agent Breakdown (Calls/Orders)', 'Last Synced At'
      ];
      if (finalSummarySheet.getLastColumn() < finalHeaders.length) {
        finalSummarySheet.getRange(1, 1, 1, finalHeaders.length).setValues([finalHeaders]);
        finalSummarySheet.getRange(1, 1, 1, finalHeaders.length).setFontWeight('bold');
      }
      var finalSession = getSheetSession_(sessionCache, finalSummarySheet, finalHeaders.length, 'id');
      upsertSessionRowById_(finalSession, String(f.date || '').trim(), [
        f.date,
        f.agentTotals ? f.agentTotals.callsMade : 0,
        f.agentTotals ? f.agentTotals.orderConfirmed : 0,
        farhanCount,
        naimCount,
        f.kawsar ? f.kawsar.facebookLinks : 0,
        f.kawsar ? f.kawsar.websiteLinks : 0,
        f.kawsar ? (f.kawsar.tiktokLinks || 0) : 0,
        f.kawsar ? (f.kawsar.instagramLinks || 0) : 0,
        f.kawsar ? (f.kawsar.twitterLinks || 0) : 0,
        agentSummaryStr,
        new Date().toISOString()
      ], '');
    }

    commitAllSheetSessions_(sessionCache);
    return jsonOut_({ ok: true, syncedAt: new Date().toISOString() });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.toString() });
  }
}

function buildSheetsMap_(ss) {
  var map = new Map();
  var list = ss.getSheets();
  for (var i = 0; i < list.length; i++) {
    map.set(list[i].getName(), list[i]);
  }
  return map;
}

function getOrCreateSheetCached_(ss, sheetsByName, name, headers) {
  var existing = sheetsByName.get(name);
  if (existing) return existing;
  var sheet = getOrCreateSheet(ss, name, headers);
  sheetsByName.set(name, sheet);
  return sheet;
}

function pushToMapArray_(map, key, idx) {
  if (!key) return;
  var arr = map.get(key);
  if (arr) {
    if (arr.indexOf(idx) === -1) arr.push(idx);
  } else {
    map.set(key, [idx]);
  }
}

function findLiveIndex_(map, key, deletedIndices) {
  if (!key) return -1;
  var arr = map.get(key);
  if (!arr) return -1;
  for (var i = 0; i < arr.length; i++) {
    if (!deletedIndices.has(arr[i])) return arr[i];
  }
  return -1;
}

function getSheetSession_(sessionCache, sheet, colCount, indexMode) {
  var sheetName = sheet.getName();
  if (sessionCache.has(sheetName)) {
    return sessionCache.get(sheetName);
  }
  var lastRow = sheet.getLastRow();
  var rows = [];
  if (lastRow > 1) {
    rows = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  }
  var session = {
    sheet: sheet,
    colCount: colCount,
    indexMode: indexMode || 'id',
    rows: rows,
    initialCount: rows.length,
    dirtyIndices: new Set(),
    deletedIndices: new Set(),
    idIndex: new Map(),
    phoneIndex: new Map(),
    dailyLeadIndex: new Map(),
    dailyPhoneIndex: new Map()
  };

  for (var i = 0; i < rows.length; i++) {
    indexSessionRow_(session, i, rows[i]);
  }

  sessionCache.set(sheetName, session);
  return session;
}

function indexSessionRow_(session, idx, r) {
  var idVal = String(r[0] || '').trim();
  if (idVal) pushToMapArray_(session.idIndex, idVal, idx);
  if (session.indexMode === 'lead') {
    var pkLead = normalizePhoneKey_(r[2]);
    if (pkLead) pushToMapArray_(session.phoneIndex, pkLead, idx);
  } else if (session.indexMode === 'paidAgent' || session.indexMode === 'paid') {
    var pkPaid = normalizePhoneKey_(r[3]);
    if (pkPaid) pushToMapArray_(session.phoneIndex, pkPaid, idx);
  } else if (session.indexMode === 'callLog') {
    var rowYmd = toYmd_(r[9]);
    var rowAgent = String(r[4] || '').trim().toLowerCase();
    var rowLeadId = String(r[1] || '').trim();
    var rowPhone = normalizePhoneKey_(r[3]);
    if (rowYmd && rowAgent) {
      if (rowLeadId) pushToMapArray_(session.dailyLeadIndex, rowYmd + '|' + rowAgent + '|' + rowLeadId, idx);
      if (rowPhone) pushToMapArray_(session.dailyPhoneIndex, rowYmd + '|' + rowAgent + '|' + rowPhone, idx);
    }
  }
}

function upsertSessionRowById_(session, id, rowData, extraPhoneKey) {
  var cleanId = String(id || '').trim();
  var matchIdx = cleanId ? findLiveIndex_(session.idIndex, cleanId, session.deletedIndices) : -1;
  if (matchIdx === -1 && extraPhoneKey) {
    matchIdx = findLiveIndex_(session.phoneIndex, extraPhoneKey, session.deletedIndices);
  }
  if (matchIdx !== -1) {
    session.rows[matchIdx] = rowData;
    if (matchIdx < session.initialCount) {
      session.dirtyIndices.add(matchIdx);
    }
    indexSessionRow_(session, matchIdx, rowData);
    return matchIdx;
  }
  var newIdx = session.rows.length;
  session.rows.push(rowData);
  indexSessionRow_(session, newIdx, rowData);
  return newIdx;
}

function deleteSessionRowsByKeys_(session, targetIds, targetPhoneKey) {
  if (Array.isArray(targetIds)) {
    for (var i = 0; i < targetIds.length; i++) {
      var k = String(targetIds[i] || '').trim();
      if (!k) continue;
      var idArr = session.idIndex.get(k);
      if (idArr) {
        for (var j = 0; j < idArr.length; j++) {
          var idx = idArr[j];
          session.deletedIndices.add(idx);
          session.dirtyIndices.delete(idx);
        }
      }
    }
  }
  if (targetPhoneKey) {
    var phArr = session.phoneIndex.get(targetPhoneKey);
    if (phArr) {
      for (var p = 0; p < phArr.length; p++) {
        var pIdx = phArr[p];
        session.deletedIndices.add(pIdx);
        session.dirtyIndices.delete(pIdx);
      }
    }
  }
}

function upsertCallLogInSession_(session, c) {
  var cId = String(c.id || '').trim();
  var callYmd = toYmd_(c.timestamp);
  var targetPhone = normalizePhoneKey_(c.phone);
  var targetLeadId = String(c.leadId || '').trim();
  var targetAgent = String(c.agentName || '').trim().toLowerCase();

  var matchIdx = cId ? findLiveIndex_(session.idIndex, cId, session.deletedIndices) : -1;
  if (matchIdx === -1 && callYmd && targetAgent) {
    if (targetLeadId) {
      matchIdx = findLiveIndex_(session.dailyLeadIndex, callYmd + '|' + targetAgent + '|' + targetLeadId, session.deletedIndices);
    }
    if (matchIdx === -1 && targetPhone) {
      matchIdx = findLiveIndex_(session.dailyPhoneIndex, callYmd + '|' + targetAgent + '|' + targetPhone, session.deletedIndices);
    }
  }

  if (matchIdx !== -1) {
    var existing = session.rows[matchIdx];
    var preservedRow = existing[0] === c.id
      ? [c.id, c.leadId, c.customerName, "'" + c.phone, c.agentName, c.previousStatus, c.newStatus, c.notes || '', c.followUpAt || '', c.timestamp]
      : [existing[0] || c.id, c.leadId, c.customerName, "'" + c.phone, c.agentName, existing[5] || c.previousStatus, c.newStatus, c.notes || '', c.followUpAt || '', c.timestamp];
    session.rows[matchIdx] = preservedRow;
    if (matchIdx < session.initialCount) {
      session.dirtyIndices.add(matchIdx);
    }
    indexSessionRow_(session, matchIdx, preservedRow);
    return;
  }

  var rowData = [
    c.id, c.leadId, c.customerName, "'" + c.phone, c.agentName,
    c.previousStatus, c.newStatus, c.notes || '', c.followUpAt || '', c.timestamp
  ];
  var newIdx = session.rows.length;
  session.rows.push(rowData);
  indexSessionRow_(session, newIdx, rowData);
}

function commitSheetSession_(session) {
  var sheet = session.sheet;
  var colCount = session.colCount;

  // 1. Batch contiguous updates to existing rows
  if (session.dirtyIndices.size > 0) {
    var dirtyList = [];
    session.dirtyIndices.forEach(function(idx) {
      if (idx >= 0 && idx < session.initialCount && !session.deletedIndices.has(idx)) {
        dirtyList.push(idx);
      }
    });
    dirtyList.sort(function(a, b) { return a - b; });
    var u = 0;
    while (u < dirtyList.length) {
      var runStart = dirtyList[u];
      var runEnd = runStart;
      while (u + 1 < dirtyList.length && dirtyList[u + 1] === runEnd + 1) {
        u++;
        runEnd = dirtyList[u];
      }
      var batchRows = [];
      for (var ri = runStart; ri <= runEnd; ri++) {
        batchRows.push(session.rows[ri]);
      }
      sheet.getRange(runStart + 2, 1, batchRows.length, colCount).setValues(batchRows);
      u++;
    }
  }

  // 2. Batch contiguous deletions in descending row order
  if (session.deletedIndices.size > 0) {
    var delList = [];
    session.deletedIndices.forEach(function(idx) {
      if (idx >= 0 && idx < session.initialCount) {
        delList.push(idx);
      }
    });
    delList.sort(function(a, b) { return b - a; });
    var d = 0;
    while (d < delList.length) {
      var highIdx = delList[d];
      var lowIdx = highIdx;
      while (d + 1 < delList.length && delList[d + 1] === lowIdx - 1) {
        d++;
        lowIdx = delList[d];
      }
      var delCount = highIdx - lowIdx + 1;
      if (typeof sheet.deleteRows === 'function') {
        sheet.deleteRows(lowIdx + 2, delCount);
      } else {
        for (var k = delCount - 1; k >= 0; k--) {
          sheet.deleteRow(lowIdx + 2 + k);
        }
      }
      d++;
    }
  }

  // 3. Single batch append of all new non-deleted rows
  var toAppend = [];
  for (var ai = session.initialCount; ai < session.rows.length; ai++) {
    if (!session.deletedIndices.has(ai)) {
      toAppend.push(session.rows[ai]);
    }
  }
  if (toAppend.length > 0) {
    var appendStartRow = sheet.getLastRow() + 1;
    sheet.getRange(appendStartRow, 1, toAppend.length, colCount).setValues(toAppend);
  }
}

function commitAllSheetSessions_(sessionCache) {
  sessionCache.forEach(function(session) {
    commitSheetSession_(session);
  });
}

function buildLeadLookupMapsFromSession_(masterSession, payloadLeads, singleLead) {
  var byId = new Map();
  var byPhone = new Map();
  if (masterSession && Array.isArray(masterSession.rows)) {
    var mRows = masterSession.rows;
    for (var i = 0; i < mRows.length; i++) {
      if (masterSession.deletedIndices && masterSession.deletedIndices.has(i)) continue;
      var mr = mRows[i];
      var mObj = {
        id: String(mr[0] || '').trim(),
        customerName: String(mr[1] || '').trim(),
        phone: String(mr[2] || '').replace(/^'+/, '').trim(),
        facebookLink: String(mr[3] || '').trim(),
        collectorName: String(mr[4] || '').trim(),
        assignedAgentName: String(mr[5] || '').trim(),
        status: String(mr[6] || '').trim(),
        notes: String(mr[8] || '').trim(),
        updatedAt: mr[9] || '',
        createdAt: mr[10] || ''
      };
      if (mObj.id) byId.set(mObj.id, mObj);
      var pKey = normalizePhoneKey_(mObj.phone);
      if (pKey) byPhone.set(pKey, mObj);
    }
  }
  var list = [];
  if (Array.isArray(payloadLeads)) list = list.concat(payloadLeads);
  if (singleLead) list.push(singleLead);
  for (var j = 0; j < list.length; j++) {
    var l = list[j];
    if (!l) continue;
    if (l.id) byId.set(String(l.id).trim(), l);
    var lpKey = normalizePhoneKey_(l.phone || l.rawPhone);
    if (lpKey) byPhone.set(lpKey, l);
  }
  return { byId: byId, byPhone: byPhone };
}

function buildLeadLookupMaps_(masterSheet, payloadLeads, singleLead) {
  var tempCache = new Map();
  var session = masterSheet
    ? getSheetSession_(tempCache, masterSheet, Math.max(11, masterSheet.getLastColumn()), 'id')
    : null;
  return buildLeadLookupMapsFromSession_(session, payloadLeads, singleLead);
}

function buildPaidCustomerFromLead_(l) {
  var confDate = getDhakaTodayYmd_();
  return {
    id: 'PC-' + String(l.id || ''),
    leadId: String(l.id || ''),
    customerName: l.customerName || '',
    phone: l.phone || l.rawPhone || '',
    facebookLink: l.facebookLink || '',
    collectorName: l.collectorName || 'Unknown',
    assignedAgentName: l.assignedAgentName || '',
    confirmedDate: confDate,
    renewalDate: '',
    renewalStatus: 'Active',
    amountOrPackage: '1-Month Package',
    notes: l.lastCallNotes || l.notes || '',
    updatedAt: l.updatedAt || new Date().toISOString()
  };
}

function findMatchingLeadForPaid_(pc, leadLookup) {
  if (!pc || !leadLookup) return null;
  var leadId = String(pc.leadId || '').trim();
  if (!leadId && pc.id && String(pc.id).indexOf('PC-') === 0) {
    leadId = String(pc.id).slice(3);
  }
  if (leadId && leadLookup.byId) {
    var byIdHit = typeof leadLookup.byId.get === 'function'
      ? leadLookup.byId.get(leadId)
      : leadLookup.byId[leadId];
    if (byIdHit) return byIdHit;
  }
  var pKey = normalizePhoneKey_(pc.phone);
  if (pKey && leadLookup.byPhone) {
    var byPhoneHit = typeof leadLookup.byPhone.get === 'function'
      ? leadLookup.byPhone.get(pKey)
      : leadLookup.byPhone[pKey];
    if (byPhoneHit) return byPhoneHit;
  }
  return null;
}

function formatMasterRow(l) {
  var fallbackDate = Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyyy-MM-dd');
  var createdVal = l.createdAt || l.collectedDate || l.updatedAt || fallbackDate;
  return [
    l.id, l.customerName, "'" + l.phone, l.facebookLink, l.collectorName,
    l.assignedAgentName || 'Unassigned', l.status, l.followUpAt || '',
    l.lastCallNotes || l.notes || '', l.updatedAt || fallbackDate, createdVal
  ];
}

function formatAgentRow(l) {
  return [
    l.id, l.customerName, "'" + l.phone, l.facebookLink,
    l.status, l.followUpAt || '', l.lastCallNotes || l.notes || '',
    l.collectorName, l.updatedAt || Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyyy-MM-dd')
  ];
}

function formatCollectorRow(l) {
  var fallbackDate = Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyyy-MM-dd');
  return [
    l.id, l.customerName, "'" + l.phone, l.facebookLink,
    l.assignedAgentName || 'Unassigned', l.status, l.followUpAt || '',
    l.lastCallNotes || l.notes || '', l.collectorName || 'Unknown',
    l.updatedAt || fallbackDate, l.createdAt || l.collectedDate || l.updatedAt || fallbackDate
  ];
}

function formatPaidCustomerRow(pc) {
  var daysRemaining = 0;
  if (pc.renewalDate) {
    var todayStr = Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyyy-MM-dd');
    var tParts = todayStr.split('-');
    var rParts = String(pc.renewalDate).replace(/^'+/, '').split('-');
    if (rParts.length === 3) {
      var tMs = new Date(Number(tParts[0]), Number(tParts[1]) - 1, Number(tParts[2])).getTime();
      var rMs = new Date(Number(rParts[0]), Number(rParts[1]) - 1, Number(rParts[2])).getTime();
      daysRemaining = Math.round((rMs - tMs) / 86400000);
    }
  }
  return [
    pc.id,
    pc.leadId || '',
    pc.customerName,
    "'" + pc.phone,
    pc.assignedAgentName || 'Unassigned',
    "'" + (pc.confirmedDate || ''),
    "'" + (pc.renewalDate || ''),
    daysRemaining,
    pc.renewalStatus || 'Active',
    pc.updatedAt || new Date().toISOString(),
    sanitizePaidPackageName_(pc.packageName !== undefined ? pc.packageName : pc.amountOrPackage),
    pc.notes || ''
  ];
}

function formatPaidAgentRow_(pc, leadLookup) {
  var matchedLead = findMatchingLeadForPaid_(pc, leadLookup);
  var rowId = String(pc.id || (pc.leadId ? ('PC-' + pc.leadId) : '')).trim();
  var rawDate = String(pc.confirmedDate || pc.date || '').replace(/^'+/, '').trim();
  if (!rawDate && matchedLead) {
    rawDate = toYmd_(matchedLead.createdAt || matchedLead.collectedDate || '');
  }
  if (!rawDate) rawDate = getDhakaTodayYmd_();
  var customerVal = String(pc.customerName || (matchedLead && matchedLead.customerName) || '').trim();
  var rawPhone = String(pc.phone || (matchedLead && (matchedLead.phone || matchedLead.rawPhone)) || '').replace(/^'+/, '').trim();
  var canonicalPhone = normalizeBdPhone_(rawPhone) || rawPhone;
  var fbLink = String(pc.facebookLink || (matchedLead && matchedLead.facebookLink) || '').trim();
  var collector = String(pc.collectorName || (matchedLead && matchedLead.collectorName) || 'Unknown').trim();
  var agent = String(pc.assignedAgentName || (matchedLead && matchedLead.assignedAgentName) || 'Unassigned').trim();
  var cleanRenewal = String(pc.renewalDate || '').replace(/^'+/, '').trim();
  var explicitPkg = sanitizePaidPackageName_(pc.packageName !== undefined ? pc.packageName : (pc.amountOrPackage || pc.amount));
  var pkgVal = explicitPkg || (cleanRenewal ? ('1-Month Package (Renewal: ' + cleanRenewal + ')') : '1-Month Package');
  var notesVal = String(pc.notes || (matchedLead && (matchedLead.lastCallNotes || matchedLead.notes)) || '').trim();
  var updatedVal = pc.updatedAt || new Date().toISOString();
  return [
    rowId,
    "'" + rawDate,
    customerVal,
    canonicalPhone ? ("'" + canonicalPhone) : '',
    fbLink,
    collector,
    agent,
    pkgVal,
    notesVal,
    updatedVal
  ];
}

function buildPaidKeys_(pc) {
  var targetId = String(pc.id || '').trim();
  var targetLeadId = String(pc.leadId || '').trim();
  if (!targetLeadId && targetId.indexOf('PC-') === 0 && targetId.indexOf('PC-MAN-') !== 0) {
    targetLeadId = targetId.slice(3);
  }
  var keys = [];
  if (targetId) keys.push(targetId);
  if (targetLeadId) {
    keys.push(targetLeadId);
    keys.push('PC-' + targetLeadId);
  }
  var targetPhoneKey = normalizePhoneKey_(pc.phone);
  return { keys: keys, phoneKey: targetPhoneKey };
}

function upsertPaidAgentSessionRow_(session, pc, rowData, prevPhoneKey) {
  var info = buildPaidKeys_(pc);
  var matchIdx = -1;
  for (var i = 0; i < info.keys.length; i++) {
    matchIdx = findLiveIndex_(session.idIndex, info.keys[i], session.deletedIndices);
    if (matchIdx !== -1) break;
  }
  if (matchIdx === -1 && info.phoneKey) {
    matchIdx = findLiveIndex_(session.phoneIndex, info.phoneKey, session.deletedIndices);
  }
  if (matchIdx === -1 && prevPhoneKey) {
    matchIdx = findLiveIndex_(session.phoneIndex, prevPhoneKey, session.deletedIndices);
  }
  if (matchIdx !== -1) {
    session.rows[matchIdx] = rowData;
    if (matchIdx < session.initialCount) {
      session.dirtyIndices.add(matchIdx);
    }
    indexSessionRow_(session, matchIdx, rowData);
    return;
  }
  var newIdx = session.rows.length;
  session.rows.push(rowData);
  indexSessionRow_(session, newIdx, rowData);
}

function syncPaidBatchAcrossPaidTabs_(ss, sheetsByName, sessionCache, paidSession, paidAgentSheets, paidItems, leadLookup, prevPhoneKey) {
  var itemsByTab = new Map();
  var descriptors = [];
  for (var i = 0; i < paidItems.length; i++) {
    var pc = paidItems[i];
    if (!pc) continue;
    var itemPhoneKey = normalizePhoneKey_(pc.phone) || prevPhoneKey || '';
    upsertSessionRowById_(paidSession, String(pc.id || '').trim(), formatPaidCustomerRow(pc), prevPhoneKey || itemPhoneKey);
    var matchedLead = findMatchingLeadForPaid_(pc, leadLookup);
    var rawAgent = String(pc.assignedAgentName || (matchedLead && matchedLead.assignedAgentName) || '').trim();
    var targetAgent = (rawAgent && rawAgent.toLowerCase() !== 'unassigned') ? rawAgent : '';
    var targetTabName = targetAgent ? getPaidAgentTabName_(targetAgent) : '';
    if (targetTabName && !paidAgentSheets[targetTabName]) {
      paidAgentSheets[targetTabName] = getOrCreateSheetCached_(ss, sheetsByName, targetTabName, PAID_AGENT_TAB_HEADERS);
    }
    var rowData = formatPaidAgentRow_(pc, leadLookup);
    if (targetTabName) {
      if (!itemsByTab.has(targetTabName)) itemsByTab.set(targetTabName, []);
      itemsByTab.get(targetTabName).push({ pc: pc, rowData: rowData });
    }
    descriptors.push({
      keysInfo: buildPaidKeys_(pc),
      targetTabName: targetTabName,
      prevPhoneKey: prevPhoneKey || ''
    });
  }

  sheetsByName.forEach(function(sheet, sheetName) {
    if (!isPaidAgentTabName_(sheetName)) return;
    var pSession = getSheetSession_(sessionCache, sheet, PAID_AGENT_TAB_HEADERS.length, 'paidAgent');
    var targetList = itemsByTab.get(sheetName) || [];
    for (var ti = 0; ti < targetList.length; ti++) {
      upsertPaidAgentSessionRow_(pSession, targetList[ti].pc, targetList[ti].rowData, prevPhoneKey);
    }
    for (var di = 0; di < descriptors.length; di++) {
      var desc = descriptors[di];
      if (desc.targetTabName !== sheetName) {
        deleteSessionRowsByKeys_(pSession, desc.keysInfo.keys, desc.keysInfo.phoneKey);
        if (desc.prevPhoneKey) {
          deleteSessionRowsByKeys_(pSession, [], desc.prevPhoneKey);
        }
      }
    }
  });
}

function syncPaidCustomerAcrossPaidTabs_(ss, paidAgentSheets, pc, leadLookup) {
  if (!pc) return;
  var sheetsByName = buildSheetsMap_(ss);
  var sessionCache = new Map();
  var matchedLead = findMatchingLeadForPaid_(pc, leadLookup);
  var rawAgent = String(pc.assignedAgentName || (matchedLead && matchedLead.assignedAgentName) || '').trim();
  var targetAgent = (rawAgent && rawAgent.toLowerCase() !== 'unassigned') ? rawAgent : '';
  var targetTabName = targetAgent ? getPaidAgentTabName_(targetAgent) : '';
  if (targetTabName && !paidAgentSheets[targetTabName]) {
    paidAgentSheets[targetTabName] = getOrCreateSheetCached_(ss, sheetsByName, targetTabName, PAID_AGENT_TAB_HEADERS);
  }
  var rowData = formatPaidAgentRow_(pc, leadLookup);
  var keysInfo = buildPaidKeys_(pc);
  sheetsByName.forEach(function(sheet, sheetName) {
    if (!isPaidAgentTabName_(sheetName)) return;
    var pSession = getSheetSession_(sessionCache, sheet, PAID_AGENT_TAB_HEADERS.length, 'paidAgent');
    if (targetTabName && sheetName === targetTabName) {
      upsertPaidAgentSessionRow_(pSession, pc, rowData);
    } else {
      deleteSessionRowsByKeys_(pSession, keysInfo.keys, keysInfo.phoneKey);
    }
  });
  commitAllSheetSessions_(sessionCache);
}

function backfillCollectorTabsFromMasterSession_(ss, sheetsByName, sessionCache, collectorSheets, masterSession) {
  if (!masterSession || !Array.isArray(masterSession.rows) || masterSession.rows.length === 0) return;
  var grouped = new Map();
  var mRows = masterSession.rows;
  for (var i = 0; i < mRows.length; i++) {
    if (masterSession.deletedIndices && masterSession.deletedIndices.has(i)) continue;
    var mr = mRows[i];
    var id = String(mr[0] || '').trim();
    var collectorName = String(mr[4] || '').trim();
    if (!id || !collectorName || collectorName.toLowerCase() === 'unknown') continue;
    var tabName = getCollectorTabName_(collectorName);
    if (!collectorSheets[tabName]) {
      collectorSheets[tabName] = getOrCreateSheetCached_(ss, sheetsByName, tabName, COLLECTOR_TAB_HEADERS);
    }
    if (!grouped.has(tabName)) grouped.set(tabName, []);
    grouped.get(tabName).push([
      id,
      mr[1] || '',
      "'" + String(mr[2] || '').replace(/^'+/, ''),
      mr[3] || '',
      mr[5] || 'Unassigned',
      mr[6] || 'Pending',
      mr[7] || '',
      mr[8] || '',
      collectorName,
      mr[9] || '',
      mr[10] || ''
    ]);
  }
  grouped.forEach(function(rowsForTab, tabKey) {
    var cSheet = collectorSheets[tabKey];
    var cSession = getSheetSession_(sessionCache, cSheet, COLLECTOR_TAB_HEADERS.length, 'lead');
    for (var rIdx = 0; rIdx < rowsForTab.length; rIdx++) {
      var row = rowsForTab[rIdx];
      var rId = String(row[0] || '').trim();
      var rPk = normalizePhoneKey_(row[2]);
      if ((rId && findLiveIndex_(cSession.idIndex, rId, cSession.deletedIndices) !== -1) ||
          (rPk && findLiveIndex_(cSession.phoneIndex, rPk, cSession.deletedIndices) !== -1)) {
        continue;
      }
      var newIdx = cSession.rows.length;
      cSession.rows.push(row);
      indexSessionRow_(cSession, newIdx, row);
    }
  });
}

function buildDeletedPaidSet_(payload) {
  var set = new Set();
  if (!payload) return set;
  if (Array.isArray(payload.deletedPaidCustomerIds)) {
    for (var i = 0; i < payload.deletedPaidCustomerIds.length; i++) {
      var val = String(payload.deletedPaidCustomerIds[i] || '').trim();
      if (val) set.add(val);
    }
  }
  if (payload.deletedPaidCustomer) {
    var dc = payload.deletedPaidCustomer;
    if (dc.id) set.add(String(dc.id).trim());
    if (dc.leadId) {
      var lId = String(dc.leadId).trim();
      set.add(lId);
      set.add('PC-' + lId);
    }
    if (dc.phone) {
      var dcPhone = normalizePhoneKey_(dc.phone);
      if (dcPhone) set.add('SHEET-PC-' + dcPhone);
    }
  }
  return set;
}

function isPaidRecordDeleted_(pc, deletedSet) {
  if (!pc || !deletedSet || deletedSet.size === 0) return false;
  var idStr = String(pc.id || '').trim();
  var leadIdStr = String(pc.leadId || '').trim();
  if (!leadIdStr && idStr.indexOf('PC-') === 0 && idStr.indexOf('PC-MAN-') !== 0) {
    leadIdStr = idStr.slice(3);
  }
  if (idStr && deletedSet.has(idStr)) return true;
  if (leadIdStr && (deletedSet.has(leadIdStr) || deletedSet.has('PC-' + leadIdStr))) return true;
  var pk = normalizePhoneKey_(pc.phone);
  if (pk && deletedSet.has('SHEET-PC-' + pk)) return true;
  return false;
}

function deletePaidCustomerAcrossAllSheets_(ss, sheetsByName, sessionCache, paidSheet, deletedInfo, deletedSet) {
  var keysMap = new Map();
  var phoneKeysMap = new Map();
  if (deletedSet && typeof deletedSet.forEach === 'function') {
    deletedSet.forEach(function(k) {
      if (!k) return;
      keysMap.set(k, true);
      if (k.indexOf('SHEET-PC-') === 0) {
        var extracted = k.slice(9);
        if (/^\\d{8,15}$/.test(extracted)) {
          phoneKeysMap.set(extracted, true);
        }
      }
    });
  }
  var phoneKey = '';
  if (deletedInfo) {
    var dId = String(deletedInfo.id || '').trim();
    var dLeadId = String(deletedInfo.leadId || '').trim();
    if (!dLeadId && dId.indexOf('PC-') === 0 && dId.indexOf('PC-MAN-') !== 0) {
      dLeadId = dId.slice(3);
    }
    if (dId) keysMap.set(dId, true);
    if (dLeadId) {
      keysMap.set(dLeadId, true);
      keysMap.set('PC-' + dLeadId, true);
    }
    if (deletedInfo.phone) {
      phoneKey = normalizePhoneKey_(deletedInfo.phone);
      if (phoneKey) phoneKeysMap.set(phoneKey, true);
    }
  }
  var keyList = Array.from(keysMap.keys());
  var phoneKeyList = Array.from(phoneKeysMap.keys());
  if (keyList.length === 0 && phoneKeyList.length === 0) return;

  var paidSession = getSheetSession_(sessionCache, paidSheet, PAID_CUSTOMER_HEADERS.length, 'paid');
  deleteSessionRowsByKeys_(paidSession, keyList, '');
  // Also match Paid_Customers rows by Lead ID (col 1) or Phone (col 3) when deletedInfo/tombstone is present
  for (var prIdx = 0; prIdx < paidSession.rows.length; prIdx++) {
    if (paidSession.deletedIndices.has(prIdx)) continue;
    var prow = paidSession.rows[prIdx];
    var rowCustId = String(prow[0] || '').trim();
    var rowLeadId = String(prow[1] || '').trim();
    var rowPhoneKey = normalizePhoneKey_(prow[3]);
    if (
      keysMap.has(rowCustId) ||
      (rowLeadId && (keysMap.has(rowLeadId) || keysMap.has('PC-' + rowLeadId))) ||
      (rowPhoneKey && (phoneKeysMap.has(rowPhoneKey) || keysMap.has('SHEET-PC-' + rowPhoneKey)))
    ) {
      paidSession.deletedIndices.add(prIdx);
      paidSession.dirtyIndices.delete(prIdx);
    }
  }

  sheetsByName.forEach(function(sheet, sheetName) {
    if (!isPaidAgentTabName_(sheetName)) return;
    var pSession = getSheetSession_(sessionCache, sheet, PAID_AGENT_TAB_HEADERS.length, 'paidAgent');
    deleteSessionRowsByKeys_(pSession, keyList, phoneKey);
    for (var pkIdx = 0; pkIdx < phoneKeyList.length; pkIdx++) {
      if (phoneKeyList[pkIdx] !== phoneKey) {
        deleteSessionRowsByKeys_(pSession, [], phoneKeyList[pkIdx]);
      }
    }
  });
}

function backfillPaidAgentTabsFromPaidSession_(ss, sheetsByName, sessionCache, paidAgentSheets, paidSession, leadLookup, deletedPaidSet) {
  if (!paidSession || !Array.isArray(paidSession.rows) || paidSession.rows.length === 0) return;
  var grouped = new Map();
  var pRows = paidSession.rows;
  for (var i = 0; i < pRows.length; i++) {
    if (paidSession.deletedIndices && paidSession.deletedIndices.has(i)) continue;
    var pr = pRows[i];
    var pcId = String(pr[0] || '').trim();
    var pcLeadId = String(pr[1] || '').trim();
    var pcPhone = String(pr[3] || '').replace(/^'+/, '').trim();
    var pcAgent = String(pr[4] || '').trim();
    if ((!pcId && !pcPhone) || !pcAgent || pcAgent.toLowerCase() === 'unassigned') continue;
    if (isPaidRecordDeleted_({ id: pcId, leadId: pcLeadId, phone: pcPhone }, deletedPaidSet)) continue;
    var tabName = getPaidAgentTabName_(pcAgent);
    if (!paidAgentSheets[tabName]) {
      paidAgentSheets[tabName] = getOrCreateSheetCached_(ss, sheetsByName, tabName, PAID_AGENT_TAB_HEADERS);
    }
    var pcObj = {
      id: pcId,
      leadId: pcLeadId,
      customerName: String(pr[2] || '').trim(),
      phone: pcPhone,
      assignedAgentName: pcAgent,
      confirmedDate: String(pr[5] || '').replace(/^'+/, '').trim(),
      renewalDate: String(pr[6] || '').replace(/^'+/, '').trim(),
      renewalStatus: String(pr[8] || 'Active').trim(),
      updatedAt: pr[9] || '',
      packageName: sanitizePaidPackageName_(pr[10]),
      notes: String(pr[11] || '').trim()
    };
    if (!grouped.has(tabName)) grouped.set(tabName, []);
    grouped.get(tabName).push(formatPaidAgentRow_(pcObj, leadLookup));
  }
  grouped.forEach(function(rowsForTab, tabKey) {
    var pSheet = paidAgentSheets[tabKey];
    var pSession = getSheetSession_(sessionCache, pSheet, PAID_AGENT_TAB_HEADERS.length, 'paidAgent');
    for (var rIdx = 0; rIdx < rowsForTab.length; rIdx++) {
      var row = rowsForTab[rIdx];
      var rId = String(row[0] || '').trim();
      var rLeadKey = rId.indexOf('PC-') === 0 ? rId.slice(3) : ('PC-' + rId);
      var rPk = normalizePhoneKey_(row[3]);
      if ((rId && (findLiveIndex_(pSession.idIndex, rId, pSession.deletedIndices) !== -1 ||
                   findLiveIndex_(pSession.idIndex, rLeadKey, pSession.deletedIndices) !== -1)) ||
          (rPk && findLiveIndex_(pSession.phoneIndex, rPk, pSession.deletedIndices) !== -1)) {
        continue;
      }
      var newIdx = pSession.rows.length;
      pSession.rows.push(row);
      indexSessionRow_(pSession, newIdx, row);
    }
  });
}

function buildDeletedLeadSet_(payload) {
  var set = new Set();
  if (!payload) return set;
  if (Array.isArray(payload.deletedLeadIds)) {
    for (var i = 0; i < payload.deletedLeadIds.length; i++) {
      var val = String(payload.deletedLeadIds[i] || '').trim();
      if (val) set.add(val);
    }
  }
  if (payload.deletedLead && payload.deletedLead.id) {
    set.add(String(payload.deletedLead.id).trim());
  }
  return set;
}

function isLeadRecordDeleted_(lead, deletedSet) {
  if (!lead || !deletedSet || deletedSet.size === 0) return false;
  var idStr = String(lead.id || '').trim();
  if (idStr && deletedSet.has(idStr)) return true;
  var pk = normalizePhoneKey_(lead.phone || lead.rawPhone);
  if (pk && deletedSet.has('SHEET-PH-' + pk)) return true;
  return false;
}

function deleteLeadAcrossAllSheets_(ss, sheetsByName, sessionCache, masterSheet, deletedInfo, deletedLeadSet) {
  var keysMap = new Map();
  if (deletedLeadSet && typeof deletedLeadSet.forEach === 'function') {
    deletedLeadSet.forEach(function(k) {
      if (k) keysMap.set(k, true);
    });
  }
  var phoneKey = '';
  if (deletedInfo) {
    var dId = String(deletedInfo.id || '').trim();
    if (dId) keysMap.set(dId, true);
    if (deletedInfo.phone) {
      phoneKey = normalizePhoneKey_(deletedInfo.phone);
    }
  }
  var keyList = Array.from(keysMap.keys());
  if (keyList.length === 0 && !phoneKey) return;

  var mSession = getSheetSession_(sessionCache, masterSheet, MASTER_HEADERS.length, 'lead');
  deleteSessionRowsByKeys_(mSession, keyList, phoneKey);

  sheetsByName.forEach(function(sheet, sheetName) {
    if (sheetName.indexOf('Agent_') === 0 && sheetName !== 'Agent_Logs') {
      var aSession = getSheetSession_(sessionCache, sheet, AGENT_TAB_HEADERS.length, 'lead');
      deleteSessionRowsByKeys_(aSession, keyList, phoneKey);
    } else if (sheetName.indexOf('Collector_') === 0) {
      var cSession = getSheetSession_(sessionCache, sheet, COLLECTOR_TAB_HEADERS.length, 'lead');
      deleteSessionRowsByKeys_(cSession, keyList, phoneKey);
    }
  });
}

function syncLeadAcrossAgentTabsSession_(ss, sheetsByName, sessionCache, agentSheets, lead, prevPhoneKey) {
  var targetName = lead.assignedAgentName ? String(lead.assignedAgentName).trim() : '';
  var targetTabName = (targetName && targetName.toLowerCase() !== 'unassigned') ? getAgentTabName_(targetName) : '';
  if (targetTabName && !agentSheets[targetTabName]) {
    agentSheets[targetTabName] = getOrCreateSheetCached_(ss, sheetsByName, targetTabName, AGENT_TAB_HEADERS);
  }
  var lId = String(lead.id || '').trim();
  var lPhoneKey = normalizePhoneKey_(lead.phone || lead.rawPhone);
  sheetsByName.forEach(function(sheet, sheetName) {
    if (sheetName.indexOf('Agent_') !== 0 || sheetName === 'Agent_Logs') return;
    var aSession = getSheetSession_(sessionCache, sheet, AGENT_TAB_HEADERS.length, 'lead');
    if (targetTabName && sheetName === targetTabName) {
      upsertSessionRowById_(aSession, lId, formatAgentRow(lead), prevPhoneKey || lPhoneKey);
    } else if (aSession.idIndex.has(lId) || (prevPhoneKey && aSession.phoneIndex.has(prevPhoneKey)) || (lPhoneKey && aSession.phoneIndex.has(lPhoneKey))) {
      deleteSessionRowsByKeys_(aSession, [lId], prevPhoneKey || lPhoneKey || '');
    }
  });
}

function syncLeadAcrossCollectorTabsSession_(ss, sheetsByName, sessionCache, collectorSheets, lead, prevPhoneKey) {
  var rawCollector = lead && lead.collectorName ? String(lead.collectorName).trim() : '';
  var targetTabName = rawCollector ? getCollectorTabName_(rawCollector) : '';
  if (targetTabName && !collectorSheets[targetTabName]) {
    collectorSheets[targetTabName] = getOrCreateSheetCached_(ss, sheetsByName, targetTabName, COLLECTOR_TAB_HEADERS);
  }
  var lId = String(lead.id || '').trim();
  var lPhoneKey = normalizePhoneKey_(lead.phone || lead.rawPhone);
  sheetsByName.forEach(function(sheet, sheetName) {
    if (sheetName.indexOf('Collector_') !== 0) return;
    var cSession = getSheetSession_(sessionCache, sheet, COLLECTOR_TAB_HEADERS.length, 'lead');
    if (targetTabName && sheetName === targetTabName) {
      upsertSessionRowById_(cSession, lId, formatCollectorRow(lead), prevPhoneKey || lPhoneKey);
    } else if (cSession.idIndex.has(lId)) {
      deleteSessionRowsByKeys_(cSession, [lId], '');
    }
  });
}

function syncLeadAcrossAgentTabs(ss, agentSheets, lead) {
  var sheetsByName = buildSheetsMap_(ss);
  var sessionCache = new Map();
  syncLeadAcrossAgentTabsSession_(ss, sheetsByName, sessionCache, agentSheets, lead);
  commitAllSheetSessions_(sessionCache);
}

function syncLeadAcrossCollectorTabs(ss, collectorSheets, lead) {
  var sheetsByName = buildSheetsMap_(ss);
  var sessionCache = new Map();
  syncLeadAcrossCollectorTabsSession_(ss, sheetsByName, sessionCache, collectorSheets, lead);
  commitAllSheetSessions_(sessionCache);
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function upsertCallLogRow(sheet, c) {
  var sessionCache = new Map();
  var session = getSheetSession_(sessionCache, sheet, 10, 'callLog');
  upsertCallLogInSession_(session, c);
  commitSheetSession_(session);
}

function upsertRowById(sheet, id, rowData) {
  var sessionCache = new Map();
  var session = getSheetSession_(sessionCache, sheet, rowData.length, 'id');
  upsertSessionRowById_(session, id, rowData, '');
  commitSheetSession_(session);
}

function deleteRowById(sheet, id) {
  var sessionCache = new Map();
  var colCount = Math.max(1, sheet.getLastColumn());
  var session = getSheetSession_(sessionCache, sheet, colCount, 'id');
  deleteSessionRowsByKeys_(session, [id], '');
  commitSheetSession_(session);
}
`;
