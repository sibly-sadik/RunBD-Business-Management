import { AppSettings, AuditLog, CallLog, ContentPost, DuplicateAttempt, Lead, User } from '../types';

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
  googleSheetsWebhookUrl: '',
  callScript: DEFAULT_CALL_SCRIPT,
  lastSyncedAt: null,
};

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * RunBD Business Management Application - Google Sheets Real-Time Multi-Tab Sync
 * Automatically creates and syncs:
 *   - Core Tabs: Master_Data, Agent_Logs, Daily_Summary, Kawsar_Posts_Log, Final_Daily_Summary
 *   - Dedicated Agent Tabs: Agent_Tanjin, Agent_Kathy, Agent_Tania, Agent_Shanaz, Agent_Sizon, Agent_Sakib
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
var MASTER_HEADERS = [
  'Lead ID', 'Customer Name', 'Phone', 'Facebook Link', 'Collector',
  'Assigned Agent', 'Latest Status', 'Follow-up At', 'Notes', 'Updated At'
];
var AGENT_TAB_HEADERS = [
  'Lead ID', 'Customer Name', 'Phone', 'Facebook Link',
  'Latest Status', 'Follow-up At', 'Call Notes', 'Added By', 'Updated At'
];
var KAWSAR_POST_HEADERS = [
  'Post ID', 'Title / Note', 'Facebook Link', 'Website Link', 'Posted By', 'Timestamp'
];

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
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
    var finalSummarySheet = getOrCreateSheet(ss, 'Final_Daily_Summary', [
      'Date', 'Total Calls', 'Orders Confirmed', 'Farhan Leads', 'Naim Leads',
      'Kawsar FB Links', 'Kawsar Web Links', 'Agent Breakdown (Calls/Orders)', 'Last Synced At'
    ]);

    // Ensure all 6 dedicated agent tabs exist
    var agentSheets = {};
    for (var i = 0; i < AGENT_NAMES.length; i++) {
      var name = AGENT_NAMES[i];
      agentSheets[name] = getOrCreateSheet(ss, 'Agent_' + name, AGENT_TAB_HEADERS);
    }

    if (payload.event === 'FULL_SYNC' || payload.event === 'TEST_SYNC') {
      if (Array.isArray(payload.leads)) {
        replaceSheetRows(masterSheet, payload.leads.map(formatMasterRow));

        // Populate each dedicated agent tab with only that agent's assigned leads
        for (var a = 0; a < AGENT_NAMES.length; a++) {
          var agentName = AGENT_NAMES[a];
          var agentLeads = payload.leads.filter(function(l) {
            return l.assignedAgentName === agentName;
          });
          replaceSheetRows(agentSheets[agentName], agentLeads.map(formatAgentRow));
        }
      }
      if (Array.isArray(payload.callLogs)) {
        replaceSheetRows(logsSheet, payload.callLogs.map(function(c) {
          return [
            c.id, c.leadId, c.customerName, "'" + c.phone, c.agentName,
            c.previousStatus, c.newStatus, c.notes || '', c.followUpAt || '', c.timestamp
          ];
        }));
      }
      if (Array.isArray(payload.contentPosts)) {
        replaceSheetRows(kawsarSheet, payload.contentPosts.map(function(p) {
          return [
            p.id, p.note || '', p.facebookLink || '', p.websiteLink || '', p.posterName, p.createdAt
          ];
        }));
      }
    } else if (payload.event === 'LEAD_UPSERT' && payload.lead) {
      upsertRowById(masterSheet, payload.lead.id, formatMasterRow(payload.lead));
      syncLeadAcrossAgentTabs(agentSheets, payload.lead);
    } else if (payload.event === 'CALL_LOGGED' && payload.callLog) {
      if (payload.lead) {
        upsertRowById(masterSheet, payload.lead.id, formatMasterRow(payload.lead));
        syncLeadAcrossAgentTabs(agentSheets, payload.lead);
      }
      var c = payload.callLog;
      logsSheet.appendRow([
        c.id, c.leadId, c.customerName, "'" + c.phone, c.agentName,
        c.previousStatus, c.newStatus, c.notes || '', c.followUpAt || '', c.timestamp
      ]);
    } else if (payload.event === 'KAWSAR_POST_LOGGED' && payload.post) {
      var p = payload.post;
      upsertRowById(kawsarSheet, p.id, [
        p.id, p.note || '', p.facebookLink || '', p.websiteLink || '', p.posterName, p.createdAt
      ]);
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
        for (var ci = 0; ci < f.collectors.length; ci++) {
          if (f.collectors[ci].collectorName === 'Farhan') farhanCount = f.collectors[ci].leadsCollectedOnDate;
          if (f.collectors[ci].collectorName === 'Naim') naimCount = f.collectors[ci].leadsCollectedOnDate;
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

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, syncedAt: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function formatMasterRow(l) {
  return [
    l.id, l.customerName, "'" + l.phone, l.facebookLink, l.collectorName,
    l.assignedAgentName || 'Unassigned', l.status, l.followUpAt || '',
    l.lastCallNotes || l.notes || '', l.updatedAt
  ];
}

function formatAgentRow(l) {
  return [
    l.id, l.customerName, "'" + l.phone, l.facebookLink,
    l.status, l.followUpAt || '', l.lastCallNotes || l.notes || '',
    l.collectorName, l.updatedAt
  ];
}

function syncLeadAcrossAgentTabs(agentSheets, lead) {
  for (var i = 0; i < AGENT_NAMES.length; i++) {
    var name = AGENT_NAMES[i];
    var sheet = agentSheets[name];
    if (lead.assignedAgentName === name) {
      upsertRowById(sheet, lead.id, formatAgentRow(lead));
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

function replaceSheetRows(sheet, rows) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
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
