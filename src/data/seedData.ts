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
  'Post ID', 'Title / Note', 'Facebook Link', 'Website Link', 'Posted By', 'Timestamp'
];
var PAID_CUSTOMER_HEADERS = [
  'Customer ID', 'Lead ID', 'Customer Name', 'Phone', 'Assigned Agent',
  'Confirmed Date', 'Renewal Date', 'Days Remaining', 'Renewal Status', 'Updated At'
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
    .split('#')[0];
  if (!cleaned) return '';
  var parts = cleaned.split('?');
  var base = parts[0].replace(/\\/+$/, '');
  if (parts.length < 2 || !parts[1]) return base;
  var kept = parts[1].split('&').filter(function(kv) {
    var k = kv.split('=')[0].toLowerCase();
    return k && k !== 'fbclid' && k !== 'gclid' && k !== 'ref' && k !== 'refsrc' &&
      k !== 'rdid' && k !== 'share_url' && k !== 'sfnsn' && k !== '__tn__' &&
      k !== 'mibextid' && k.indexOf('utm_') !== 0 && k.indexOf('__cft__') !== 0;
  }).sort();
  return kept.length ? (base + '?' + kept.join('&')) : base;
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

      if (kawsarSheet && kawsarSheet.getLastRow() > 1 && (targetPostFb || targetPostWeb)) {
        var pRows = kawsarSheet.getRange(2, 1, kawsarSheet.getLastRow() - 1, 6).getValues();
        for (var p = 0; p < pRows.length; p++) {
          var pr = pRows[p];
          var existingFbRaw = String(pr[2] || '').trim();
          var existingWebRaw = String(pr[3] || '').trim();
          var existingFb = normalizeUrlKey_(existingFbRaw);
          var existingWeb = normalizeUrlKey_(existingWebRaw);

          var matchedField = '';
          if (targetPostFb && (targetPostFb === existingFb || targetPostFb === existingWeb)) {
            matchedField = 'Facebook Link';
          } else if (targetPostWeb && (targetPostWeb === existingWeb || targetPostWeb === existingFb)) {
            matchedField = 'Website Link';
          }

          if (matchedField) {
            return jsonOut_({
              ok: true,
              isDuplicate: true,
              matchedField: matchedField,
              post: {
                id: pr[0] ? String(pr[0]).trim() : ('SHEET-PST-' + (p + 2)),
                note: String(pr[1] || '').trim(),
                facebookLink: existingFbRaw,
                websiteLink: existingWebRaw,
                posterName: String(pr[4] || 'Kawsar').trim(),
                createdAt: pr[5] ? new Date(pr[5]).toISOString() : new Date().toISOString()
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
      var mColCount = Math.max(10, masterSheet.getLastColumn());
      var mRows = masterSheet.getRange(2, 1, masterSheet.getLastRow() - 1, mColCount).getValues();
      for (var i = 0; i < mRows.length; i++) {
        var r = mRows[i];
        var rowPhone = String(r[2] || '').replace(/^'+/, '').trim();
        var rowFb = String(r[3] || '').trim();
        var rowName = String(r[1] || '').trim();
        if (!r[0] && !rowPhone && !rowFb && !rowName) continue;
        var rowCreatedVal = r[10];
        if (todayOnly && toYmd_(rowCreatedVal) !== targetDate) continue;
        var rowId = r[0] ? String(r[0]).trim() : ('SHEET-ROW-' + (i + 2));
        leads.push({
          id: rowId,
          customerName: rowName,
          phone: rowPhone,
          facebookLink: rowFb,
          collectorName: String(r[4] || 'Farhan'),
          assignedAgentName: String(r[5] || '') === 'Unassigned' ? null : String(r[5] || ''),
          status: String(r[6] || 'Pending'),
          followUpAt: r[7] ? String(r[7]) : null,
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
      var kRows = kawsarSheet.getRange(2, 1, kawsarSheet.getLastRow() - 1, 6).getValues();
      for (var k = 0; k < kRows.length; k++) {
        var kr = kRows[k];
        var postFb = String(kr[2] || '').trim();
        var postWeb = String(kr[3] || '').trim();
        if (!kr[0] && !postFb && !postWeb) continue;
        if (todayOnly && toYmd_(kr[5]) !== targetDate) continue;
        var postId = kr[0] ? String(kr[0]).trim() : ('SHEET-PST-' + (k + 2));
        contentPosts.push({
          id: postId,
          note: String(kr[1] || ''),
          facebookLink: postFb,
          websiteLink: postWeb,
          posterName: String(kr[4] || 'Kawsar'),
          createdAt: kr[5] ? new Date(kr[5]).toISOString() : new Date().toISOString()
        });
      }
    }

    var paidSheet = ss.getSheetByName('Paid_Customers');
    var paidCustomers = [];
    if (paidSheet && paidSheet.getLastRow() > 1) {
      var pcCols = Math.max(10, paidSheet.getLastColumn());
      var pcRows = paidSheet.getRange(2, 1, paidSheet.getLastRow() - 1, pcCols).getValues();
      for (var pcIdx = 0; pcIdx < pcRows.length; pcIdx++) {
        var pr = pcRows[pcIdx];
        var pcPhone = String(pr[3] || '').replace(/^'+/, '').trim();
        var pcName = String(pr[2] || '').trim();
        if (!pr[0] && !pcPhone && !pcName) continue;
        var pcId = pr[0] ? String(pr[0]).trim() : ('SHEET-PC-ROW-' + (pcIdx + 2));
        var confYmd = toYmd_(String(pr[5] || '').replace(/^'+/, '')) || targetDate;
        var renYmd = toYmd_(String(pr[6] || '').replace(/^'+/, ''));
        paidCustomers.push({
          id: pcId,
          leadId: String(pr[1] || '').trim(),
          customerName: pcName,
          phone: pcPhone,
          assignedAgentName: String(pr[4] || '') === 'Unassigned' ? null : String(pr[4] || '').trim(),
          confirmedDate: confYmd,
          renewalDate: renYmd,
          renewalStatus: String(pr[8] || 'Active').trim(),
          updatedAt: pr[9] ? new Date(pr[9]).toISOString() : ''
        });
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

    // Ensure core tabs exist
    var masterSheet = getOrCreateSheet(ss, 'Master_Data', MASTER_HEADERS);
    var logsSheet = getOrCreateSheet(ss, 'Agent_Logs', [
      'Log ID', 'Lead ID', 'Customer Name', 'Phone', 'Agent',
      'Previous Status', 'New Status', 'Call Notes', 'Follow-up At', 'Timestamp'
    ]);
    var summarySheet = getOrCreateSheet(ss, 'Daily_Summary', [
      'Date', 'Total Leads', 'Calls Made Today', 'Order Confirmed',
      'Interested', 'Conversion Rate (%)', 'Last Synced At'
    ]);
    var kawsarSheet = getOrCreateSheet(ss, 'Kawsar_Posts_Log', KAWSAR_POST_HEADERS);
    var paidSheet = getOrCreateSheet(ss, 'Paid_Customers', PAID_CUSTOMER_HEADERS);
    var finalSummarySheet = getOrCreateSheet(ss, 'Final_Daily_Summary', [
      'Date', 'Total Calls', 'Orders Confirmed', 'Farhan Leads', 'Naim Leads',
      'Kawsar FB Links', 'Kawsar Web Links', 'Agent Breakdown (Calls/Orders)', 'Last Synced At'
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
      agentSheets[agentTab] = getOrCreateSheet(ss, agentTab, AGENT_TAB_HEADERS);
      var paidAgentTab = getPaidAgentTabName_(name);
      paidAgentSheets[paidAgentTab] = getOrCreateSheet(ss, paidAgentTab, PAID_AGENT_TAB_HEADERS);
    }

    var collectorSheets = {};
    for (var ci0 = 0; ci0 < allCollectorNames.length; ci0++) {
      var cName = allCollectorNames[ci0];
      var collectorTab = getCollectorTabName_(cName);
      collectorSheets[collectorTab] = getOrCreateSheet(ss, collectorTab, COLLECTOR_TAB_HEADERS);
    }

    var leadLookup = buildLeadLookupMaps_(masterSheet, payload.leads, payload.lead);

    if (payload.event === 'FULL_SYNC' || payload.event === 'TEST_SYNC' || payload.event === 'LEADS_BATCH_UPSERT') {
      var syncedPaidLeadKeys = {};
      if (Array.isArray(payload.leads)) {
        for (var li = 0; li < payload.leads.length; li++) {
          var leadItem = payload.leads[li];
          upsertRowById(masterSheet, leadItem.id, formatMasterRow(leadItem));
          syncLeadAcrossAgentTabs(ss, agentSheets, leadItem);
          syncLeadAcrossCollectorTabs(ss, collectorSheets, leadItem);
        }
      }
      if (Array.isArray(payload.callLogs)) {
        for (var ci = 0; ci < payload.callLogs.length; ci++) {
          var cl = payload.callLogs[ci];
          upsertCallLogRow(logsSheet, cl);
        }
      }
      if (Array.isArray(payload.contentPosts)) {
        for (var pi = 0; pi < payload.contentPosts.length; pi++) {
          var cp = payload.contentPosts[pi];
          upsertRowById(kawsarSheet, cp.id, [
            cp.id, cp.note || '', cp.facebookLink || '', cp.websiteLink || '', cp.posterName, cp.createdAt
          ]);
        }
      }
      if (Array.isArray(payload.paidCustomers)) {
        for (var pci = 0; pci < payload.paidCustomers.length; pci++) {
          var pcItem = payload.paidCustomers[pci];
          upsertRowById(paidSheet, pcItem.id, formatPaidCustomerRow(pcItem));
          syncPaidCustomerAcrossPaidTabs_(ss, paidAgentSheets, pcItem, leadLookup);
          if (pcItem.leadId) syncedPaidLeadKeys[String(pcItem.leadId).trim()] = true;
          if (pcItem.phone) syncedPaidLeadKeys['PH:' + normalizePhoneKey_(pcItem.phone)] = true;
        }
      }
      if (Array.isArray(payload.leads)) {
        for (var oli = 0; oli < payload.leads.length; oli++) {
          var ol = payload.leads[oli];
          if (ol && ol.status === 'Order Confirmed') {
            var olPhoneKey = ol.phone ? ('PH:' + normalizePhoneKey_(ol.phone)) : '';
            if (!syncedPaidLeadKeys[String(ol.id || '').trim()] && (!olPhoneKey || !syncedPaidLeadKeys[olPhoneKey])) {
              var synthPc = buildPaidCustomerFromLead_(ol);
              upsertRowById(paidSheet, synthPc.id, formatPaidCustomerRow(synthPc));
              syncPaidCustomerAcrossPaidTabs_(ss, paidAgentSheets, synthPc, leadLookup);
            }
          }
        }
      }
      if (payload.event === 'FULL_SYNC' || payload.event === 'TEST_SYNC') {
        backfillCollectorTabsFromMaster_(ss, collectorSheets, masterSheet);
        backfillPaidAgentTabsFromPaidSheet_(ss, paidAgentSheets, paidSheet, leadLookup);
      }
    } else if (payload.event === 'LEAD_UPSERT' && payload.lead) {
      upsertRowById(masterSheet, payload.lead.id, formatMasterRow(payload.lead));
      syncLeadAcrossAgentTabs(ss, agentSheets, payload.lead);
      syncLeadAcrossCollectorTabs(ss, collectorSheets, payload.lead);
      var leadPaid = payload.paidCustomer || (payload.lead.status === 'Order Confirmed' ? buildPaidCustomerFromLead_(payload.lead) : null);
      if (leadPaid) {
        upsertRowById(paidSheet, leadPaid.id, formatPaidCustomerRow(leadPaid));
        syncPaidCustomerAcrossPaidTabs_(ss, paidAgentSheets, leadPaid, leadLookup);
      }
    } else if (payload.event === 'CALL_LOGGED' && payload.callLog) {
      if (payload.lead) {
        upsertRowById(masterSheet, payload.lead.id, formatMasterRow(payload.lead));
        syncLeadAcrossAgentTabs(ss, agentSheets, payload.lead);
        syncLeadAcrossCollectorTabs(ss, collectorSheets, payload.lead);
      }
      upsertCallLogRow(logsSheet, payload.callLog);
      var callPaid = payload.paidCustomer || (payload.lead && payload.lead.status === 'Order Confirmed' ? buildPaidCustomerFromLead_(payload.lead) : null);
      if (callPaid) {
        upsertRowById(paidSheet, callPaid.id, formatPaidCustomerRow(callPaid));
        syncPaidCustomerAcrossPaidTabs_(ss, paidAgentSheets, callPaid, leadLookup);
      }
    } else if (payload.event === 'KAWSAR_POST_LOGGED' && payload.post) {
      var p = payload.post;
      upsertRowById(kawsarSheet, p.id, [
        p.id, p.note || '', p.facebookLink || '', p.websiteLink || '', p.posterName, p.createdAt
      ]);
    } else if (payload.event === 'PAID_CUSTOMER_UPSERT' && payload.paidCustomer) {
      upsertRowById(paidSheet, payload.paidCustomer.id, formatPaidCustomerRow(payload.paidCustomer));
      syncPaidCustomerAcrossPaidTabs_(ss, paidAgentSheets, payload.paidCustomer, leadLookup);
    }

    if (payload.dailySummary) {
      upsertRowById(summarySheet, payload.dailySummary.date, [
        payload.dailySummary.date,
        payload.dailySummary.totalLeads,
        payload.dailySummary.callsMadeToday,
        payload.dailySummary.orderConfirmedCount,
        payload.dailySummary.interestedCount,
        payload.dailySummary.conversionRate,
        new Date().toISOString()
      ]);
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
      upsertRowById(finalSummarySheet, f.date, [
        f.date,
        f.agentTotals ? f.agentTotals.callsMade : 0,
        f.agentTotals ? f.agentTotals.orderConfirmed : 0,
        farhanCount,
        naimCount,
        f.kawsar ? f.kawsar.facebookLinks : 0,
        f.kawsar ? f.kawsar.websiteLinks : 0,
        agentSummaryStr,
        new Date().toISOString()
      ]);
    }

    return jsonOut_({ ok: true, syncedAt: new Date().toISOString() });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.toString() });
  }
}

function buildLeadLookupMaps_(masterSheet, payloadLeads, singleLead) {
  var byId = {};
  var byPhone = {};
  if (masterSheet && masterSheet.getLastRow() > 1) {
    var colCount = Math.max(11, masterSheet.getLastColumn());
    var mRows = masterSheet.getRange(2, 1, masterSheet.getLastRow() - 1, colCount).getValues();
    for (var i = 0; i < mRows.length; i++) {
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
      if (mObj.id) byId[mObj.id] = mObj;
      var pKey = normalizePhoneKey_(mObj.phone);
      if (pKey) byPhone[pKey] = mObj;
    }
  }
  var list = [];
  if (Array.isArray(payloadLeads)) list = list.concat(payloadLeads);
  if (singleLead) list.push(singleLead);
  for (var j = 0; j < list.length; j++) {
    var l = list[j];
    if (!l) continue;
    if (l.id) byId[String(l.id).trim()] = l;
    var lpKey = normalizePhoneKey_(l.phone || l.rawPhone);
    if (lpKey) byPhone[lpKey] = l;
  }
  return { byId: byId, byPhone: byPhone };
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
  if (leadId && leadLookup.byId && leadLookup.byId[leadId]) {
    return leadLookup.byId[leadId];
  }
  var pKey = normalizePhoneKey_(pc.phone);
  if (pKey && leadLookup.byPhone && leadLookup.byPhone[pKey]) {
    return leadLookup.byPhone[pKey];
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
    pc.updatedAt || new Date().toISOString()
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
  var pkgVal = String(
    pc.amountOrPackage ||
    pc.packageName ||
    pc.amount ||
    (cleanRenewal ? ('1-Month Package (Renewal: ' + cleanRenewal + ')') : '1-Month Package')
  ).trim();
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

function matchesPaidAgentRow_(r, targetId, targetLeadId, targetPhoneKey) {
  var rowId = String(r[0] || '').trim();
  if (targetId && rowId && rowId === targetId) return true;
  if (targetLeadId && rowId && (rowId === targetLeadId || rowId === ('PC-' + targetLeadId))) return true;
  if (targetPhoneKey) {
    var rowPhoneKey = normalizePhoneKey_(r[3]);
    if (rowPhoneKey && rowPhoneKey === targetPhoneKey) return true;
  }
  return false;
}

function upsertPaidAgentRow_(sheet, pc, rowData) {
  var targetId = String(pc.id || '').trim();
  var targetLeadId = String(pc.leadId || '').trim();
  if (!targetLeadId && targetId.indexOf('PC-') === 0) targetLeadId = targetId.slice(3);
  var targetPhoneKey = normalizePhoneKey_(pc.phone);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var data = sheet.getRange(2, 1, lastRow - 1, PAID_AGENT_TAB_HEADERS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (matchesPaidAgentRow_(data[i], targetId, targetLeadId, targetPhoneKey)) {
        sheet.getRange(i + 2, 1, 1, rowData.length).setValues([rowData]);
        return;
      }
    }
  }
  sheet.appendRow(rowData);
}

function deletePaidAgentRow_(sheet, pc) {
  var targetId = String(pc.id || '').trim();
  var targetLeadId = String(pc.leadId || '').trim();
  if (!targetLeadId && targetId.indexOf('PC-') === 0) targetLeadId = targetId.slice(3);
  var targetPhoneKey = normalizePhoneKey_(pc.phone);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  var data = sheet.getRange(2, 1, lastRow - 1, PAID_AGENT_TAB_HEADERS.length).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    if (matchesPaidAgentRow_(data[i], targetId, targetLeadId, targetPhoneKey)) {
      sheet.deleteRow(i + 2);
    }
  }
}

function syncPaidCustomerAcrossPaidTabs_(ss, paidAgentSheets, pc, leadLookup) {
  if (!pc) return;
  var matchedLead = findMatchingLeadForPaid_(pc, leadLookup);
  var rawAgent = String(pc.assignedAgentName || (matchedLead && matchedLead.assignedAgentName) || '').trim();
  var targetAgent = (rawAgent && rawAgent.toLowerCase() !== 'unassigned') ? rawAgent : '';
  var targetTabName = targetAgent ? getPaidAgentTabName_(targetAgent) : '';
  if (targetTabName && !paidAgentSheets[targetTabName]) {
    paidAgentSheets[targetTabName] = getOrCreateSheet(ss, targetTabName, PAID_AGENT_TAB_HEADERS);
  }
  var rowData = formatPaidAgentRow_(pc, leadLookup);
  var allSheets = ss.getSheets();
  for (var i = 0; i < allSheets.length; i++) {
    var sheet = allSheets[i];
    var sheetName = sheet.getName();
    if (!isPaidAgentTabName_(sheetName)) continue;
    if (targetTabName && sheetName === targetTabName) {
      upsertPaidAgentRow_(sheet, pc, rowData);
    } else {
      deletePaidAgentRow_(sheet, pc);
    }
  }
}

function backfillCollectorTabsFromMaster_(ss, collectorSheets, masterSheet) {
  if (!masterSheet || masterSheet.getLastRow() <= 1) return;
  var mCols = Math.max(11, masterSheet.getLastColumn());
  var mRows = masterSheet.getRange(2, 1, masterSheet.getLastRow() - 1, mCols).getValues();
  var grouped = {};
  for (var i = 0; i < mRows.length; i++) {
    var mr = mRows[i];
    var id = String(mr[0] || '').trim();
    var collectorName = String(mr[4] || '').trim();
    if (!id || !collectorName || collectorName.toLowerCase() === 'unknown') continue;
    var tabName = getCollectorTabName_(collectorName);
    if (!collectorSheets[tabName]) {
      collectorSheets[tabName] = getOrCreateSheet(ss, tabName, COLLECTOR_TAB_HEADERS);
    }
    if (!grouped[tabName]) grouped[tabName] = [];
    grouped[tabName].push([
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
  for (var tabKey in grouped) {
    if (!grouped.hasOwnProperty(tabKey)) continue;
    var cSheet = collectorSheets[tabKey];
    var existingIds = {};
    var existingPhones = {};
    var cLastRow = cSheet.getLastRow();
    if (cLastRow > 1) {
      var cExisting = cSheet.getRange(2, 1, cLastRow - 1, 3).getValues();
      for (var e = 0; e < cExisting.length; e++) {
        var exId = String(cExisting[e][0] || '').trim();
        var exPk = normalizePhoneKey_(cExisting[e][2]);
        if (exId) existingIds[exId] = true;
        if (exPk) existingPhones[exPk] = true;
      }
    }
    var toAppend = [];
    var rowsForTab = grouped[tabKey];
    for (var rIdx = 0; rIdx < rowsForTab.length; rIdx++) {
      var row = rowsForTab[rIdx];
      var rId = String(row[0] || '').trim();
      var rPk = normalizePhoneKey_(row[2]);
      if ((rId && existingIds[rId]) || (rPk && existingPhones[rPk])) continue;
      if (rId) existingIds[rId] = true;
      if (rPk) existingPhones[rPk] = true;
      toAppend.push(row);
    }
    if (toAppend.length > 0) {
      cSheet.getRange(cSheet.getLastRow() + 1, 1, toAppend.length, COLLECTOR_TAB_HEADERS.length).setValues(toAppend);
    }
  }
}

function backfillPaidAgentTabsFromPaidSheet_(ss, paidAgentSheets, paidSheet, leadLookup) {
  if (!paidSheet || paidSheet.getLastRow() <= 1) return;
  var pCols = Math.max(10, paidSheet.getLastColumn());
  var pRows = paidSheet.getRange(2, 1, paidSheet.getLastRow() - 1, pCols).getValues();
  var grouped = {};
  for (var i = 0; i < pRows.length; i++) {
    var pr = pRows[i];
    var pcId = String(pr[0] || '').trim();
    var pcLeadId = String(pr[1] || '').trim();
    var pcPhone = String(pr[3] || '').replace(/^'+/, '').trim();
    var pcAgent = String(pr[4] || '').trim();
    if ((!pcId && !pcPhone) || !pcAgent || pcAgent.toLowerCase() === 'unassigned') continue;
    var tabName = getPaidAgentTabName_(pcAgent);
    if (!paidAgentSheets[tabName]) {
      paidAgentSheets[tabName] = getOrCreateSheet(ss, tabName, PAID_AGENT_TAB_HEADERS);
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
      updatedAt: pr[9] || ''
    };
    if (!grouped[tabName]) grouped[tabName] = [];
    grouped[tabName].push(formatPaidAgentRow_(pcObj, leadLookup));
  }
  for (var tabKey in grouped) {
    if (!grouped.hasOwnProperty(tabKey)) continue;
    var pSheet = paidAgentSheets[tabKey];
    var existingIds = {};
    var existingPhones = {};
    var pLastRow = pSheet.getLastRow();
    if (pLastRow > 1) {
      var pExisting = pSheet.getRange(2, 1, pLastRow - 1, 4).getValues();
      for (var e = 0; e < pExisting.length; e++) {
        var exId = String(pExisting[e][0] || '').trim();
        var exPk = normalizePhoneKey_(pExisting[e][3]);
        if (exId) existingIds[exId] = true;
        if (exPk) existingPhones[exPk] = true;
      }
    }
    var toAppend = [];
    var rowsForTab = grouped[tabKey];
    for (var rIdx = 0; rIdx < rowsForTab.length; rIdx++) {
      var row = rowsForTab[rIdx];
      var rId = String(row[0] || '').trim();
      var rLeadKey = rId.indexOf('PC-') === 0 ? rId.slice(3) : ('PC-' + rId);
      var rPk = normalizePhoneKey_(row[3]);
      if ((rId && (existingIds[rId] || existingIds[rLeadKey])) || (rPk && existingPhones[rPk])) continue;
      if (rId) existingIds[rId] = true;
      if (rPk) existingPhones[rPk] = true;
      toAppend.push(row);
    }
    if (toAppend.length > 0) {
      pSheet.getRange(pSheet.getLastRow() + 1, 1, toAppend.length, PAID_AGENT_TAB_HEADERS.length).setValues(toAppend);
    }
  }
}

function syncLeadAcrossAgentTabs(ss, agentSheets, lead) {
  var targetName = lead.assignedAgentName ? String(lead.assignedAgentName).trim() : '';
  var targetTabName = targetName ? getAgentTabName_(targetName) : '';
  if (targetTabName && !agentSheets[targetTabName]) {
    agentSheets[targetTabName] = getOrCreateSheet(ss, targetTabName, AGENT_TAB_HEADERS);
  }
  var allSheets = ss.getSheets();
  for (var i = 0; i < allSheets.length; i++) {
    var sheet = allSheets[i];
    var sheetName = sheet.getName();
    if (sheetName.indexOf('Agent_') !== 0 || sheetName === 'Agent_Logs') continue;
    if (targetTabName && sheetName === targetTabName) {
      upsertRowById(sheet, lead.id, formatAgentRow(lead));
    } else {
      deleteRowById(sheet, lead.id);
    }
  }
}

function syncLeadAcrossCollectorTabs(ss, collectorSheets, lead) {
  var rawCollector = lead && lead.collectorName ? String(lead.collectorName).trim() : '';
  var targetTabName = rawCollector ? getCollectorTabName_(rawCollector) : '';
  if (targetTabName && !collectorSheets[targetTabName]) {
    collectorSheets[targetTabName] = getOrCreateSheet(ss, targetTabName, COLLECTOR_TAB_HEADERS);
  }
  var allSheets = ss.getSheets();
  for (var i = 0; i < allSheets.length; i++) {
    var sheet = allSheets[i];
    var sheetName = sheet.getName();
    if (sheetName.indexOf('Collector_') !== 0) continue;
    if (targetTabName && sheetName === targetTabName) {
      upsertRowById(sheet, lead.id, formatCollectorRow(lead));
    } else {
      deleteRowById(sheet, lead.id);
    }
  }
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
  var callYmd = toYmd_(c.timestamp);
  var targetPhone = normalizePhoneKey_(c.phone);
  var targetLeadId = String(c.leadId || '').trim();
  var targetAgent = String(c.agentName || '').trim().toLowerCase();
  var rowData = [
    c.id, c.leadId, c.customerName, "'" + c.phone, c.agentName,
    c.previousStatus, c.newStatus, c.notes || '', c.followUpAt || '', c.timestamp
  ];

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (r[0] === c.id) {
      sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
      return;
    }
    var rowYmd = toYmd_(r[9]);
    var rowAgent = String(r[4] || '').trim().toLowerCase();
    if (callYmd && rowYmd === callYmd && targetAgent && rowAgent === targetAgent) {
      var rowLeadId = String(r[1] || '').trim();
      var rowPhone = normalizePhoneKey_(r[3]);
      if ((targetLeadId && rowLeadId && targetLeadId === rowLeadId) || (targetPhone && rowPhone && targetPhone === rowPhone)) {
        var preservedRow = [
          r[0] || c.id, c.leadId, c.customerName, "'" + c.phone, c.agentName,
          r[5] || c.previousStatus, c.newStatus, c.notes || '', c.followUpAt || '', c.timestamp
        ];
        sheet.getRange(i + 1, 1, 1, preservedRow.length).setValues([preservedRow]);
        return;
      }
    }
  }
  sheet.appendRow(rowData);
}

function upsertRowById(sheet, id, rowData) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
      return;
    }
  }
  sheet.appendRow(rowData);
}

function deleteRowById(sheet, id) {
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
    }
  }
}
`;
