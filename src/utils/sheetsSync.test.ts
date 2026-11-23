import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOOGLE_APPS_SCRIPT_CODE } from '../data/seedData';
import { CallLog, ContentPost, DuplicateAttempt, Lead, PaidCustomer } from '../types';
import { extractPhoneCoreKey, filterTodayLeads, normalizeBdPhone } from './leadLogic';
import {
  detectLeadDuplicatesInList,
  detectPostDuplicatesInList,
  FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL,
  filterPullPayloadByDate,
  getAgentTabName,
  getCollectorTabName,
  getDefaultWebhookUrl,
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

describe('Google Sheets default webhook URL resolution', () => {
  it('uses the updated RunBD Apps Script deployment URL as the hardcoded fallback', () => {
    assert.equal(
      FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL,
      'https://script.google.com/macros/s/AKfycbyCPGFliknk1322hJoPwgCWkBIlobMRWd3AnJcAKr8R7oCs1Q5rNT--ydFr8jaWkF3r/exec'
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
    assert.equal(isLegacyWebhookUrl(legacyUrl), true);
    assert.equal(isLegacyWebhookUrl(` ${legacyUrl}/ `), true);
    assert.equal(resolveWebhookUrl(legacyUrl, ''), FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL);
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
});





