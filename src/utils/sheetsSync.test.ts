import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CallLog, ContentPost, Lead } from '../types';
import {
  detectLeadDuplicatesInList,
  detectPostDuplicatesInList,
  FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL,
  getDefaultWebhookUrl,
  isFirestoreDocIdSafe,
  mergeRemoteCallLogs,
  mergeRemoteContentPosts,
  mergeRemoteLeads,
  parsePullPayload,
  resolveWebhookUrl,
} from './sheetsSync';

describe('Google Sheets default webhook URL resolution', () => {
  it('returns the hardcoded RunBD webhook URL when no saved or env URL exists', () => {
    assert.equal(getDefaultWebhookUrl(undefined), FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL);
    assert.equal(getDefaultWebhookUrl(''), FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL);
    assert.equal(resolveWebhookUrl('', ''), FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL);
    assert.equal(resolveWebhookUrl(null, null), FALLBACK_GOOGLE_SHEETS_WEBHOOK_URL);
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

