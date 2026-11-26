import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { GOOGLE_APPS_SCRIPT_CODE } from '../data/seedData';
import { CallLog, ContentPost, DuplicateAttempt, Lead, PaidCustomer } from '../types';
import { extractPhoneCoreKey, filterTodayLeads, normalizeBdPhone } from './leadLogic';
import {
  buildSheetsSyncChunks,
  DEFAULT_SHEETS_BATCH_SIZE,
  detectLeadDuplicatesInList,
  detectPostDuplicatesInList,
  enrichPaidCustomersForSheetSync,
  FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL,
  filterPullPayloadByDate,
  getAgentTabName,
  getCollectorTabName,
  getDefaultWebhookUrl,
  getPaidAgentTabName,
  HISTORICAL_FALLBACK_ISO,
  isFirestoreDocIdSafe,
  isLegacyWebhookUrl,
  mergeRemoteCallLogs,
  mergeRemoteContentPosts,
  mergeRemoteDuplicateAttempts,
  mergeRemoteLeads,
  mergeRemotePaidCustomers,
  parseLeadDuplicateCheckResponse,
  parsePostDuplicateCheckResponse,
  parsePullPayload,
  resolveWebhookUrl,
  sanitizeSheetTabSuffix,
} from './sheetsSync';
import {
  createTimeoutAbortReason,
  DEFAULT_SHEETS_SYNC_TIMEOUT_MS,
  describeWebhookFetchError,
  FULL_SYNC_TIMEOUT_MS,
  pullFromGoogleSheetsWebhook,
  pushChunkedSheetsSync,
  pushToGoogleSheetsWebhook,
  SUPERSEDED_SYNC_ERROR_NAME,
} from './storage';

describe('Google Sheets default webhook URL resolution', () => {
  it('uses the updated RunBD Apps Script deployment URL as the hardcoded fallback', () => {
    assert.equal(
      FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL,
      'https://script.google.com/macros/s/AKfycby6ctqVTCeRYY2_FUzbO9SIGPYYi9bFKHvCQsYjob4r4WKptiBoYmq4N444O6-NYALT/exec'
    );
  });

  it('returns the hardcoded RunBD webhook URL when no saved or env URL exists', () => {
    assert.equal(getDefaultWebhookUrl(undefined), FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL);
    assert.equal(getDefaultWebhookUrl(''), FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL);
    assert.equal(resolveWebhookUrl('', ''), FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL);
    assert.equal(resolveWebhookUrl(null, null), FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL);
  });

  it('automatically replaces legacy/deprecated webhook URLs with the new default URL', () => {
    const legacyUrl =
      'https://script.google.com/macros/s/AKfycbwqMl23Bi200Idn267ySCDpKBY30b1FdYC8OWPOPK90neBvSPwWyn7Eq-VqV8ublfUD/exec';
    const prevDefaultUrl =
      'https://script.google.com/macros/s/AKfycbwkuMzc7UJktjeULCfwgvnSU_4jS9H1GvFb6Y_68E0HntOWPwWpsXkzU2Wa8BWfxIUH/exec';
    assert.equal(isLegacyWebhookUrl(legacyUrl), true);
    assert.equal(isLegacyWebhookUrl(prevDefaultUrl), true);
    assert.equal(isLegacyWebhookUrl(` ${legacyUrl}/ `), true);
    assert.equal(resolveWebhookUrl(legacyUrl, ''), FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL);
    assert.equal(resolveWebhookUrl(prevDefaultUrl, ''), FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL);
    assert.equal(getDefaultWebhookUrl(legacyUrl), FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL);
    assert.equal(
      isLegacyWebhookUrl(FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL),
      false
    );
  });

  it('prefers VITE_GOOGLE_SHEET_WEBHOOK_URL env value over fallback when localStorage is empty', () => {
    const envUrl = 'https://script.google.com/macros/s/ENV_TEST_ID/exec';
    assert.equal(resolveWebhookUrl('', envUrl), envUrl);
  });

  it('prefers custom saved localStorage URL over env and fallback URLs', () => {
    const savedUrl = 'https://script.google.com/macros/s/CUSTOM_SAVED/exec';
    const envUrl = 'https://script.google.com/macros/s/ENV_TEST_ID/exec';
    assert.equal(resolveWebhookUrl(savedUrl, envUrl), savedUrl);
  });

  it('ignores invalid URLs and falls back safely', () => {
    assert.equal(
      resolveWebhookUrl('not-a-url', 'also-invalid'),
      FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL
    );
  });
});

describe('parsePullPayload', () => {
  it('returns null for non-object or non-sync payloads', () => {
    assert.equal(parsePullPayload(null), null);
    assert.equal(parsePullPayload('<html>error</html>'), null);
    assert.equal(parsePullPayload({ ok: true }), null);
  });

  it('extracts leads, callLogs, and contentPosts arrays from valid payloads', () => {
    const parsed = parsePullPayload({
      ok: true,
      leads: [{ id: 'LD-1', customerName: 'Rahim' }],
      callLogs: [{ id: 'CL-1', leadId: 'LD-1' }],
      contentPosts: [{ id: 'PST-1', facebookLink: 'https://fb.com/post/1' }],
    });
    assert.ok(parsed);
    assert.equal(parsed.leads.length, 1);
    assert.equal(parsed.callLogs.length, 1);
    assert.equal(parsed.contentPosts.length, 1);
  });
});

describe('mergeRemoteLeads', () => {
  it('hydrates an empty new device with remote leads and resolves collector/agent IDs cleanly', () => {
    const merged = mergeRemoteLeads([], [
      {
        id: 'LD-101',
        customerName: 'Karim Ahmed',
        phone: "'+880 1711-223344",
        facebookLink: 'https://facebook.com/karim.runbd',
        collectorName: 'Naim',
        assignedAgentName: 'Tanjin',
        status: 'Interested',
        updatedAt: '2026-11-18T10:00:00.000Z',
      },
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].phone, '01711223344');
    assert.equal(merged[0].collectorId, 'collector-naim');
    assert.equal(merged[0].assignedAgentId, 'agent-tanjin');
    assert.equal(merged[0].status, 'Interested');
  });

  it('assigns deterministic Firestore-safe IDs to manual sheet rows lacking Column A IDs', () => {
    const merged = mergeRemoteLeads([], [
      {
        id: '',
        customerName: 'Sheet Manual Customer',
        phone: '+88 01855-123456',
        facebookLink: 'https://m.facebook.com/sheet.manual',
        collectorName: 'Farhan',
        assignedAgentName: 'Kathy',
        status: 'Pending',
      },
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, 'SHEET-PH-1855123456');
    assert.equal(isFirestoreDocIdSafe(merged[0].id), true);
    assert.equal(merged[0].phone, '01855123456');
    assert.equal(merged[0].collectorId, 'collector-farhan');
    assert.equal(merged[0].assignedAgentId, 'agent-kathy');

    const kawsarMerged = mergeRemoteLeads([], [
      {
        id: 'LD-KAWSAR-1',
        customerName: 'Kawsar Lead',
        phone: '01911223344',
        collectorName: 'Kawsar',
        status: 'Pending',
      },
    ]);
    assert.equal(kawsarMerged[0].collectorId, 'collector-kawsar');
    assert.equal(kawsarMerged[0].collectorName, 'Kawsar');
  });

  it('keeps local unsynced leads, deduplicates by unique ID, and updates only when remote is newer', () => {
    const local: Lead[] = [
      {
        id: 'LD-1',
        customerName: 'Older Local',
        phone: '01700000001',
        rawPhone: '01700000001',
        facebookLink: '',
        normalizedFacebookLink: '',
        notes: '',
        collectorId: 'collector-farhan',
        collectorName: 'Farhan',
        assignedAgentId: 'agent-tanjin',
        assignedAgentName: 'Tanjin',
        status: 'Pending',
        followUpAt: null,
        lastCallNotes: '',
        createdAt: '2026-11-18T08:00:00.000Z',
        updatedAt: '2026-11-18T08:00:00.000Z',
      },
      {
        id: 'LD-LOCAL-ONLY',
        customerName: 'Unsynced Local',
        phone: '01800000002',
        rawPhone: '01800000002',
        facebookLink: '',
        normalizedFacebookLink: '',
        notes: '',
        collectorId: 'collector-naim',
        collectorName: 'Naim',
        assignedAgentId: 'agent-sakib',
        assignedAgentName: 'Sakib',
        status: 'Pending',
        followUpAt: null,
        lastCallNotes: '',
        createdAt: '2026-11-18T09:00:00.000Z',
        updatedAt: '2026-11-18T09:00:00.000Z',
      },
    ];

    const merged = mergeRemoteLeads(local, [
      {
        id: 'LD-1',
        status: 'Order Confirmed',
        updatedAt: '2026-11-18T11:00:00.000Z',
      },
      {
        id: 'LD-1',
        status: 'Not Interested',
        updatedAt: '2026-11-18T07:00:00.000Z', // stale row in sheet should not downgrade
      },
    ]);

    assert.equal(merged.length, 2);
    const updated = merged.find((l) => l.id === 'LD-1');
    const kept = merged.find((l) => l.id === 'LD-LOCAL-ONLY');
    assert.equal(updated?.status, 'Order Confirmed');
    assert.equal(updated?.collectorId, 'collector-farhan');
    assert.equal(kept?.customerName, 'Unsynced Local');
  });

  it('preserves existing updatedAt when remote row lacks updatedAt so sync stays idempotent', () => {
    const local: Lead[] = [
      {
        id: 'LD-IDEMPOTENT',
        customerName: 'Existing Lead',
        phone: '01700000099',
        rawPhone: '01700000099',
        facebookLink: '',
        normalizedFacebookLink: '',
        notes: '',
        collectorId: 'collector-farhan',
        collectorName: 'Farhan',
        assignedAgentId: 'agent-tanjin',
        assignedAgentName: 'Tanjin',
        status: 'Interested',
        followUpAt: null,
        lastCallNotes: '',
        createdAt: '2026-11-18T08:00:00.000Z',
        updatedAt: '2026-11-18T08:00:00.000Z',
      },
    ];

    const merged = mergeRemoteLeads(local, [
      {
        id: 'LD-IDEMPOTENT',
        customerName: 'Existing Lead',
        phone: '01700000099',
        status: 'Pending', // stale sheet row without updatedAt must not overwrite newer local updatedAt
      },
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].updatedAt, '2026-11-18T08:00:00.000Z');
    assert.equal(merged[0].status, 'Interested');
  });
});

describe('mergeRemoteCallLogs & mergeRemoteContentPosts', () => {
  it('merges remote call logs without duplicating existing IDs', () => {
    const existing: CallLog[] = [
      {
        id: 'CL-1',
        leadId: 'LD-1',
        customerName: 'Test',
        phone: '01711111111',
        agentId: 'agent-tanjin',
        agentName: 'Tanjin',
        previousStatus: 'Pending',
        newStatus: 'Interested',
        notes: 'First call',
        followUpAt: null,
        timestamp: '2026-11-18T08:00:00.000Z',
      },
    ];
    const merged = mergeRemoteCallLogs(existing, [
      { id: 'CL-1', notes: 'Duplicate' },
      {
        id: 'CL-2',
        leadId: 'LD-1',
        customerName: 'Test',
        phone: "'01711111111",
        agentName: 'Kathy',
        previousStatus: 'Interested',
        newStatus: 'Order Confirmed',
        timestamp: '2026-11-18T10:00:00.000Z',
      },
    ]);

    assert.equal(merged.length, 2);
    assert.equal(merged[0].id, 'CL-2');
    assert.equal(merged[0].phone, '01711111111');
    assert.equal(merged[1].notes, 'First call');

    // In-place update on same ID with newer timestamp & same-day duplicate collapse for same agent
    const updatedMerged = mergeRemoteCallLogs(merged, [
      {
        id: 'CL-1',
        leadId: 'LD-1',
        customerName: 'Test',
        phone: '01711111111',
        agentName: 'Tanjin',
        previousStatus: 'Pending',
        newStatus: 'Done',
        notes: 'Updated in place',
        timestamp: '2026-11-18T12:00:00.000Z',
      },
      {
        id: 'CL-1-DUP',
        leadId: 'LD-1',
        customerName: 'Test',
        phone: '+880 1711-111111',
        agentName: 'Tanjin',
        previousStatus: 'Done',
        newStatus: 'Order Confirmed',
        notes: 'Newer status same day',
        timestamp: '2026-11-18T14:00:00.000Z',
      },
    ]);
    assert.equal(updatedMerged.length, 2); // 1 for Tanjin (CL-1-DUP) + 1 for Kathy (CL-2)
    assert.equal(updatedMerged[0].id, 'CL-1-DUP');
    assert.equal(updatedMerged[0].newStatus, 'Order Confirmed');
  });

  it('merges remote Kawsar content posts, normalizes URLs, and handles manual rows without ID', () => {
    const existing: ContentPost[] = [];
    const merged = mergeRemoteContentPosts(existing, [
      {
        id: 'PST-1',
        facebookLink: 'https://facebook.com/runbd/posts/123',
        websiteLink: 'https://runbd.com/product/car-polish',
        note: 'Car Polish Launch',
        posterName: 'Kawsar',
        createdAt: '2026-11-18T09:30:00.000Z',
      },
      {
        id: '',
        facebookLink: '',
        websiteLink: 'https://www.runbd.com/product/wax/?utm_source=fb',
        note: 'Manual Row Post',
        posterName: 'Kawsar',
        createdAt: '2026-11-18T10:30:00.000Z',
      },
    ]);

    assert.equal(merged.length, 2);
    assert.equal(merged[0].posterName, 'Kawsar');
    assert.ok(merged[0].id.startsWith('SHEET-PST-'));
    assert.equal(isFirestoreDocIdSafe(merged[0].id), true);
    assert.ok(merged[1].normalizedFacebookLink.includes('facebook.com/runbd/posts/123'));
    assert.ok(merged[1].normalizedWebsiteLink.includes('runbd.com/product/car-polish'));
  });
});

describe('detectLeadDuplicatesInList & detectPostDuplicatesInList', () => {
  it('flags duplicate phone numbers and Facebook URLs across distinct lead IDs pulled from Master_Data', () => {
    const leads: Lead[] = [
      {
        id: 'RBD-1',
        customerName: 'Original Lead',
        phone: '01711223344',
        rawPhone: '01711223344',
        facebookLink: 'https://facebook.com/original.user',
        normalizedFacebookLink: 'facebook.com/original.user',
        notes: '',
        collectorId: 'collector-farhan',
        collectorName: 'Farhan',
        assignedAgentId: 'agent-tanjin',
        assignedAgentName: 'Tanjin',
        status: 'Interested',
        followUpAt: null,
        lastCallNotes: '',
        createdAt: '2026-11-18T08:00:00.000Z',
        updatedAt: '2026-11-18T08:00:00.000Z',
      },
      {
        id: 'RBD-2',
        customerName: 'Sheet Phone Dup',
        phone: '01711223344',
        rawPhone: '+880 1711-223344',
        facebookLink: 'https://facebook.com/different.user',
        normalizedFacebookLink: 'facebook.com/different.user',
        notes: '',
        collectorId: 'collector-naim',
        collectorName: 'Naim',
        assignedAgentId: 'agent-kathy',
        assignedAgentName: 'Kathy',
        status: 'Pending',
        followUpAt: null,
        lastCallNotes: '',
        createdAt: '2026-11-18T09:00:00.000Z',
        updatedAt: '2026-11-18T09:00:00.000Z',
      },
      {
        id: 'RBD-3',
        customerName: 'Sheet FB Dup',
        phone: '01911223344',
        rawPhone: '01911223344',
        facebookLink: 'https://m.facebook.com/original.user/?ref=share',
        normalizedFacebookLink: '',
        notes: '',
        collectorId: 'collector-naim',
        collectorName: 'Naim',
        assignedAgentId: 'agent-sakib',
        assignedAgentName: 'Sakib',
        status: 'Busy / Call Later',
        followUpAt: null,
        lastCallNotes: '',
        createdAt: '2026-11-18T10:00:00.000Z',
        updatedAt: '2026-11-18T10:00:00.000Z',
      },
    ];

    const flags = detectLeadDuplicatesInList(leads);
    assert.equal(flags.length, 2);
    assert.equal(flags[0].matchedBy, 'phone');
    assert.equal(flags[0].duplicateLeadId, 'RBD-2');
    assert.equal(flags[0].originalLeadId, 'RBD-1');
    assert.equal(flags[0].assignedAgentName, 'Kathy');
    assert.equal(flags[1].matchedBy, 'facebook');
    assert.equal(flags[1].duplicateLeadId, 'RBD-3');
    assert.equal(flags[1].originalLeadId, 'RBD-1');
  });

  it('flags duplicate Facebook and Website URLs across distinct post IDs pulled from Kawsar_Posts_Log', () => {
    const posts: ContentPost[] = [
      {
        id: 'PST-1',
        facebookLink: 'https://www.facebook.com/runbd/posts/101',
        normalizedFacebookLink: 'facebook.com/runbd/posts/101',
        websiteLink: 'https://runbd.com/products/kit',
        normalizedWebsiteLink: 'runbd.com/products/kit',
        note: 'Original Post',
        posterId: 'poster-kawsar',
        posterName: 'Kawsar',
        createdAt: '2026-11-18T08:00:00.000Z',
      },
      {
        id: 'PST-2',
        facebookLink: 'https://m.facebook.com/runbd/posts/101/?fbclid=999',
        normalizedFacebookLink: '',
        websiteLink: 'https://www.runbd.com/products/kit/',
        normalizedWebsiteLink: '',
        note: 'Duplicate Row in Sheet',
        posterId: 'poster-kawsar',
        posterName: 'Kawsar',
        createdAt: '2026-11-18T09:00:00.000Z',
      },
    ];

    const flags = detectPostDuplicatesInList(posts);
    assert.equal(flags.length, 2);
    assert.equal(flags[0].matchedField, 'Facebook Link');
    assert.equal(flags[0].duplicatePostId, 'PST-2');
    assert.equal(flags[1].matchedField, 'Website Link');
    assert.equal(flags[1].duplicatePostId, 'PST-2');
  });
});

describe('on-demand duplicate checks & today-only pull filtering', () => {
  it('filterPullPayloadByDate keeps only records created/logged on the target YYYY-MM-DD date', () => {
    const todayIso = new Date('2026-11-21T10:00:00+06:00').toISOString();
    const yesterdayIso = new Date('2026-11-20T15:00:00+06:00').toISOString();

    const filtered = filterPullPayloadByDate(
      {
        leads: [
          { id: 'L-TODAY', createdAt: todayIso },
          { id: 'L-YEST', createdAt: yesterdayIso, updatedAt: todayIso },
        ],
        callLogs: [
          { id: 'C-TODAY', timestamp: todayIso },
          { id: 'C-YEST', timestamp: yesterdayIso },
        ],
        contentPosts: [
          { id: 'P-TODAY', createdAt: todayIso },
          { id: 'P-YEST', createdAt: yesterdayIso },
        ],
        paidCustomers: [],
      },
      '2026-11-21'
    );

    assert.deepEqual(filtered.leads.map((l) => l.id), ['L-TODAY']);
    assert.deepEqual(filtered.callLogs.map((c) => c.id), ['C-TODAY']);
    assert.deepEqual(filtered.contentPosts.map((p) => p.id), ['P-TODAY']);
  });

  it('parseLeadDuplicateCheckResponse parses duplicate and non-duplicate responses cleanly', () => {
    const nonDup = parseLeadDuplicateCheckResponse({ ok: true, isDuplicate: false });
    assert.deepEqual(nonDup, { ok: true, isDuplicate: false });

    const dup = parseLeadDuplicateCheckResponse({
      ok: true,
      isDuplicate: true,
      matchedBy: 'phone',
      lead: {
        id: 'RBD-900',
        customerName: 'Kamal Hossain',
        phone: "'+8801711223344",
        assignedAgentName: 'Kathy',
        status: 'Order Confirmed',
        collectorName: 'Naim',
        createdAt: '2026-11-10T09:00:00.000Z',
      },
    });

    assert.ok(dup);
    assert.equal(dup.isDuplicate, true);
    assert.equal(dup.matchedBy, 'phone');
    assert.equal(dup.existingLead?.customerName, 'Kamal Hossain');
    assert.equal(dup.existingLead?.phone, '01711223344');
    assert.equal(dup.existingLead?.assignedAgentName, 'Kathy');
    assert.equal(dup.existingLead?.status, 'Order Confirmed');
    assert.equal(dup.existingLead?.collectorName, 'Naim');
  });

  it('parsePostDuplicateCheckResponse parses Kawsar duplicate and unique responses cleanly', () => {
    const nonDup = parsePostDuplicateCheckResponse({ ok: true, isDuplicate: false });
    assert.deepEqual(nonDup, { ok: true, isDuplicate: false });

    const dup = parsePostDuplicateCheckResponse({
      ok: true,
      isDuplicate: true,
      matchedField: 'Website Link',
      post: {
        id: 'PST-77',
        note: 'Winter Promo',
        websiteLink: 'https://runbd.com/products/winter-promo',
        posterName: 'Kawsar',
        createdAt: '2026-11-12T11:30:00.000Z',
      },
    });

    assert.ok(dup);
    assert.equal(dup.isDuplicate, true);
    assert.equal(dup.matchedField, 'Website Link');
    assert.equal(dup.existingPost?.posterName, 'Kawsar');
    assert.equal(dup.existingPost?.note, 'Winter Promo');
  });

  it('parsePullPayload extracts paidCustomers and filterPullPayloadByDate preserves all paidCustomers while hiding historical leads', () => {
    const todayIso = new Date('2026-11-21T10:00:00+06:00').toISOString();
    const yesterdayIso = new Date('2026-11-20T15:00:00+06:00').toISOString();

    const parsed = parsePullPayload({
      ok: true,
      leads: [
        { id: 'L-TODAY', createdAt: todayIso },
        { id: 'L-OLD', createdAt: yesterdayIso },
      ],
      callLogs: [{ id: 'C-TODAY', timestamp: todayIso }],
      contentPosts: [],
      paidCustomers: [
        {
          id: 'PC-OLD-ACTIVE',
          leadId: 'L-OLD',
          customerName: 'Older Paid Customer',
          phone: '01711223344',
          confirmedDate: '2026-10-25',
          renewalDate: '2026-11-24',
          renewalStatus: 'Active',
        },
      ],
    });

    assert.ok(parsed);
    assert.equal(parsed.paidCustomers.length, 1);

    const filtered = filterPullPayloadByDate(parsed, '2026-11-21');
    assert.deepEqual(filtered.leads.map((l) => l.id), ['L-TODAY']);
    assert.equal(filtered.paidCustomers.length, 1);
    assert.equal(filtered.paidCustomers[0].id, 'PC-OLD-ACTIVE');
  });

  it('mergeRemotePaidCustomers applies manual Google Sheets status/renewal edits cleanly two-way', () => {
    const local: PaidCustomer[] = [
      {
        id: 'PC-RBD-1',
        leadId: 'RBD-1',
        customerName: 'Mahmudul Hasan',
        phone: '01711223344',
        assignedAgentId: 'agent-tanjin',
        assignedAgentName: 'Tanjin',
        confirmedDate: '2026-10-22',
        renewalDate: '2026-11-21',
        renewalStatus: 'Active',
        lastRenewedAt: null,
        notes: 'Initial order',
        createdAt: '2026-10-22T09:00:00.000Z',
        updatedAt: '2026-10-22T09:00:00.000Z',
      },
    ];

    const merged = mergeRemotePaidCustomers(local, [
      {
        id: 'PC-RBD-1',
        leadId: 'RBD-1',
        customerName: 'Mahmudul Hasan',
        phone: "'+8801711223344",
        assignedAgentName: 'Tanjin',
        confirmedDate: '2026-10-22',
        renewalDate: '2026-12-21', // manually renewed inside Google Sheet without updating UpdatedAt
        renewalStatus: 'Renewed',
      },
      {
        id: '',
        customerName: 'Sheet Manual Paid',
        phone: '01955667788',
        assignedAgentName: 'Sakib',
        confirmedDate: '2026-11-01',
        renewalDate: '2026-12-01',
        renewalStatus: 'Active',
      },
    ]);

    assert.equal(merged.length, 2);
    const updated = merged.find((c) => c.id === 'PC-RBD-1');
    const addedFromSheet = merged.find((c) => c.customerName === 'Sheet Manual Paid');
    assert.equal(updated?.renewalStatus, 'Renewed');
    assert.equal(updated?.renewalDate, '2026-12-21');
    assert.equal(updated?.phone, '01711223344');
    assert.ok(addedFromSheet);
    assert.equal(addedFromSheet?.id, 'SHEET-PC-1955667788');
    assert.equal(addedFromSheet?.assignedAgentId, 'agent-sakib');
    assert.equal(isFirestoreDocIdSafe(addedFromSheet?.id || ''), true);
  });

  it('mergeRemoteLeads and filterPullPayloadByDate preserve bare stored dates and never stamp missing dates as Today', () => {
    const now = new Date('2026-11-21T11:00:00+06:00');
    const todayIso = new Date('2026-11-21T09:00:00+06:00').toISOString();

    const filtered = filterPullPayloadByDate(
      {
        leads: [
          { id: 'L-TODAY-BARE', createdAt: '2026-11-21' },
          { id: 'L-YEST-BARE', createdAt: '2026-11-20', updatedAt: todayIso },
          { id: 'L-NO-CREATED', updatedAt: todayIso },
          { id: 'L-COLLECTED-YEST', collectedDate: '2026-11-20', updatedAt: todayIso },
        ],
        callLogs: [],
        contentPosts: [],
        paidCustomers: [],
      },
      '2026-11-21'
    );
    assert.deepEqual(filtered.leads.map((l) => l.id), ['L-TODAY-BARE']);

    const merged = mergeRemoteLeads([], [
      {
        id: 'L-OLD-NO-DATE',
        customerName: 'Historical Without CreatedAt',
        phone: '01711000001',
        updatedAt: todayIso,
      },
      {
        id: 'L-OLD-BARE',
        customerName: 'Yesterday Bare Date',
        phone: '01711000002',
        createdAt: '2026-11-20',
        updatedAt: todayIso,
      },
      {
        id: 'L-TODAY-ROW',
        customerName: 'Today Lead',
        phone: '01711000003',
        createdAt: '2026-11-21',
        updatedAt: todayIso,
      },
    ]);

    const noDate = merged.find((l) => l.id === 'L-OLD-NO-DATE');
    const bareOld = merged.find((l) => l.id === 'L-OLD-BARE');
    assert.equal(noDate?.createdAt, HISTORICAL_FALLBACK_ISO);
    assert.equal(bareOld?.createdAt, '2026-11-20T12:00:00.000Z');

    assert.deepEqual(
      filterTodayLeads(merged, now).map((l) => l.id),
      ['L-TODAY-ROW']
    );
  });

  it('parses ok:false error payloads and numeric BD phone numbers cleanly in sheet duplicate checks', () => {
    const leadErr = parseLeadDuplicateCheckResponse({
      ok: false,
      error: 'SpreadsheetApp permission denied',
    });
    assert.deepEqual(leadErr, {
      ok: false,
      isDuplicate: false,
      error: 'SpreadsheetApp permission denied',
    });

    const postErr = parsePostDuplicateCheckResponse({
      ok: false,
      error: 'Kawsar_Posts_Log missing',
    });
    assert.deepEqual(postErr, {
      ok: false,
      isDuplicate: false,
      error: 'Kawsar_Posts_Log missing',
    });

    const numericPhoneDup = parseLeadDuplicateCheckResponse({
      ok: true,
      isDuplicate: true,
      matchedBy: 'phone',
      lead: {
        id: 'RBD-IMP-24421',
        customerName: 'Sheet Customer',
        phone: 1728774634,
        collectorName: 'Naim',
        assignedAgentName: 'Kathy',
        status: 'Interested',
        createdAt: '2026-11-20T04:35:32.000Z',
      },
    });
    assert.equal(numericPhoneDup?.ok, true);
    assert.equal(numericPhoneDup?.isDuplicate, true);
    assert.equal(numericPhoneDup?.existingLead?.phone, '01728774634');
  });

  it('normalizes all BD phone variants consistently to 01XXXXXXXXX and merges duplicate alerts safely', () => {
    const variants = [
      '+880 1728-774634',
      '8801728774634',
      "'01728774634",
      '01728774634',
      '+88001728774634',
      '1728774634',
    ];
    for (const v of variants) {
      assert.equal(normalizeBdPhone(v), '01728774634');
      assert.equal(extractPhoneCoreKey(v), '1728774634');
    }

    const localAlert: DuplicateAttempt = {
      id: 'DUP-LOCAL-1',
      collectorId: 'collector-farhan',
      collectorName: 'Farhan',
      attemptedName: 'Test Dup',
      attemptedPhone: '+880 1728-774634',
      attemptedFacebook: '',
      matchedBy: 'phone',
      existingCollectorName: 'Naim',
      existingDate: '2026-11-20T04:35:32.000Z',
      timestamp: '2026-11-21T08:00:00.000Z',
    };
    const mergedEmpty = mergeRemoteDuplicateAttempts([localAlert], []);
    assert.equal(mergedEmpty.length, 1);
    assert.equal(mergedEmpty[0].id, 'DUP-LOCAL-1');

    const remoteAlert: DuplicateAttempt = {
      ...localAlert,
      id: 'DUP-REMOTE-2',
      timestamp: '2026-11-21T09:00:00.000Z',
    };
    const mergedBoth = mergeRemoteDuplicateAttempts([localAlert], [remoteAlert]);
    assert.deepEqual(
      mergedBoth.map((d) => d.id),
      ['DUP-REMOTE-2', 'DUP-LOCAL-1']
    );
  });

  it('handles pull-style { ok: true, leads / contentPosts } fallback responses during duplicate checks without erroring', () => {
    const pullStyleLeadsPayload = {
      ok: true,
      leads: [
        {
          id: 'RBD-SHEET-FRESH-2749',
          customerName: 'Sheet Fresh Lead 2749',
          phone: '01710002749',
          facebookLink: 'https://facebook.com/sheet.fresh.2749',
          collectorName: 'Naim',
          assignedAgentName: 'Sakib',
          status: 'Order Confirmed',
          updatedAt: '2026-11-20T11:00:00.000Z',
        },
        {
          id: 'RBD-SHEET-LIVE-1',
          customerName: 'Sheet Customer A',
          phone: '01988776655',
          facebookLink: 'https://facebook.com/sheet.cust.a',
          collectorName: 'Naim',
          assignedAgentName: 'Tanjin',
          status: 'Interested',
          updatedAt: '2026-11-20T09:00:00.000Z',
        },
      ],
    };

    const phoneMatch = parseLeadDuplicateCheckResponse(pullStyleLeadsPayload, {
      phone: '+880 1710-002749',
      facebookLink: '',
    });
    assert.equal(phoneMatch?.ok, true);
    assert.equal(phoneMatch?.isDuplicate, true);
    assert.equal(phoneMatch?.matchedBy, 'phone');
    assert.equal(phoneMatch?.existingLead?.id, 'RBD-SHEET-FRESH-2749');
    assert.equal(phoneMatch?.existingLead?.assignedAgentName, 'Sakib');

    const fbMatch = parseLeadDuplicateCheckResponse(pullStyleLeadsPayload, {
      phone: '01899998888',
      facebookLink: 'https://m.facebook.com/sheet.cust.a/?fbclid=xyz',
    });
    assert.equal(fbMatch?.ok, true);
    assert.equal(fbMatch?.isDuplicate, true);
    assert.equal(fbMatch?.matchedBy, 'facebook');
    assert.equal(fbMatch?.existingLead?.id, 'RBD-SHEET-LIVE-1');

    const uniqueLead = parseLeadDuplicateCheckResponse(pullStyleLeadsPayload, {
      phone: '01855443322',
      facebookLink: 'https://facebook.com/brand.new.person',
    });
    assert.deepEqual(uniqueLead, { ok: true, isDuplicate: false });

    const pullStylePostsPayload = {
      ok: true,
      contentPosts: [
        {
          id: 'PST-55',
          facebookLink: 'https://www.facebook.com/runbd/posts/55',
          websiteLink: 'https://runbd.com/products/kit-55',
          note: 'Kit 55 Promo',
          posterName: 'Kawsar',
          createdAt: '2026-11-20T10:00:00.000Z',
        },
      ],
    };

    const postMatch = parsePostDuplicateCheckResponse(pullStylePostsPayload, {
      facebookLink: 'https://m.facebook.com/runbd/posts/55?ref=bookmarks',
      websiteLink: '',
    });
    assert.equal(postMatch?.ok, true);
    assert.equal(postMatch?.isDuplicate, true);
    assert.equal(postMatch?.matchedField, 'Facebook Link');
    assert.equal(postMatch?.existingPost?.id, 'PST-55');

    const uniquePost = parsePostDuplicateCheckResponse(pullStylePostsPayload, {
      facebookLink: 'https://facebook.com/runbd/posts/9999',
      websiteLink: 'https://runbd.com/products/kit-9999',
    });
    assert.deepEqual(uniquePost, { ok: true, isDuplicate: false });
  });
});

describe('Per-Collector and Per-Agent Google Sheets tab naming & Apps Script template', () => {
  it('sanitizes collector and agent names into clean Collector_<Name> and Agent_<Name> sheet tab names', () => {
    assert.equal(getCollectorTabName('Farhan'), 'Collector_Farhan');
    assert.equal(getCollectorTabName('Naim'), 'Collector_Naim');
    assert.equal(getCollectorTabName('  Mehedi Hasan  '), 'Collector_Mehedi_Hasan');
    assert.equal(getCollectorTabName('Sajib [BD]/2:Lead*'), 'Collector_Sajib_BD_2_Lead');
    assert.equal(sanitizeSheetTabSuffix('   '), 'Unknown');
    assert.equal(getAgentTabName('Rakib Hasan'), 'Agent_Rakib_Hasan');
  });

  it('includes per-collector tab creation/upsert logic and normalizePhoneKey_ in GOOGLE_APPS_SCRIPT_CODE', () => {
    assert.ok(GOOGLE_APPS_SCRIPT_CODE.includes("var COLLECTOR_NAMES = ['Farhan', 'Naim'];"));
    assert.ok(GOOGLE_APPS_SCRIPT_CODE.includes('var COLLECTOR_TAB_HEADERS = ['));
    assert.ok(GOOGLE_APPS_SCRIPT_CODE.includes('function syncLeadAcrossCollectorTabs('));
    assert.ok(GOOGLE_APPS_SCRIPT_CODE.includes('function getCollectorTabName_(collectorName)'));
    assert.ok(GOOGLE_APPS_SCRIPT_CODE.includes('function normalizePhoneKey_(raw)'));
  });

  it('uses explicit Asia/Dhaka timezone everywhere in GOOGLE_APPS_SCRIPT_CODE instead of Session.getScriptTimeZone()', () => {
    assert.ok(GOOGLE_APPS_SCRIPT_CODE.includes('function getDhakaTodayYmd_()'));
    assert.ok(GOOGLE_APPS_SCRIPT_CODE.includes("Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyyy-MM-dd')"));
    assert.ok(GOOGLE_APPS_SCRIPT_CODE.includes("Utilities.formatDate(d, 'Asia/Dhaka', 'yyyy-MM-dd')"));
    assert.equal(GOOGLE_APPS_SCRIPT_CODE.includes('Session.getScriptTimeZone()'), false);
  });

  it('sanitizes Paid_<AgentName> tab names and enriches paidCustomers with Facebook link and collector info', () => {
    assert.equal(getPaidAgentTabName('Tanjin'), 'Paid_Tanjin');
    assert.equal(getPaidAgentTabName('Rakib Hasan'), 'Paid_Rakib_Hasan');
    assert.equal(getPaidAgentTabName('Sajib [BD]/2:Lead*'), 'Paid_Sajib_BD_2_Lead');

    const leads: Lead[] = [
      {
        id: 'RBD-101',
        customerName: 'Car',
        phone: '01711000999',
        rawPhone: '+880 1711-000999',
        facebookLink: 'https://facebook.com/cust.101',
        normalizedFacebookLink: 'facebook.com/cust.101',
        notes: 'Confirmed by phone',
        collectorId: 'collector-shuvo',
        collectorName: 'Shuvo',
        assignedAgentId: 'agent-tanjin',
        assignedAgentName: 'Tanjin',
        status: 'Order Confirmed',
        followUpAt: null,
        lastCallNotes: 'Wants Friday delivery',
        createdAt: '2026-11-23T06:00:00.000Z',
        updatedAt: '2026-11-23T07:00:00.000Z',
      },
    ];
    const paidCustomers: PaidCustomer[] = [
      {
        id: 'PC-RBD-101',
        leadId: 'RBD-101',
        customerName: 'Car',
        phone: '01711000999',
        assignedAgentId: 'agent-tanjin',
        assignedAgentName: 'Tanjin',
        confirmedDate: '2026-11-23',
        renewalDate: '2026-12-23',
        renewalStatus: 'Active',
        lastRenewedAt: null,
        notes: 'Wants Friday delivery',
        createdAt: '2026-11-23T07:00:00.000Z',
        updatedAt: '2026-11-23T07:00:00.000Z',
      },
    ];

    const enriched = enrichPaidCustomersForSheetSync(paidCustomers, leads);
    assert.equal(enriched.length, 1);
    assert.equal(enriched[0].facebookLink, 'https://facebook.com/cust.101');
    assert.equal(enriched[0].collectorName, 'Shuvo');
    assert.equal(enriched[0].amountOrPackage, '1-Month Package (Renewal: 2026-12-23)');
  });

  it('executes GOOGLE_APPS_SCRIPT_CODE doPost cleanly to provision Paid_<Agent> & Collector_<Name> tabs, backfill rows, and prevent phone duplicates', () => {
    assert.ok(GOOGLE_APPS_SCRIPT_CODE.includes('var PAID_AGENT_TAB_HEADERS = ['));
    assert.ok(GOOGLE_APPS_SCRIPT_CODE.includes('function getPaidAgentTabName_(agentName)'));
    assert.ok(GOOGLE_APPS_SCRIPT_CODE.includes('function syncPaidCustomerAcrossPaidTabs_('));

    const makeMockSheet = (name: string) => {
      const rows: unknown[][] = [];
      return {
        getName: () => name,
        appendRow: (row: unknown[]) => {
          rows.push([...row]);
        },
        getLastRow: () => rows.length,
        getLastColumn: () => (rows[0] ? rows[0].length : 0),
        getDataRange: () => ({
          getValues: () => rows.map((r) => [...r]),
        }),
        getRange: (row: number, col: number, numRows: number, numCols: number) => ({
          setFontWeight: () => {},
          getValues: () => {
            const out: unknown[][] = [];
            for (let r = row - 1; r < row - 1 + numRows; r++) {
              const src = rows[r] ?? [];
              const slice: unknown[] = [];
              for (let c = col - 1; c < col - 1 + numCols; c++) {
                slice.push(src[c] ?? '');
              }
              out.push(slice);
            }
            return out;
          },
          setValues: (newVals: unknown[][]) => {
            for (let r = 0; r < numRows; r++) {
              const targetIdx = row - 1 + r;
              while (rows.length <= targetIdx) rows.push([]);
              for (let c = 0; c < numCols; c++) {
                rows[targetIdx][col - 1 + c] = newVals[r][c];
              }
            }
          },
        }),
        deleteRow: (rowNum: number) => {
          rows.splice(rowNum - 1, 1);
        },
        setFrozenRows: () => {},
        _rows: rows,
      };
    };

    const sheetsMap = new Map<string, ReturnType<typeof makeMockSheet>>();
    const mockSpreadsheet = {
      getSheetByName: (name: string) => sheetsMap.get(name) ?? null,
      insertSheet: (name: string) => {
        const s = makeMockSheet(name);
        sheetsMap.set(name, s);
        return s;
      },
      getSheets: () => Array.from(sheetsMap.values()),
    };

    // Pre-populate historical Master_Data & Paid_Customers rows to verify backfill
    const preMaster = mockSpreadsheet.insertSheet('Master_Data');
    preMaster.appendRow([
      'Lead ID', 'Customer Name', 'Phone', 'Facebook Link', 'Collector',
      'Assigned Agent', 'Latest Status', 'Follow-up At', 'Notes', 'Updated At', 'Created At',
    ]);
    preMaster.appendRow([
      'RBD-OLD-1', 'Truck', "'01811223344", 'https://facebook.com/old.truck', 'Kawser',
      'Kathy', 'Order Confirmed', '', 'Historical confirmed', '2026-11-20T10:00:00.000Z', '2026-11-20T09:00:00.000Z',
    ]);
    const prePaid = mockSpreadsheet.insertSheet('Paid_Customers');
    prePaid.appendRow([
      'Customer ID', 'Lead ID', 'Customer Name', 'Phone', 'Assigned Agent',
      'Confirmed Date', 'Renewal Date', 'Days Remaining', 'Renewal Status', 'Updated At',
    ]);
    prePaid.appendRow([
      'PC-RBD-OLD-1', 'RBD-OLD-1', 'Truck', "'01811223344", 'Kathy',
      "'2026-11-20", "'2026-12-20", 27, 'Active', '2026-11-20T10:00:00.000Z',
    ]);

    const sandbox: Record<string, unknown> = {
      SpreadsheetApp: { getActiveSpreadsheet: () => mockSpreadsheet },
      Utilities: {
        formatDate: (d: Date) => {
          const ms = d.getTime() + 6 * 3600 * 1000;
          return new Date(ms).toISOString().slice(0, 10);
        },
      },
      ContentService: {
        MimeType: { JSON: 'JSON' },
        createTextOutput: (txt: string) => ({
          setMimeType: () => txt,
        }),
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(GOOGLE_APPS_SCRIPT_CODE, sandbox);

    const doPost = sandbox.doPost as (e: { postData: { contents: string } }) => string;

    // 1. TEST_SYNC provisions dynamic collector & agent Paid_ tabs and backfills
    const res1 = JSON.parse(
      doPost({
        postData: {
          contents: JSON.stringify({
            event: 'TEST_SYNC',
            agentNames: ['Tanjin', 'Kathy', 'Nusrat'],
            collectorNames: ['Farhan', 'Naim', 'Shuvo', 'Kawser'],
            leads: [
              {
                id: 'RBD-LIVE-1',
                customerName: 'Car',
                phone: '01711000999',
                facebookLink: 'https://facebook.com/live.car',
                collectorName: 'Shuvo',
                assignedAgentName: 'Nusrat',
                status: 'Order Confirmed',
                notes: 'Test note',
                createdAt: '2026-11-23T06:00:00.000Z',
                updatedAt: '2026-11-23T07:00:00.000Z',
              },
            ],
            paidCustomers: [
              {
                id: 'PC-RBD-LIVE-1',
                leadId: 'RBD-LIVE-1',
                customerName: 'Car',
                phone: '01711000999',
                facebookLink: 'https://facebook.com/live.car',
                collectorName: 'Shuvo',
                assignedAgentName: 'Nusrat',
                confirmedDate: '2026-11-23',
                renewalDate: '2026-12-23',
                renewalStatus: 'Active',
                amountOrPackage: '1-Month Package (Renewal: 2026-12-23)',
                notes: 'Test note',
                updatedAt: '2026-11-23T07:00:00.000Z',
              },
            ],
          }),
        },
      })
    );
    assert.equal(res1.ok, true);

    assert.ok(sheetsMap.has('Collector_Shuvo'));
    assert.ok(sheetsMap.has('Collector_Kawser'));
    assert.ok(sheetsMap.has('Paid_Tanjin'));
    assert.ok(sheetsMap.has('Paid_Kathy'));
    assert.ok(sheetsMap.has('Paid_Nusrat'));

    const paidNusratRows = sheetsMap.get('Paid_Nusrat')!._rows;
    assert.equal(paidNusratRows.length, 2); // header + 1 row
    assert.equal(paidNusratRows[1][0], 'PC-RBD-LIVE-1');
    assert.equal(paidNusratRows[1][2], 'Car');
    assert.equal(paidNusratRows[1][3], "'01711000999");
    assert.equal(paidNusratRows[1][4], 'https://facebook.com/live.car');
    assert.equal(paidNusratRows[1][5], 'Shuvo');
    assert.equal(paidNusratRows[1][6], 'Nusrat');

    // Backfilled historical Collector_Kawser & Paid_Kathy
    assert.equal(sheetsMap.get('Collector_Kawser')!._rows.length, 2);
    const paidKathyRows = sheetsMap.get('Paid_Kathy')!._rows;
    assert.equal(paidKathyRows.length, 2);
    assert.equal(paidKathyRows[1][4], 'https://facebook.com/old.truck');
    assert.equal(paidKathyRows[1][5], 'Kawser');

    // 2. Duplicate protection by normalized BD phone (+880 1711-000999 vs 01711000999)
    doPost({
      postData: {
        contents: JSON.stringify({
          event: 'PAID_CUSTOMER_UPSERT',
          paidCustomer: {
            id: 'PC-ALT-ID',
            leadId: 'RBD-LIVE-1',
            customerName: 'Car',
            phone: '+880 1711-000999',
            assignedAgentName: 'Nusrat',
            confirmedDate: '2026-11-23',
            notes: 'Updated notes without dup',
            updatedAt: '2026-11-23T08:00:00.000Z',
          },
        }),
      },
    });
    assert.equal(sheetsMap.get('Paid_Nusrat')!._rows.length, 2);
    assert.equal(sheetsMap.get('Paid_Nusrat')!._rows[1][8], 'Updated notes without dup');

    // 3. Reassignment moves row from Paid_Nusrat to Paid_Tanjin
    doPost({
      postData: {
        contents: JSON.stringify({
          event: 'LEAD_UPSERT',
          lead: {
            id: 'RBD-LIVE-1',
            customerName: 'Car',
            phone: '01711000999',
            facebookLink: 'https://facebook.com/live.car',
            collectorName: 'Shuvo',
            assignedAgentName: 'Tanjin',
            status: 'Order Confirmed',
            updatedAt: '2026-11-23T09:00:00.000Z',
          },
          paidCustomer: {
            id: 'PC-RBD-LIVE-1',
            leadId: 'RBD-LIVE-1',
            customerName: 'Car',
            phone: '01711000999',
            facebookLink: 'https://facebook.com/live.car',
            collectorName: 'Shuvo',
            assignedAgentName: 'Tanjin',
            confirmedDate: '2026-11-23',
            notes: 'Moved to Tanjin',
            updatedAt: '2026-11-23T09:00:00.000Z',
          },
        }),
      },
    });
    assert.equal(sheetsMap.get('Paid_Nusrat')!._rows.length, 1); // header only
    assert.equal(sheetsMap.get('Paid_Tanjin')!._rows.length, 2);
    assert.equal(sheetsMap.get('Paid_Tanjin')!._rows[1][6], 'Tanjin');
  });
});

describe('Google Sheets sync timeout, abort reason & concurrency safety', () => {
  it('configures >= 45s default timeouts and descriptive AbortError DOMException reasons', () => {
    assert.ok(DEFAULT_SHEETS_SYNC_TIMEOUT_MS >= 45000);
    assert.ok(FULL_SYNC_TIMEOUT_MS >= 45000);

    const reason = createTimeoutAbortReason(45000);
    assert.equal(reason.name, 'AbortError');
    assert.equal(reason.message, 'Google Sheets sync timed out after 45s');

    const rawAbortMsg = describeWebhookFetchError(
      new DOMException('signal is aborted without reason', 'AbortError'),
      45000
    );
    assert.equal(rawAbortMsg.includes('signal is aborted without reason'), false);
    assert.ok(rawAbortMsg.includes('timed out after 45s'));

    const rawStringMsg = describeWebhookFetchError('signal is aborted without reason', 45000);
    assert.equal(rawStringMsg.includes('signal is aborted without reason'), false);
    assert.ok(rawStringMsg.includes('timed out after 45s'));
  });

  it('aborts hanging push/pull calls cleanly with explicit timeout reason and handles superseded requests without erroring', async () => {
    const origFetch = globalThis.fetch;
    let capturedSignalReason: unknown = null;

    globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const sig = init?.signal;
        if (!sig) return;
        const onAbort = () => {
          capturedSignalReason = sig.reason;
          reject(sig.reason ?? new DOMException('signal is aborted without reason', 'AbortError'));
        };
        if (sig.aborted) {
          onAbort();
        } else {
          sig.addEventListener('abort', onAbort, { once: true });
        }
      })) as typeof fetch;

    try {
      const pushTimeoutRes = await pushToGoogleSheetsWebhook(
        'https://script.google.com/macros/s/test/exec',
        {
          event: 'TEST_SYNC',
          dailySummary: {
            date: '2026-11-23',
            totalLeads: 1,
            callsMadeToday: 0,
            orderConfirmedCount: 0,
            interestedCount: 0,
            conversionRate: 0,
          },
        },
        { timeoutMs: 25 }
      );
      assert.equal(pushTimeoutRes.ok, false);
      assert.equal(pushTimeoutRes.timedOut, true);
      assert.equal(pushTimeoutRes.superseded, undefined);
      assert.ok(capturedSignalReason instanceof DOMException);
      assert.equal((capturedSignalReason as DOMException).name, 'AbortError');
      assert.ok((pushTimeoutRes.error ?? '').includes('Google Apps Script'));

      const pullTimeoutRes = await pullFromGoogleSheetsWebhook(
        'https://script.google.com/macros/s/test/exec',
        { timeoutMs: 25 }
      );
      assert.equal(pullTimeoutRes.ok, false);
      assert.equal(pullTimeoutRes.timedOut, true);
      assert.ok((pullTimeoutRes.error ?? '').includes('Google Apps Script'));

      const externalController = new AbortController();
      const pendingPull = pullFromGoogleSheetsWebhook(
        'https://script.google.com/macros/s/test/exec',
        { timeoutMs: 45000, signal: externalController.signal }
      );
      externalController.abort(
        new DOMException('Superseded by newer sync', SUPERSEDED_SYNC_ERROR_NAME)
      );
      const supersededRes = await pendingPull;
      assert.equal(supersededRes.ok, false);
      assert.equal(supersededRes.superseded, true);
      assert.equal(supersededRes.timedOut, undefined);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('Chunked Google Sheets sync & Code.gs O(tabs) batch performance on 195+ leads', () => {
  const makeTestLead = (i: number): Lead => ({
    id: `RBD-BULK-${i}`,
    customerName: i % 2 === 0 ? 'Car' : 'Bike',
    phone: `01710${String(100000 + i)}`,
    rawPhone: `01710${String(100000 + i)}`,
    facebookLink: `https://facebook.com/bulk.user.${i}`,
    normalizedFacebookLink: `facebook.com/bulk.user.${i}`,
    notes: `Note ${i}`,
    collectorId: i % 2 === 0 ? 'collector-farhan' : 'collector-naim',
    collectorName: i % 2 === 0 ? 'Farhan' : 'Naim',
    assignedAgentId: i % 3 === 0 ? 'agent-tanjin' : i % 3 === 1 ? 'agent-kathy' : 'agent-sakib',
    assignedAgentName: i % 3 === 0 ? 'Tanjin' : i % 3 === 1 ? 'Kathy' : 'Sakib',
    status: i % 10 === 0 ? 'Order Confirmed' : 'Interested',
    followUpAt: null,
    lastCallNotes: `Call note ${i}`,
    createdAt: '2026-11-23T06:00:00.000Z',
    updatedAt: '2026-11-23T07:00:00.000Z',
  });

  it('splits 195+ leads, call logs, posts, and paid customers into <=50-record sequential chunks', () => {
    assert.equal(DEFAULT_SHEETS_BATCH_SIZE, 50);
    const leads = Array.from({ length: 195 }, (_, idx) => makeTestLead(idx + 1));
    const callLogs: CallLog[] = Array.from({ length: 40 }, (_, idx) => ({
      id: `CL-BULK-${idx + 1}`,
      leadId: `RBD-BULK-${idx + 1}`,
      customerName: 'Car',
      phone: `01710${String(100001 + idx)}`,
      agentId: 'agent-tanjin',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Interested',
      notes: 'Called',
      followUpAt: null,
      timestamp: '2026-11-23T08:00:00.000Z',
    }));
    const contentPosts: ContentPost[] = Array.from({ length: 10 }, (_, idx) => ({
      id: `PST-BULK-${idx + 1}`,
      facebookLink: `https://facebook.com/post/${idx + 1}`,
      normalizedFacebookLink: `facebook.com/post/${idx + 1}`,
      websiteLink: '',
      normalizedWebsiteLink: '',
      note: 'Promo',
      posterId: 'poster-kawsar',
      posterName: 'Kawsar',
      createdAt: '2026-11-23T08:00:00.000Z',
    }));
    const paidCustomers: PaidCustomer[] = Array.from({ length: 25 }, (_, idx) => ({
      id: `PC-RBD-BULK-${idx + 1}`,
      leadId: `RBD-BULK-${idx + 1}`,
      customerName: 'Car',
      phone: `01710${String(100001 + idx)}`,
      assignedAgentId: 'agent-tanjin',
      assignedAgentName: 'Tanjin',
      confirmedDate: '2026-11-23',
      renewalDate: '2026-12-23',
      renewalStatus: 'Active',
      lastRenewedAt: null,
      notes: 'Paid',
      createdAt: '2026-11-23T08:00:00.000Z',
      updatedAt: '2026-11-23T08:00:00.000Z',
    }));

    const chunks = buildSheetsSyncChunks({
      event: 'TEST_SYNC',
      leads,
      callLogs,
      contentPosts,
      paidCustomers,
    });

    assert.equal(chunks.length, 6); // 270 records / 50 = 6 chunks
    for (let i = 0; i < chunks.length; i++) {
      assert.ok(chunks[i].totalRecordsInChunk <= 50);
      assert.equal(chunks[i].chunkIndex, i + 1);
      assert.equal(chunks[i].totalChunks, 6);
      if (i < chunks.length - 1) {
        assert.equal(chunks[i].event, 'LEADS_BATCH_UPSERT');
        assert.equal(chunks[i].skipBackfill, true);
        assert.equal(chunks[i].includeSummaries, false);
      } else {
        assert.equal(chunks[i].event, 'TEST_SYNC');
        assert.equal(chunks[i].skipBackfill, false);
        assert.equal(chunks[i].includeSummaries, true);
      }
    }

    const totalLeadsPacked = chunks.reduce((s, c) => s + c.leads.length, 0);
    const totalLogsPacked = chunks.reduce((s, c) => s + c.callLogs.length, 0);
    const totalPostsPacked = chunks.reduce((s, c) => s + c.contentPosts.length, 0);
    const totalPaidPacked = chunks.reduce((s, c) => s + c.paidCustomers.length, 0);
    assert.equal(totalLeadsPacked, 195);
    assert.equal(totalLogsPacked, 40);
    assert.equal(totalPostsPacked, 10);
    assert.equal(totalPaidPacked, 25);

    // Empty sync still sends 1 TEST_SYNC chunk to provision tabs & update summaries
    const emptyChunks = buildSheetsSyncChunks({ event: 'TEST_SYNC', leads: [] });
    assert.equal(emptyChunks.length, 1);
    assert.equal(emptyChunks[0].event, 'TEST_SYNC');
    assert.equal(emptyChunks[0].skipBackfill, false);
    assert.equal(emptyChunks[0].includeSummaries, true);
  });

  it('dispatches chunked requests sequentially with progress, handles mid-batch timeouts, and stops on supersede', async () => {
    const origFetch = globalThis.fetch;
    const leads = Array.from({ length: 120 }, (_, idx) => makeTestLead(idx + 1));
    const sentBodies: Array<Record<string, unknown>> = [];
    const progressEvents: Array<{ chunkIndex: number; totalChunks: number }> = [];

    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      sentBodies.push(parsed);
      return new Response('', { status: 200 });
    }) as typeof fetch;

    try {
      const res = await pushChunkedSheetsSync(
        'https://script.google.com/macros/s/test/exec',
        {
          event: 'TEST_SYNC',
          leads,
          agentNames: ['Tanjin', 'Kathy', 'Sakib'],
          collectorNames: ['Farhan', 'Naim'],
          dailySummary: {
            date: '2026-11-23',
            totalLeads: 120,
            callsMadeToday: 0,
            orderConfirmedCount: 12,
            interestedCount: 108,
            conversionRate: 10,
          },
        },
        {
          batchSize: 50,
          onProgress: (p) => progressEvents.push({ chunkIndex: p.chunkIndex, totalChunks: p.totalChunks }),
        }
      );

      assert.equal(res.ok, true);
      assert.equal(res.completedChunks, 3);
      assert.equal(res.totalChunks, 3);
      assert.equal(sentBodies.length, 3);
      assert.equal(sentBodies[0].event, 'LEADS_BATCH_UPSERT');
      assert.equal(sentBodies[0].skipBackfill, true);
      assert.equal(sentBodies[0].dailySummary, undefined);
      assert.equal((sentBodies[0].leads as Lead[]).length, 50);
      assert.equal(sentBodies[1].event, 'LEADS_BATCH_UPSERT');
      assert.equal((sentBodies[1].leads as Lead[]).length, 50);
      assert.equal(sentBodies[2].event, 'TEST_SYNC');
      assert.equal(sentBodies[2].skipBackfill, false);
      assert.ok(sentBodies[2].dailySummary);
      assert.equal((sentBodies[2].leads as Lead[]).length, 20);
      assert.ok(progressEvents.length >= 3);

      // Superseding mid-flight stops subsequent batches cleanly
      const controller = new AbortController();
      let callCount = 0;
      globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
        callCount += 1;
        if (callCount === 2) {
          controller.abort(new DOMException('Superseded', SUPERSEDED_SYNC_ERROR_NAME));
          throw init?.signal?.reason;
        }
        return new Response('', { status: 200 });
      }) as typeof fetch;

      const supRes = await pushChunkedSheetsSync(
        'https://script.google.com/macros/s/test/exec',
        { event: 'TEST_SYNC', leads },
        { batchSize: 50, signal: controller.signal }
      );
      assert.equal(supRes.ok, false);
      assert.equal(supRes.superseded, true);
      assert.equal(callCount, 2);

      // Mid-batch timeout surfaces batch index clearly
      let failCall = 0;
      globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
        failCall += 1;
        if (failCall === 1) {
          return Promise.resolve(new Response('', { status: 200 }));
        }
        return new Promise((_resolve, reject) => {
          const sig = init?.signal;
          sig?.addEventListener('abort', () => reject(sig.reason), { once: true });
        });
      }) as typeof fetch;

      const timeoutRes = await pushChunkedSheetsSync(
        'https://script.google.com/macros/s/test/exec',
        { event: 'TEST_SYNC', leads },
        { batchSize: 50, timeoutMs: 20 }
      );
      assert.equal(timeoutRes.ok, false);
      assert.equal(timeoutRes.timedOut, true);
      assert.equal(timeoutRes.completedChunks, 1);
      assert.ok((timeoutRes.error ?? '').includes('Batch 2/3:'));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('executes optimized Code.gs doPost across 210 chunked leads in O(tabs) batched RPC calls without per-row scans', () => {
    const rpcCounts = {
      getValues: 0,
      setValues: 0,
      appendRow: 0,
      deleteRow: 0,
      deleteRows: 0,
      getSheets: 0,
    };

    const makeInstrumentedSheet = (name: string) => {
      const rows: unknown[][] = [];
      return {
        getName: () => name,
        appendRow: (row: unknown[]) => {
          rpcCounts.appendRow += 1;
          rows.push([...row]);
        },
        getLastRow: () => rows.length,
        getLastColumn: () => (rows[0] ? rows[0].length : 0),
        getDataRange: () => ({
          getValues: () => {
            rpcCounts.getValues += 1;
            return rows.map((r) => [...r]);
          },
        }),
        getRange: (row: number, col: number, numRows: number, numCols: number) => ({
          setFontWeight: () => {},
          getValues: () => {
            rpcCounts.getValues += 1;
            const out: unknown[][] = [];
            for (let r = row - 1; r < row - 1 + numRows; r++) {
              const src = rows[r] ?? [];
              const slice: unknown[] = [];
              for (let c = col - 1; c < col - 1 + numCols; c++) {
                slice.push(src[c] ?? '');
              }
              out.push(slice);
            }
            return out;
          },
          setValues: (newVals: unknown[][]) => {
            rpcCounts.setValues += 1;
            for (let r = 0; r < numRows; r++) {
              const targetIdx = row - 1 + r;
              while (rows.length <= targetIdx) rows.push([]);
              for (let c = 0; c < numCols; c++) {
                rows[targetIdx][col - 1 + c] = newVals[r][c];
              }
            }
          },
        }),
        deleteRows: (rowNum: number, howMany: number) => {
          rpcCounts.deleteRows += 1;
          rows.splice(rowNum - 1, howMany);
        },
        deleteRow: (rowNum: number) => {
          rpcCounts.deleteRow += 1;
          rows.splice(rowNum - 1, 1);
        },
        setFrozenRows: () => {},
        _rows: rows,
      };
    };

    const sheetsMap = new Map<string, ReturnType<typeof makeInstrumentedSheet>>();
    const mockSpreadsheet = {
      getSheetByName: (name: string) => sheetsMap.get(name) ?? null,
      insertSheet: (name: string) => {
        const s = makeInstrumentedSheet(name);
        sheetsMap.set(name, s);
        return s;
      },
      getSheets: () => {
        rpcCounts.getSheets += 1;
        return Array.from(sheetsMap.values());
      },
    };

    const sandbox: Record<string, unknown> = {
      SpreadsheetApp: { getActiveSpreadsheet: () => mockSpreadsheet },
      Utilities: {
        formatDate: (d: Date) => {
          const ms = d.getTime() + 6 * 3600 * 1000;
          return new Date(ms).toISOString().slice(0, 10);
        },
      },
      ContentService: {
        MimeType: { JSON: 'JSON' },
        createTextOutput: (txt: string) => ({
          setMimeType: () => txt,
        }),
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(GOOGLE_APPS_SCRIPT_CODE, sandbox);
    const doPost = sandbox.doPost as (e: { postData: { contents: string } }) => string;

    const bulkLeads = Array.from({ length: 210 }, (_, idx) => makeTestLead(idx + 1));
    const bulkPaid: PaidCustomer[] = bulkLeads
      .filter((l) => l.status === 'Order Confirmed')
      .map((l) => ({
        id: `PC-${l.id}`,
        leadId: l.id,
        customerName: l.customerName,
        phone: l.phone,
        assignedAgentId: l.assignedAgentId,
        assignedAgentName: l.assignedAgentName,
        confirmedDate: '2026-11-23',
        renewalDate: '2026-12-23',
        renewalStatus: 'Active',
        lastRenewedAt: null,
        notes: l.notes,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      }));

    const chunks = buildSheetsSyncChunks({
      event: 'TEST_SYNC',
      leads: bulkLeads,
      paidCustomers: bulkPaid,
    });

    for (const chunk of chunks) {
      const payload = {
        event: chunk.event,
        leads: chunk.leads,
        paidCustomers: chunk.paidCustomers,
        agentNames: ['Tanjin', 'Kathy', 'Tania', 'Shanaz', 'Sizon', 'Sakib'],
        collectorNames: ['Farhan', 'Naim'],
        skipBackfill: chunk.skipBackfill,
        ...(chunk.includeSummaries
          ? {
              dailySummary: {
                date: '2026-11-23',
                totalLeads: 210,
                callsMadeToday: 0,
                orderConfirmedCount: bulkPaid.length,
                interestedCount: 210 - bulkPaid.length,
                conversionRate: 10,
              },
            }
          : {}),
      };
      const out = JSON.parse(doPost({ postData: { contents: JSON.stringify(payload) } }));
      assert.equal(out.ok, true);
    }

    // All 210 leads written cleanly to Master_Data + split accurately across Collector_Farhan & Collector_Naim
    assert.equal(sheetsMap.get('Master_Data')!._rows.length, 211); // 1 header + 210
    assert.equal(sheetsMap.get('Collector_Farhan')!._rows.length, 106); // 1 header + 105
    assert.equal(sheetsMap.get('Collector_Naim')!._rows.length, 106); // 1 header + 105
    assert.equal(sheetsMap.get('Agent_Tanjin')!._rows.length, 71); // 1 header + 70
    assert.equal(sheetsMap.get('Agent_Kathy')!._rows.length, 71); // 1 header + 70
    assert.equal(sheetsMap.get('Agent_Sakib')!._rows.length, 71); // 1 header + 70
    assert.equal(sheetsMap.get('Paid_Customers')!._rows.length, 1 + bulkPaid.length);

    // Crucial performance invariant: batch writes instead of 210+ single-row setValues/appendRow RPCs
    // Only sheet creation header appendRows (20 initial tabs) call appendRow; all 210+ data rows use batch setValues (~1 per modified tab per chunk)
    assert.ok(
      rpcCounts.appendRow <= 25,
      `Expected appendRow only for initial tab headers (<=25), got ${rpcCounts.appendRow}`
    );
    assert.ok(
      rpcCounts.setValues <= 60,
      `Expected <= 60 batch setValues RPCs across 5 chunks (~1 per modified tab per chunk), got ${rpcCounts.setValues}`
    );
    assert.ok(
      rpcCounts.getValues <= 90,
      `Expected <= 90 single-tab getValues RPCs across 5 chunks, got ${rpcCounts.getValues}`
    );
    assert.ok(
      rpcCounts.getSheets <= chunks.length,
      `Expected <= ${chunks.length} getSheets RPCs, got ${rpcCounts.getSheets}`
    );
  });
});

describe('Kawsar_Posts_Log TikTok, Instagram, and Twitter links in sheetsSync and Apps Script', () => {
  it('merges, deduplicates, and parses post duplicate responses across TikTok, Instagram, and Twitter', () => {
    const parsedDup = parsePostDuplicateCheckResponse({
      ok: true,
      isDuplicate: true,
      matchedField: 'Instagram Link',
      existingPost: {
        id: 'PST-EXT-1',
        instagramLink: 'https://www.instagram.com/p/C9xyz',
        tiktokLink: 'https://www.tiktok.com/@runbd/video/123',
        twitterLink: 'https://x.com/runbd/status/456',
        posterName: 'Kawsar',
        note: 'Promo reel',
        timestamp: '2026-11-23T10:00:00.000Z',
      },
    });
    assert.ok(parsedDup);
    assert.equal(parsedDup.ok, true);
    assert.equal(parsedDup.isDuplicate, true);
    assert.equal(parsedDup.matchedField, 'Instagram Link');
    assert.equal(parsedDup.existingPost?.tiktokLink, 'https://www.tiktok.com/@runbd/video/123');
    assert.equal(parsedDup.existingPost?.twitterLink, 'https://x.com/runbd/status/456');

    const localPosts: ContentPost[] = [
      {
        id: 'PST-1',
        facebookLink: '',
        normalizedFacebookLink: '',
        websiteLink: '',
        normalizedWebsiteLink: '',
        tiktokLink: 'https://www.tiktok.com/@runbd/video/111',
        normalizedTiktokLink: 'tiktok.com/@runbd/video/111',
        instagramLink: '',
        normalizedInstagramLink: '',
        twitterLink: '',
        normalizedTwitterLink: '',
        note: 'TT post',
        posterId: 'poster-kawsar',
        posterName: 'Kawsar',
        createdAt: '2026-11-23T08:00:00.000Z',
      },
    ];
    const remotePosts: ContentPost[] = [
      {
        id: 'PST-2',
        facebookLink: '',
        normalizedFacebookLink: '',
        websiteLink: '',
        normalizedWebsiteLink: '',
        tiktokLink: 'https://www.tiktok.com/@runbd/video/111?is_from_webapp=1',
        normalizedTiktokLink: 'tiktok.com/@runbd/video/111',
        instagramLink: 'https://instagram.com/p/NEW1',
        normalizedInstagramLink: 'instagram.com/p/NEW1',
        twitterLink: 'https://twitter.com/runbd/status/777',
        normalizedTwitterLink: 'x.com/runbd/status/777',
        note: 'Duplicate TT + new IG/TW',
        posterId: 'poster-kawsar',
        posterName: 'Kawsar',
        createdAt: '2026-11-23T09:00:00.000Z',
      },
    ];

    const merged = mergeRemoteContentPosts(localPosts, remotePosts);
    assert.equal(merged.length, 2);
    assert.equal(merged.find((p) => p.id === 'PST-2')?.normalizedTwitterLink, 'x.com/runbd/status/777');

    const flags = detectPostDuplicatesInList(merged);
    assert.equal(flags.length, 1);
    assert.equal(flags[0].matchedField, 'TikTok Link');
    assert.equal(flags[0].originalPostId, 'PST-1');
    assert.equal(flags[0].duplicatePostId, 'PST-2');
  });

  it('upgrades legacy 6-col Kawsar_Posts_Log, logs TikTok/Instagram/Twitter links, checks duplicates via doGet, and pulls all 5 link fields', () => {
    const makeUpgradeableSheet = (name: string) => {
      const rows: unknown[][] = [];
      return {
        getName: () => name,
        appendRow: (row: unknown[]) => rows.push([...row]),
        getLastRow: () => rows.length,
        getLastColumn: () => (rows[0] ? rows[0].length : 0),
        insertColumnsBefore: (beforePos: number, howMany: number) => {
          const idx = beforePos - 1;
          for (let r = 0; r < rows.length; r++) {
            const blanks = Array.from({ length: howMany }, () => '');
            rows[r].splice(idx, 0, ...blanks);
          }
        },
        getDataRange: () => ({
          getValues: () => rows.map((r) => [...r]),
        }),
        getRange: (row: number, col: number, numRows: number, numCols: number) => ({
          setFontWeight: () => {},
          getValues: () => {
            const out: unknown[][] = [];
            for (let r = row - 1; r < row - 1 + numRows; r++) {
              const src = rows[r] ?? [];
              const slice: unknown[] = [];
              for (let c = col - 1; c < col - 1 + numCols; c++) {
                slice.push(src[c] ?? '');
              }
              out.push(slice);
            }
            return out;
          },
          setValues: (newVals: unknown[][]) => {
            for (let r = 0; r < numRows; r++) {
              const targetIdx = row - 1 + r;
              while (rows.length <= targetIdx) rows.push([]);
              for (let c = 0; c < numCols; c++) {
                rows[targetIdx][col - 1 + c] = newVals[r][c];
              }
            }
          },
        }),
        deleteRow: (rowNum: number) => rows.splice(rowNum - 1, 1),
        setFrozenRows: () => {},
        _rows: rows,
      };
    };

    const sheetsMap = new Map<string, ReturnType<typeof makeUpgradeableSheet>>();
    const mockSpreadsheet = {
      getSheetByName: (name: string) => sheetsMap.get(name) ?? null,
      insertSheet: (name: string) => {
        const s = makeUpgradeableSheet(name);
        sheetsMap.set(name, s);
        return s;
      },
      getSheets: () => Array.from(sheetsMap.values()),
    };

    // Seed legacy 6-column Kawsar_Posts_Log to test seamless schema upgrade
    const kawsarSheet = mockSpreadsheet.insertSheet('Kawsar_Posts_Log');
    kawsarSheet.appendRow([
      'Post ID',
      'Title / Note',
      'Facebook Link',
      'Website Link',
      'Posted By',
      'Timestamp',
    ]);
    kawsarSheet.appendRow([
      'PST-LEGACY-1',
      'Old Post',
      'https://facebook.com/runbd/posts/old1',
      'https://runbd.com/old1',
      'Kawsar',
      '2026-11-22T10:00:00.000Z',
    ]);

    const sandbox: Record<string, unknown> = {
      SpreadsheetApp: { getActiveSpreadsheet: () => mockSpreadsheet },
      Utilities: {
        formatDate: (d: Date) => new Date(d.getTime() + 6 * 3600 * 1000).toISOString().slice(0, 10),
      },
      ContentService: {
        MimeType: { JSON: 'JSON' },
        createTextOutput: (txt: string) => ({ setMimeType: () => txt }),
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(GOOGLE_APPS_SCRIPT_CODE, sandbox);

    const doPost = sandbox.doPost as (e: { postData: { contents: string } }) => string;
    const doGet = sandbox.doGet as (e: { parameter: Record<string, string> }) => string;

    // 1. Log a new post with TikTok + Instagram + Twitter links via KAWSAR_POST_LOGGED
    const postRes = JSON.parse(
      doPost({
        postData: {
          contents: JSON.stringify({
            event: 'KAWSAR_POST_LOGGED',
            post: {
              id: 'PST-NEW-1',
              note: 'Social Reel + Thread',
              facebookLink: '',
              websiteLink: '',
              tiktokLink: 'https://www.tiktok.com/@runbd/video/74999',
              instagramLink: 'https://www.instagram.com/p/C9NEW/',
              twitterLink: 'https://x.com/runbd/status/18999',
              posterName: 'Kawsar',
              createdAt: '2026-11-23T12:00:00.000Z',
            },
          }),
        },
      })
    );
    assert.equal(postRes.ok, true);

    // Header upgraded to 9 cols, legacy row preserved Posted By='Kawsar' and Timestamp
    assert.deepEqual(kawsarSheet._rows[0], [
      'Post ID',
      'Title / Note',
      'Facebook Link',
      'Website Link',
      'TikTok Link',
      'Instagram Link',
      'Twitter Link',
      'Posted By',
      'Timestamp',
    ]);
    assert.equal(kawsarSheet._rows[1][7], 'Kawsar');
    assert.equal(kawsarSheet._rows[1][8], '2026-11-22T10:00:00.000Z');
    assert.equal(kawsarSheet._rows[2][4], 'https://www.tiktok.com/@runbd/video/74999');
    assert.equal(kawsarSheet._rows[2][5], 'https://www.instagram.com/p/C9NEW/');
    assert.equal(kawsarSheet._rows[2][6], 'https://x.com/runbd/status/18999');

    // 2. Duplicate check via doGet matches normalized Twitter (twitter.com -> x.com) & TikTok
    const twCheck = JSON.parse(
      doGet({
        parameter: {
          action: 'check_post_duplicate',
          twitterLink: 'https://twitter.com/runbd/status/18999?s=20',
        },
      })
    );
    assert.equal(twCheck.ok, true);
    assert.equal(twCheck.isDuplicate, true);
    assert.equal(twCheck.matchedField, 'Twitter Link');
    assert.equal(twCheck.post.id, 'PST-NEW-1');
    const parsedTwCheck = parsePostDuplicateCheckResponse(twCheck);
    assert.ok(parsedTwCheck);
    assert.equal(parsedTwCheck.existingPost?.id, 'PST-NEW-1');
    assert.equal(parsedTwCheck.existingPost?.twitterLink, 'https://x.com/runbd/status/18999');

    const ttCheck = JSON.parse(
      doGet({
        parameter: {
          action: 'check_post_duplicate',
          tiktokLink: 'https://www.tiktok.com/@runbd/video/74999?is_from_webapp=1',
        },
      })
    );
    assert.equal(ttCheck.isDuplicate, true);
    assert.equal(ttCheck.matchedField, 'TikTok Link');

    // 3. Pull returns all 5 link fields accurately
    const pullRes = JSON.parse(doGet({ parameter: { scope: 'all' } }));
    assert.equal(pullRes.ok, true);
    const pulledNew = pullRes.contentPosts.find((p: { id: string }) => p.id === 'PST-NEW-1');
    assert.equal(pulledNew.tiktokLink, 'https://www.tiktok.com/@runbd/video/74999');
    assert.equal(pulledNew.instagramLink, 'https://www.instagram.com/p/C9NEW/');
    assert.equal(pulledNew.twitterLink, 'https://x.com/runbd/status/18999');
    assert.equal(pulledNew.posterName, 'Kawsar');
  });

  it('syncs Paid Customer Package edits & deletes across Paid_Customers, Paid_<Agent>, doGet pull, and tombstones', () => {
    const customPaid: PaidCustomer = {
      id: 'PC-PKG-1',
      leadId: 'RBD-PKG-1',
      customerName: 'Tareq Rahman',
      phone: '01711889900',
      assignedAgentId: 'agent-tanjin',
      assignedAgentName: 'Tanjin',
      confirmedDate: '2026-11-20',
      renewalDate: '2026-12-20',
      renewalStatus: 'Active',
      lastRenewedAt: null,
      packageName: '1-Month Premium',
      notes: 'VIP tracker plan',
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-24T10:00:00.000Z',
    };

    const enriched = enrichPaidCustomersForSheetSync([customPaid], []);
    assert.equal(enriched[0].packageName, '1-Month Premium');
    assert.equal(enriched[0].amountOrPackage, '1-Month Premium');

    // mergeRemotePaidCustomers filters deleted tombstones cleanly
    const mergedAfterDelete = mergeRemotePaidCustomers(
      [customPaid],
      [
        customPaid,
        {
          id: 'PC-KEEP-2',
          leadId: 'RBD-KEEP-2',
          customerName: 'Salma Begum',
          phone: '01811223399',
          assignedAgentName: 'Kathy',
          confirmedDate: '2026-11-22',
          renewalDate: '2026-12-22',
          renewalStatus: 'Active',
          packageName: '3-Month Package',
          notes: 'Paid 3M',
          updatedAt: '2026-11-24T09:00:00.000Z',
        },
      ],
      ['PC-PKG-1']
    );
    assert.deepEqual(
      mergedAfterDelete.map((c) => c.id),
      ['PC-KEEP-2']
    );
    assert.equal(mergedAfterDelete[0].packageName, '3-Month Package');

    const makeMockSheet = (name: string) => {
      const rows: unknown[][] = [];
      return {
        getName: () => name,
        appendRow: (row: unknown[]) => rows.push([...row]),
        getLastRow: () => rows.length,
        getLastColumn: () => (rows[0] ? rows[0].length : 0),
        getDataRange: () => ({
          getValues: () => rows.map((r) => [...r]),
        }),
        getRange: (row: number, col: number, numRows: number, numCols: number) => ({
          setFontWeight: () => {},
          getValues: () => {
            const out: unknown[][] = [];
            for (let r = row - 1; r < row - 1 + numRows; r++) {
              const src = rows[r] ?? [];
              const slice: unknown[] = [];
              for (let c = col - 1; c < col - 1 + numCols; c++) {
                slice.push(src[c] ?? '');
              }
              out.push(slice);
            }
            return out;
          },
          setValues: (newVals: unknown[][]) => {
            for (let r = 0; r < numRows; r++) {
              const targetIdx = row - 1 + r;
              while (rows.length <= targetIdx) rows.push([]);
              for (let c = 0; c < numCols; c++) {
                rows[targetIdx][col - 1 + c] = newVals[r][c];
              }
            }
          },
        }),
        deleteRow: (rowNum: number) => rows.splice(rowNum - 1, 1),
        setFrozenRows: () => {},
        _rows: rows,
      };
    };

    const sheetsMap = new Map<string, ReturnType<typeof makeMockSheet>>();
    const mockSpreadsheet = {
      getSheetByName: (name: string) => sheetsMap.get(name) ?? null,
      insertSheet: (name: string) => {
        const s = makeMockSheet(name);
        sheetsMap.set(name, s);
        return s;
      },
      getSheets: () => Array.from(sheetsMap.values()),
    };

    const sandbox: Record<string, unknown> = {
      SpreadsheetApp: { getActiveSpreadsheet: () => mockSpreadsheet },
      Utilities: {
        formatDate: (d: Date) => new Date(d.getTime() + 6 * 3600 * 1000).toISOString().slice(0, 10),
      },
      ContentService: {
        MimeType: { JSON: 'JSON' },
        createTextOutput: (txt: string) => ({ setMimeType: () => txt }),
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(GOOGLE_APPS_SCRIPT_CODE, sandbox);

    const doPost = sandbox.doPost as (e: { postData: { contents: string } }) => string;
    const doGet = sandbox.doGet as (e: { parameter: Record<string, string> }) => string;

    // 1. Upsert Paid Customer with Package
    doPost({
      postData: {
        contents: JSON.stringify({
          event: 'PAID_CUSTOMER_UPSERT',
          paidCustomer: enriched[0],
        }),
      },
    });

    const paidSheet = sheetsMap.get('Paid_Customers')!;
    const paidTanjin = sheetsMap.get('Paid_Tanjin')!;
    assert.equal(paidSheet._rows[0][10], 'Package');
    assert.equal(paidSheet._rows[1][10], '1-Month Premium');
    assert.equal(paidSheet._rows[1][11], 'VIP tracker plan');
    assert.equal(paidTanjin._rows[1][7], '1-Month Premium');

    // Pull reads back packageName & notes cleanly
    const pulled = JSON.parse(doGet({ parameter: { scope: 'all' } }));
    assert.equal(pulled.paidCustomers.length, 1);
    assert.equal(pulled.paidCustomers[0].packageName, '1-Month Premium');
    assert.equal(pulled.paidCustomers[0].notes, 'VIP tracker plan');

    // 2. Delete removes from both Paid_Customers & Paid_Tanjin
    const delRes = JSON.parse(
      doPost({
        postData: {
          contents: JSON.stringify({
            event: 'PAID_CUSTOMER_DELETED',
            deletedPaidCustomer: {
              id: 'PC-PKG-1',
              leadId: 'RBD-PKG-1',
              phone: '01711889900',
              assignedAgentName: 'Tanjin',
            },
            deletedPaidCustomerIds: ['PC-PKG-1', 'RBD-PKG-1'],
          }),
        },
      })
    );
    assert.equal(delRes.ok, true);
    assert.equal(paidSheet._rows.length, 1); // header only
    assert.equal(paidTanjin._rows.length, 1); // header only

    // 3. Subsequent FULL_SYNC with confirmed lead + deletedPaidCustomerIds does NOT resurrect deleted paid row
    doPost({
      postData: {
        contents: JSON.stringify({
          event: 'FULL_SYNC',
          agentNames: ['Tanjin'],
          collectorNames: ['Farhan'],
          deletedPaidCustomerIds: ['PC-PKG-1', 'RBD-PKG-1'],
          leads: [
            {
              id: 'RBD-PKG-1',
              customerName: 'Tareq Rahman',
              phone: '01711889900',
              collectorName: 'Farhan',
              assignedAgentName: 'Tanjin',
              status: 'Order Confirmed',
              createdAt: '2026-11-20T10:00:00.000Z',
              updatedAt: '2026-11-20T10:00:00.000Z',
            },
          ],
          paidCustomers: [enriched[0]],
        }),
      },
    });
    assert.equal(paidSheet._rows.length, 1);
    assert.equal(paidTanjin._rows.length, 1);
  });

  it('syncs Workshop, Accessories, and Rent a Car leads and paid customers cleanly across Master_Data, Collector, Agent, and Paid tabs', () => {
    const makeMockSheet = (name: string) => {
      const rows: unknown[][] = [];
      return {
        getName: () => name,
        getLastRow: () => rows.length,
        getLastColumn: () => (rows[0] ? rows[0].length : 0),
        appendRow: (row: unknown[]) => rows.push([...row]),
        getDataRange: () => ({
          getValues: () => rows.map((r) => [...r]),
        }),
        getRange: (r: number, c: number, numRows = 1, numCols = 1) => ({
          setFontWeight: () => {},
          getValues: () => {
            const out: unknown[][] = [];
            for (let i = 0; i < numRows; i++) {
              const row = rows[r - 1 + i] ?? [];
              const slice: unknown[] = [];
              for (let j = 0; j < numCols; j++) {
                slice.push(row[c - 1 + j] ?? '');
              }
              out.push(slice);
            }
            return out;
          },
          setValues: (vals: unknown[][]) => {
            for (let i = 0; i < vals.length; i++) {
              const rowIdx = r - 1 + i;
              while (rows.length <= rowIdx) rows.push([]);
              for (let j = 0; j < vals[i].length; j++) {
                rows[rowIdx][c - 1 + j] = vals[i][j];
              }
            }
          },
        }),
        deleteRow: (rowNum: number) => rows.splice(rowNum - 1, 1),
        setFrozenRows: () => {},
        _rows: rows,
      };
    };

    const sheetsMap = new Map<string, ReturnType<typeof makeMockSheet>>();
    const mockSpreadsheet = {
      getSheetByName: (name: string) => sheetsMap.get(name) ?? null,
      insertSheet: (name: string) => {
        const s = makeMockSheet(name);
        sheetsMap.set(name, s);
        return s;
      },
      getSheets: () => Array.from(sheetsMap.values()),
    };

    const sandbox: Record<string, unknown> = {
      SpreadsheetApp: { getActiveSpreadsheet: () => mockSpreadsheet },
      Utilities: {
        formatDate: (d: Date) => new Date(d.getTime() + 6 * 3600 * 1000).toISOString().slice(0, 10),
      },
      ContentService: {
        MimeType: { JSON: 'JSON' },
        createTextOutput: (txt: string) => ({ setMimeType: () => txt }),
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(GOOGLE_APPS_SCRIPT_CODE, sandbox);

    const doPost = sandbox.doPost as (e: { postData: { contents: string } }) => string;
    const doGet = sandbox.doGet as (e: { parameter: Record<string, string> }) => string;

    const leads: Lead[] = [
      {
        id: 'RBD-WS-1',
        customerName: 'Workshop',
        phone: '01711990001',
        rawPhone: '01711990001',
        facebookLink: 'https://facebook.com/workshop.dhaka',
        normalizedFacebookLink: 'facebook.com/workshop.dhaka',
        notes: 'Service center',
        collectorId: 'collector-farhan',
        collectorName: 'Farhan',
        assignedAgentId: 'agent-tanjin',
        assignedAgentName: 'Tanjin',
        status: 'Order Confirmed',
        followUpAt: null,
        lastCallNotes: 'Confirmed',
        createdAt: '2026-11-24T10:00:00.000Z',
        updatedAt: '2026-11-24T10:00:00.000Z',
        collectedDate: '2026-11-24',
      },
      {
        id: 'RBD-AC-1',
        customerName: 'Accessories',
        phone: '01811990002',
        rawPhone: '01811990002',
        facebookLink: '',
        normalizedFacebookLink: '',
        notes: 'Car accessories shop',
        collectorId: 'collector-farhan',
        collectorName: 'Farhan',
        assignedAgentId: 'agent-tanjin',
        assignedAgentName: 'Tanjin',
        status: 'Interested',
        followUpAt: null,
        lastCallNotes: '',
        createdAt: '2026-11-24T10:05:00.000Z',
        updatedAt: '2026-11-24T10:05:00.000Z',
        collectedDate: '2026-11-24',
      },
      {
        id: 'RBD-RC-1',
        customerName: 'Rent a Car',
        phone: '01911990003',
        rawPhone: '01911990003',
        facebookLink: '',
        normalizedFacebookLink: '',
        notes: 'Fleet rental',
        collectorId: 'collector-farhan',
        collectorName: 'Farhan',
        assignedAgentId: 'agent-tanjin',
        assignedAgentName: 'Tanjin',
        status: 'Pending',
        followUpAt: null,
        lastCallNotes: '',
        createdAt: '2026-11-24T10:10:00.000Z',
        updatedAt: '2026-11-24T10:10:00.000Z',
        collectedDate: '2026-11-24',
      },
    ];

    const paidCustomers = enrichPaidCustomersForSheetSync(
      [
        {
          id: 'PC-RBD-WS-1',
          leadId: 'RBD-WS-1',
          customerName: 'Workshop',
          phone: '01711990001',
          assignedAgentId: 'agent-tanjin',
          assignedAgentName: 'Tanjin',
          confirmedDate: '2026-11-24',
          renewalDate: '2026-12-24',
          renewalStatus: 'Active',
          lastRenewedAt: null,
          packageName: '1-Month Standard',
          notes: 'Workshop fleet',
          createdAt: '2026-11-24T10:00:00.000Z',
          updatedAt: '2026-11-24T10:00:00.000Z',
        },
      ],
      leads
    );

    const res = JSON.parse(
      doPost({
        postData: {
          contents: JSON.stringify({
            event: 'FULL_SYNC',
            agentNames: ['Tanjin'],
            collectorNames: ['Farhan'],
            leads,
            paidCustomers,
          }),
        },
      })
    );
    assert.equal(res.ok, true);

    assert.deepEqual(
      sheetsMap.get('Master_Data')!._rows.slice(1).map((r) => r[1]),
      ['Workshop', 'Accessories', 'Rent a Car']
    );
    assert.deepEqual(
      sheetsMap.get('Collector_Farhan')!._rows.slice(1).map((r) => r[1]),
      ['Workshop', 'Accessories', 'Rent a Car']
    );
    assert.deepEqual(
      sheetsMap.get('Agent_Tanjin')!._rows.slice(1).map((r) => r[1]),
      ['Workshop', 'Accessories', 'Rent a Car']
    );
    assert.equal(sheetsMap.get('Paid_Customers')!._rows[1][2], 'Workshop');
    assert.equal(sheetsMap.get('Paid_Tanjin')!._rows[1][2], 'Workshop');

    const pulled = JSON.parse(doGet({ parameter: { scope: 'all' } }));
    assert.deepEqual(
      pulled.leads.map((l: Partial<Lead>) => l.customerName),
      ['Workshop', 'Accessories', 'Rent a Car']
    );
    assert.equal(pulled.paidCustomers[0].customerName, 'Workshop');
  });

  it('mergeRemoteLeads respects deletedLeadIds tombstones and Code.gs handles LEAD_UPDATED & LEAD_DELETED cleanly', () => {
    const localLead: Lead = {
      id: 'RBD-ED-1',
      customerName: 'Car',
      phone: '01711223344',
      rawPhone: '01711223344',
      facebookLink: 'https://facebook.com/ed.one',
      normalizedFacebookLink: 'facebook.com/ed.one',
      notes: 'Initial note',
      collectorId: 'collector-farhan',
      collectorName: 'Farhan',
      assignedAgentId: 'agent-tanjin',
      assignedAgentName: 'Tanjin',
      status: 'Pending',
      followUpAt: null,
      lastCallNotes: '',
      createdAt: '2026-11-24T09:00:00.000Z',
      updatedAt: '2026-11-24T09:00:00.000Z',
      collectedDate: '2026-11-24',
    };

    assert.deepEqual(mergeRemoteLeads([localLead], [], ['RBD-ED-1']), []);
    assert.deepEqual(
      mergeRemoteLeads(
        [],
        [localLead, { id: 'RBD-KEEP', customerName: 'Bike', phone: '01812345678', collectorName: 'Farhan' }],
        ['RBD-ED-1']
      ).map((l) => l.id),
      ['RBD-KEEP']
    );

    const makeMockSheet = (name: string) => {
      const rows: unknown[][] = [];
      return {
        getName: () => name,
        getLastRow: () => rows.length,
        getLastColumn: () => (rows[0] ? rows[0].length : 0),
        appendRow: (row: unknown[]) => rows.push([...row]),
        getDataRange: () => ({
          getValues: () => rows.map((r) => [...r]),
        }),
        getRange: (r: number, c: number, numRows = 1, numCols = 1) => ({
          setFontWeight: () => {},
          getValues: () => {
            const out: unknown[][] = [];
            for (let i = 0; i < numRows; i++) {
              const row = rows[r - 1 + i] ?? [];
              const slice: unknown[] = [];
              for (let j = 0; j < numCols; j++) {
                slice.push(row[c - 1 + j] ?? '');
              }
              out.push(slice);
            }
            return out;
          },
          setValues: (vals: unknown[][]) => {
            for (let i = 0; i < vals.length; i++) {
              const rowIdx = r - 1 + i;
              while (rows.length <= rowIdx) rows.push([]);
              for (let j = 0; j < vals[i].length; j++) {
                rows[rowIdx][c - 1 + j] = vals[i][j];
              }
            }
          },
        }),
        deleteRow: (rowNum: number) => rows.splice(rowNum - 1, 1),
        setFrozenRows: () => {},
        _rows: rows,
      };
    };

    const sheetsMap = new Map<string, ReturnType<typeof makeMockSheet>>();
    const mockSpreadsheet = {
      getSheetByName: (name: string) => sheetsMap.get(name) ?? null,
      insertSheet: (name: string) => {
        const s = makeMockSheet(name);
        sheetsMap.set(name, s);
        return s;
      },
      getSheets: () => Array.from(sheetsMap.values()),
    };

    const sandbox: Record<string, unknown> = {
      SpreadsheetApp: { getActiveSpreadsheet: () => mockSpreadsheet },
      Utilities: {
        formatDate: (d: Date) => new Date(d.getTime() + 6 * 3600 * 1000).toISOString().slice(0, 10),
      },
      ContentService: {
        MimeType: { JSON: 'JSON' },
        createTextOutput: (txt: string) => ({ setMimeType: () => txt }),
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(GOOGLE_APPS_SCRIPT_CODE, sandbox);

    const doPost = sandbox.doPost as (e: { postData: { contents: string } }) => string;

    // 1. Seed initial lead assigned to Tanjin
    const createRes = JSON.parse(
      doPost({
        postData: {
          contents: JSON.stringify({
            event: 'LEAD_UPSERT',
            agentNames: ['Tanjin', 'Sakib'],
            collectorNames: ['Farhan'],
            lead: localLead,
          }),
        },
      })
    );
    assert.equal(createRes.ok, true);
    assert.equal(sheetsMap.get('Agent_Tanjin')!._rows.length, 2);
    assert.equal(sheetsMap.get('Agent_Sakib')!._rows.length, 1);

    // 2. LEAD_UPDATED: edit vehicle -> Workshop, phone -> 01999887766, reassign Tanjin -> Sakib
    const editedLead: Lead = {
      ...localLead,
      customerName: 'Workshop',
      phone: '01999887766',
      rawPhone: '01999887766',
      assignedAgentId: 'agent-sakib',
      assignedAgentName: 'Sakib',
      status: 'Interested',
      notes: 'Moved to Workshop + Sakib',
      updatedAt: '2026-11-24T12:00:00.000Z',
    };

    const updateRes = JSON.parse(
      doPost({
        postData: {
          contents: JSON.stringify({
            event: 'LEAD_UPDATED',
            agentNames: ['Tanjin', 'Sakib'],
            collectorNames: ['Farhan'],
            lead: editedLead,
            previousAgentName: 'Tanjin',
            previousPhone: localLead.phone,
          }),
        },
      })
    );
    assert.equal(updateRes.ok, true);
    assert.equal(sheetsMap.get('Master_Data')!._rows[1][1], 'Workshop');
    assert.equal(sheetsMap.get('Master_Data')!._rows[1][2], "'01999887766");
    assert.equal(sheetsMap.get('Master_Data')!._rows[1][5], 'Sakib');
    assert.equal(sheetsMap.get('Collector_Farhan')!._rows[1][1], 'Workshop');
    assert.equal(sheetsMap.get('Collector_Farhan')!._rows[1][2], "'01999887766");
    assert.equal(sheetsMap.get('Agent_Tanjin')!._rows.length, 1); // removed from old agent tab
    assert.equal(sheetsMap.get('Agent_Sakib')!._rows.length, 2);
    assert.equal(sheetsMap.get('Agent_Sakib')!._rows[1][1], 'Workshop');

    // 3. LEAD_DELETED: removes row from Master_Data, Collector_Farhan, and Agent_Sakib
    const delRes = JSON.parse(
      doPost({
        postData: {
          contents: JSON.stringify({
            event: 'LEAD_DELETED',
            agentNames: ['Tanjin', 'Sakib'],
            collectorNames: ['Farhan'],
            deletedLead: {
              id: editedLead.id,
              phone: editedLead.phone,
              collectorName: 'Farhan',
              assignedAgentName: 'Sakib',
            },
            deletedLeadIds: [editedLead.id],
          }),
        },
      })
    );
    assert.equal(delRes.ok, true);
    assert.equal(sheetsMap.get('Master_Data')!._rows.length, 1);
    assert.equal(sheetsMap.get('Collector_Farhan')!._rows.length, 1);
    assert.equal(sheetsMap.get('Agent_Sakib')!._rows.length, 1);

    // 4. Subsequent FULL_SYNC with deletedLeadIds tombstone does NOT resurrect deleted lead
    const fullSyncRes = JSON.parse(
      doPost({
        postData: {
          contents: JSON.stringify({
            event: 'FULL_SYNC',
            agentNames: ['Tanjin', 'Sakib'],
            collectorNames: ['Farhan'],
            leads: [editedLead],
            deletedLeadIds: [editedLead.id],
          }),
        },
      })
    );
    assert.equal(fullSyncRes.ok, true);
    assert.equal(sheetsMap.get('Master_Data')!._rows.length, 1);
    assert.equal(sheetsMap.get('Collector_Farhan')!._rows.length, 1);
    assert.equal(sheetsMap.get('Agent_Sakib')!._rows.length, 1);
  });

  it('mergeRemotePaidCustomers filters SHEET-PC phone tombstones and strips timestamps from packageName', () => {
    const localPaid: PaidCustomer[] = [
      {
        id: 'PC-MAN-1',
        leadId: '',
        customerName: 'Workshop',
        phone: '01799887766',
        assignedAgentId: 'agent-tanjin',
        assignedAgentName: 'Tanjin',
        confirmedDate: '2026-11-25',
        renewalDate: '2026-12-25',
        renewalStatus: 'Active',
        lastRenewedAt: null,
        packageName: '1-Month Premium',
        notes: 'Keep me',
        createdAt: '2026-11-25T09:00:00.000Z',
        updatedAt: '2026-11-25T09:00:00.000Z',
      },
    ];

    const merged = mergeRemotePaidCustomers(
      localPaid,
      [
        {
          id: 'PC-MAN-1',
          customerName: 'Workshop',
          phone: '01799887766',
          packageName: '2026-11-25T09:00:00.000Z',
          updatedAt: '2026-11-25T10:00:00.000Z',
        },
        {
          id: 'SHEET-PC-ROW-9',
          customerName: 'Car',
          phone: '+880 1811-223344',
          packageName: '1-Month Basic',
          updatedAt: '2026-11-25T10:00:00.000Z',
        },
      ],
      ['SHEET-PC-1811223344']
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, 'PC-MAN-1');
    assert.equal(merged[0].packageName, '');
  });

  it('Code.gs upgrades legacy 11-col Paid_Customers headers without shifting Notes into Package and syncs manual Paid Customer add/edit/delete cleanly', () => {
    function makeSheet(name: string, initialRows: unknown[][] = []) {
      const _rows = initialRows.map((r) => [...r]);
      return {
        _rows,
        getName: () => name,
        getLastRow: () => _rows.length,
        getLastColumn: () => (_rows[0] ? _rows[0].length : 0),
        appendRow: (row: unknown[]) => {
          _rows.push([...row]);
        },
        insertColumnsBefore: (colPos: number, numCols: number) => {
          const idx = colPos - 1;
          for (const row of _rows) {
            row.splice(idx, 0, ...new Array(numCols).fill(''));
          }
        },
        getRange: (row: number, col: number, numRows: number, numCols: number) => ({
          getValues: () => {
            const out: unknown[][] = [];
            for (let r = 0; r < numRows; r++) {
              const src = _rows[row - 1 + r] || [];
              const sliced: unknown[] = [];
              for (let c = 0; c < numCols; c++) {
                sliced.push(src[col - 1 + c] ?? '');
              }
              out.push(sliced);
            }
            return out;
          },
          setValues: (vals: unknown[][]) => {
            for (let r = 0; r < numRows; r++) {
              const targetIdx = row - 1 + r;
              while (_rows.length <= targetIdx) _rows.push([]);
              for (let c = 0; c < numCols; c++) {
                _rows[targetIdx][col - 1 + c] = vals[r][c];
              }
            }
          },
          setFontWeight: () => undefined,
        }),
        deleteRow: (rowNum: number) => {
          _rows.splice(rowNum - 1, 1);
        },
        setFrozenRows: () => undefined,
      };
    }

    // Legacy 11-column Paid_Customers tab where col 11 (idx 10) was Notes
    const legacyPaidSheet = makeSheet('Paid_Customers', [
      [
        'Customer ID',
        'Lead ID',
        'Customer Name',
        'Phone',
        'Assigned Agent',
        'Confirmed Date',
        'Renewal Date',
        'Days Remaining',
        'Renewal Status',
        'Updated At',
        'Notes',
      ],
      [
        'PC-OLD-1',
        'OLD-1',
        'Car',
        "'01700112233",
        'Tanjin',
        "'2026-11-20",
        "'2026-12-20",
        25,
        'Active',
        '2026-11-20T09:00:00.000Z',
        'Legacy note preserved',
      ],
    ]);
    const sheetsMap = new Map<string, ReturnType<typeof makeSheet>>([
      ['Paid_Customers', legacyPaidSheet],
    ]);
    const ss = {
      getSheets: () => Array.from(sheetsMap.values()),
      getSheetByName: (name: string) => sheetsMap.get(name) ?? null,
      insertSheet: (name: string) => {
        const created = makeSheet(name);
        sheetsMap.set(name, created);
        return created;
      },
    };
    const context: Record<string, unknown> = {
      SpreadsheetApp: { getActiveSpreadsheet: () => ss },
      ContentService: {
        MimeType: { JSON: 'application/json' },
        createTextOutput: (txt: string) => ({
          setMimeType: () => txt,
        }),
      },
      Utilities: {
        formatDate: (d: Date) =>
          new Date(d.getTime() + 6 * 3600000).toISOString().slice(0, 10),
      },
      Date,
      Map,
      Set,
      JSON,
      String,
      Number,
      Array,
      Math,
    };
    vm.createContext(context);
    vm.runInContext(GOOGLE_APPS_SCRIPT_CODE, context);
    const doPost = context.doPost as (e: { postData: { contents: string } }) => string;
    const doGet = context.doGet as (e: { parameter: Record<string, string> }) => string;

    // 1. Add manual Paid Customer for Tanjin
    const addRes = JSON.parse(
      doPost({
        postData: {
          contents: JSON.stringify({
            event: 'PAID_CUSTOMER_UPSERT',
            agentNames: ['Tanjin', 'Kathy'],
            paidCustomer: {
              id: 'PC-MAN-ABC1',
              leadId: '',
              customerName: 'Workshop',
              phone: '01877665544',
              assignedAgentName: 'Tanjin',
              confirmedDate: '2026-11-25',
              renewalDate: '2026-12-25',
              renewalStatus: 'Active',
              packageName: '3-Month Package',
              notes: 'Manual VIP',
              updatedAt: '2026-11-25T10:00:00.000Z',
            },
          }),
        },
      })
    );
    assert.equal(addRes.ok, true);

    // Legacy row's Notes shifted cleanly to col 12 without entering Package (col 11)
    assert.equal(legacyPaidSheet._rows[0][10], 'Package');
    assert.equal(legacyPaidSheet._rows[0][11], 'Notes');
    assert.equal(legacyPaidSheet._rows[1][10], '');
    assert.equal(legacyPaidSheet._rows[1][11], 'Legacy note preserved');
    assert.equal(legacyPaidSheet._rows[2][0], 'PC-MAN-ABC1');
    assert.equal(legacyPaidSheet._rows[2][10], '3-Month Package');
    assert.equal(sheetsMap.get('Paid_Tanjin')!._rows.length, 2);

    // 2. Edit phone & reassign to Kathy -> updates Paid_Customers & moves Paid_Tanjin -> Paid_Kathy
    const editRes = JSON.parse(
      doPost({
        postData: {
          contents: JSON.stringify({
            event: 'PAID_CUSTOMER_UPSERT',
            agentNames: ['Tanjin', 'Kathy'],
            previousPhone: '01877665544',
            paidCustomer: {
              id: 'PC-MAN-ABC1',
              leadId: '',
              customerName: 'Workshop',
              phone: '01877665599',
              assignedAgentName: 'Kathy',
              confirmedDate: '2026-11-25',
              renewalDate: '2026-12-25',
              renewalStatus: 'Active',
              packageName: '6-Month Package',
              notes: 'Reassigned to Kathy',
              updatedAt: '2026-11-25T11:00:00.000Z',
            },
          }),
        },
      })
    );
    assert.equal(editRes.ok, true);
    assert.equal(legacyPaidSheet._rows.length, 3);
    assert.equal(legacyPaidSheet._rows[2][3], "'01877665599");
    assert.equal(legacyPaidSheet._rows[2][4], 'Kathy');
    assert.equal(legacyPaidSheet._rows[2][10], '6-Month Package');
    assert.equal(sheetsMap.get('Paid_Tanjin')!._rows.length, 1);
    assert.equal(sheetsMap.get('Paid_Kathy')!._rows.length, 2);

    // 3. doGet reads Package & Notes cleanly without timestamps
    const pulled = JSON.parse(doGet({ parameter: { action: 'pull', scope: 'all' } }));
    assert.equal(pulled.ok, true);
    const oldRow = pulled.paidCustomers.find((c: { id: string }) => c.id === 'PC-OLD-1');
    assert.equal(oldRow.packageName, '');
    assert.equal(oldRow.notes, 'Legacy note preserved');
    const manRow = pulled.paidCustomers.find((c: { id: string }) => c.id === 'PC-MAN-ABC1');
    assert.equal(manRow.packageName, '6-Month Package');

    // 4. Delete manual Paid Customer -> removed from Paid_Customers & Paid_Kathy
    const delRes = JSON.parse(
      doPost({
        postData: {
          contents: JSON.stringify({
            event: 'PAID_CUSTOMER_DELETED',
            agentNames: ['Tanjin', 'Kathy'],
            deletedPaidCustomer: {
              id: 'PC-MAN-ABC1',
              leadId: '',
              phone: '01877665599',
              assignedAgentName: 'Kathy',
            },
            deletedPaidCustomerIds: ['PC-MAN-ABC1', 'SHEET-PC-1877665599'],
          }),
        },
      })
    );
    assert.equal(delRes.ok, true);
    assert.equal(legacyPaidSheet._rows.length, 2);
    assert.equal(sheetsMap.get('Paid_Kathy')!._rows.length, 1);
  });

  it('filterPullPayloadByDate and Code.gs doGet(scope=today) retain carried-over Pending leads with followUpAt while LEADS_BATCH_UPSERT moves Agent tabs cleanly', () => {
    const filtered = filterPullPayloadByDate(
      {
        leads: [
          {
            id: 'L-PREV-UNSCHED',
            customerName: 'Car',
            phone: '01711110001',
            status: 'Pending',
            createdAt: '2026-11-25T10:00:00+06:00',
            followUpAt: null,
          },
          {
            id: 'L-PREV-CARRIED',
            customerName: 'Workshop',
            phone: '01711110002',
            status: 'Pending',
            createdAt: '2026-11-25T10:00:00+06:00',
            followUpAt: '2026-11-27T10:00:00+06:00',
          },
          {
            id: 'L-PREV-DONE',
            customerName: 'Bike',
            phone: '01711110003',
            status: 'Done',
            createdAt: '2026-11-25T10:00:00+06:00',
            followUpAt: '2026-11-27T10:00:00+06:00',
          },
          {
            id: 'L-TODAY',
            customerName: 'Truck',
            phone: '01711110004',
            status: 'Pending',
            createdAt: '2026-11-26T09:00:00+06:00',
            followUpAt: null,
          },
        ],
        callLogs: [],
        contentPosts: [],
        paidCustomers: [],
      },
      '2026-11-26'
    );
    assert.deepEqual(
      filtered.leads.map((l) => l.id),
      ['L-PREV-CARRIED', 'L-TODAY']
    );

    function makeSheet(name: string, initialRows: unknown[][] = []) {
      const _rows = initialRows.map((r) => [...r]);
      return {
        _rows,
        getName: () => name,
        getLastRow: () => _rows.length,
        getLastColumn: () => (_rows[0] ? _rows[0].length : 0),
        appendRow: (row: unknown[]) => {
          _rows.push([...row]);
        },
        getRange: (row: number, col: number, numRows: number, numCols: number) => ({
          getValues: () => {
            const out: unknown[][] = [];
            for (let r = 0; r < numRows; r++) {
              const src = _rows[row - 1 + r] || [];
              const sliced: unknown[] = [];
              for (let c = 0; c < numCols; c++) {
                sliced.push(src[col - 1 + c] ?? '');
              }
              out.push(sliced);
            }
            return out;
          },
          setValues: (vals: unknown[][]) => {
            for (let r = 0; r < numRows; r++) {
              const targetIdx = row - 1 + r;
              while (_rows.length <= targetIdx) _rows.push([]);
              for (let c = 0; c < numCols; c++) {
                _rows[targetIdx][col - 1 + c] = vals[r][c];
              }
            }
          },
          setFontWeight: () => undefined,
        }),
        deleteRow: (rowNum: number) => {
          _rows.splice(rowNum - 1, 1);
        },
        setFrozenRows: () => undefined,
      };
    }

    const sheetsMap = new Map<string, ReturnType<typeof makeSheet>>();
    const ss = {
      getSheets: () => Array.from(sheetsMap.values()),
      getSheetByName: (name: string) => sheetsMap.get(name) ?? null,
      insertSheet: (name: string) => {
        const created = makeSheet(name);
        sheetsMap.set(name, created);
        return created;
      },
    };
    const fixedNow = new Date('2026-11-26T10:00:00+06:00');
    const context: Record<string, unknown> = {
      SpreadsheetApp: { getActiveSpreadsheet: () => ss },
      ContentService: {
        MimeType: { JSON: 'application/json' },
        createTextOutput: (txt: string) => ({
          setMimeType: () => txt,
        }),
      },
      Utilities: {
        formatDate: (d: Date) =>
          new Date(d.getTime() + 6 * 3600000).toISOString().slice(0, 10),
      },
      Date: class extends Date {
        constructor(...args: unknown[]) {
          if (args.length === 0) {
            super(fixedNow.getTime());
          } else {
            super(...(args as [string | number]));
          }
        }
      },
      Map,
      Set,
      JSON,
      String,
      Number,
      Array,
      Math,
    };
    vm.createContext(context);
    vm.runInContext(GOOGLE_APPS_SCRIPT_CODE, context);
    const doPost = context.doPost as (e: { postData: { contents: string } }) => string;
    const doGet = context.doGet as (e: { parameter: Record<string, string> }) => string;

    // Seed two previous-day Pending leads under Tanjin
    const seedRes = JSON.parse(
      doPost({
        postData: {
          contents: JSON.stringify({
            event: 'LEADS_BATCH_UPSERT',
            agentNames: ['Tanjin', 'Sakib'],
            collectorNames: ['Farhan'],
            leads: [
              {
                id: 'L-CO-1',
                customerName: 'Workshop',
                phone: '01788112233',
                collectorName: 'Farhan',
                assignedAgentName: 'Tanjin',
                status: 'Pending',
                followUpAt: null,
                notes: 'Collector note 1',
                createdAt: '2026-11-25T10:00:00+06:00',
                updatedAt: '2026-11-25T10:00:00+06:00',
              },
              {
                id: 'L-CO-2',
                customerName: 'Rent a Car',
                phone: '01788112244',
                collectorName: 'Farhan',
                assignedAgentName: 'Tanjin',
                status: 'Pending',
                followUpAt: null,
                notes: 'Collector note 2',
                createdAt: '2026-11-25T11:00:00+06:00',
                updatedAt: '2026-11-25T11:00:00+06:00',
              },
            ],
          }),
        },
      })
    );
    assert.equal(seedRes.ok, true);
    assert.equal(sheetsMap.get('Agent_Tanjin')!._rows.length, 3); // header + 2

    // Carry over L-CO-1 to Sakib via LEADS_BATCH_UPSERT -> moves Agent_Tanjin -> Agent_Sakib cleanly
    const batchRes = JSON.parse(
      doPost({
        postData: {
          contents: JSON.stringify({
            event: 'LEADS_BATCH_UPSERT',
            agentNames: ['Tanjin', 'Sakib'],
            collectorNames: ['Farhan'],
            leads: [
              {
                id: 'L-CO-1',
                customerName: 'Workshop',
                phone: '01788112233',
                collectorName: 'Farhan',
                assignedAgentName: 'Sakib',
                status: 'Pending',
                followUpAt: '2026-11-27T10:00:00+06:00',
                lastCallNotes: 'Call tomorrow morning',
                notes: 'Collector note 1',
                createdAt: '2026-11-25T10:00:00+06:00',
                updatedAt: '2026-11-26T10:00:00+06:00',
              },
              {
                id: 'L-CO-2',
                customerName: 'Rent a Car',
                phone: '01788112244',
                collectorName: 'Farhan',
                assignedAgentName: 'Sakib',
                status: 'Pending',
                followUpAt: '2026-11-27T10:00:00+06:00',
                lastCallNotes: 'Call tomorrow morning',
                notes: 'Collector note 2',
                createdAt: '2026-11-25T11:00:00+06:00',
                updatedAt: '2026-11-26T10:00:00+06:00',
              },
            ],
          }),
        },
      })
    );
    assert.equal(batchRes.ok, true);
    assert.equal(sheetsMap.get('Agent_Tanjin')!._rows.length, 1); // header only
    assert.equal(sheetsMap.get('Agent_Sakib')!._rows.length, 3); // header + 2

    // doGet(scope=today) returns both carried-over Pending leads even though createdAt is Nov 25
    const pulled = JSON.parse(doGet({ parameter: { action: 'pull', scope: 'today' } }));
    assert.equal(pulled.ok, true);
    assert.equal(pulled.leads.length, 2);
    assert.equal(pulled.leads[0].assignedAgentName, 'Sakib');
    assert.ok(String(pulled.leads[0].followUpAt).includes('2026-11-'));
  });
});


