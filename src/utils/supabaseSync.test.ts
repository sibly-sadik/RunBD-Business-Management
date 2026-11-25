import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callLogToSupabaseRow,
  contentPostToSupabaseRow,
  isMissingColumnError,
  isSchemaMissingError,
  leadToSupabaseRow,
  paidCustomerToSupabaseRow,
  resolveUpsertSupabaseCallLogRow,
  rowToCallLog,
  rowToContentPost,
  rowToLead,
  rowToPaidCustomer,
  rowToSettings,
  sanitizeDisabledAgentIds,
} from './supabaseSync';
import type { CallLog, ContentPost, Lead, PaidCustomer } from '../types';

test('Supabase lead mapper normalizes BD phone, Facebook link, and preserves bare collectedDate', () => {
  const lead: Lead = {
    id: 'RBD-TEST-1',
    customerName: 'Mahmud Hasan',
    phone: '+880 1712-345678',
    rawPhone: '+880 1712-345678',
    facebookLink: 'https://www.facebook.com/mahmud.hasan?mibextid=ZbWKwL',
    normalizedFacebookLink: '',
    notes: 'VIP buyer',
    collectorId: 'collector-farhan',
    collectorName: 'Farhan',
    assignedAgentId: 'agent-tanjin',
    assignedAgentName: 'Tanjin',
    status: 'Pending',
    followUpAt: null,
    lastCallNotes: '',
    createdAt: '2026-11-21T09:00:00.000Z',
    updatedAt: '2026-11-21T09:00:00.000Z',
    collectedDate: '2026-11-20',
  };

  const row = leadToSupabaseRow(lead);
  assert.equal(row.phone, '01712345678');
  assert.equal(row.phone_normalized, '01712345678');
  assert.equal(row.facebook_normalized, 'facebook.com/mahmud.hasan');
  assert.equal(row.collected_date, '2026-11-20');

  const roundTrip = rowToLead(row);
  assert.equal(roundTrip.customerName, 'Mahmud Hasan');
  assert.equal(roundTrip.phone, '01712345678');
  assert.equal(roundTrip.collectedDate, '2026-11-20');
  assert.equal(roundTrip.assignedAgentName, 'Tanjin');
});

test('Supabase call log and paid customer mappers preserve Done status and 30-day renewal dates', () => {
  const log: CallLog = {
    id: 'CL-TEST-1',
    leadId: 'RBD-TEST-1',
    customerName: 'Mahmud Hasan',
    phone: '8801712345678',
    agentId: 'agent-tanjin',
    agentName: 'Tanjin',
    previousStatus: 'Pending',
    newStatus: 'Done',
    notes: 'Completed call without follow-up',
    followUpAt: null,
    timestamp: '2026-11-21T10:15:00.000Z',
  };

  const logRow = callLogToSupabaseRow(log);
  assert.equal(logRow.phone, '01712345678');
  assert.equal(logRow.new_status, 'Done');
  assert.equal(logRow.follow_up_at, null);

  const parsedLog = rowToCallLog(logRow);
  assert.equal(parsedLog.newStatus, 'Done');
  assert.equal(parsedLog.followUpAt, null);

  const paid: PaidCustomer = {
    id: 'PC-RBD-TEST-1',
    leadId: 'RBD-TEST-1',
    customerName: 'Mahmud Hasan',
    phone: '01712345678',
    assignedAgentId: 'agent-tanjin',
    assignedAgentName: 'Tanjin',
    confirmedDate: '2026-11-21',
    renewalDate: '2026-12-21',
    renewalStatus: 'Active',
    lastRenewedAt: null,
    packageName: '1-Month Premium',
    notes: 'Order confirmed',
    createdAt: '2026-11-21T10:20:00.000Z',
    updatedAt: '2026-11-21T10:20:00.000Z',
  };

  const paidRow = paidCustomerToSupabaseRow(paid, 'https://facebook.com/mahmud.hasan');
  assert.equal(paidRow.renewal_date, '2026-12-21');
  assert.equal(paidRow.renewal_status, 'Active');
  assert.equal(paidRow.package_name, '1-Month Premium');

  const parsedPaid = rowToPaidCustomer(paidRow);
  assert.equal(parsedPaid.renewalDate, '2026-12-21');
  assert.equal(parsedPaid.assignedAgentName, 'Tanjin');
  assert.equal(parsedPaid.packageName, '1-Month Premium');
});

test('Supabase Kawsar post mapper normalizes Facebook, Website, TikTok, Instagram, and Twitter links and detects schema errors', () => {
  const post: ContentPost = {
    id: 'PST-1',
    facebookLink: 'https://www.facebook.com/runbd/posts/991?ref=share',
    normalizedFacebookLink: '',
    websiteLink: 'https://runbd.com/offer/?utm_source=fb',
    normalizedWebsiteLink: '',
    tiktokLink: 'https://www.tiktok.com/@runbd/video/740001?is_from_webapp=1',
    normalizedTiktokLink: '',
    instagramLink: 'https://www.instagram.com/p/C9xyz/?igsh=abc',
    normalizedInstagramLink: '',
    twitterLink: 'https://twitter.com/runbd/status/180001?s=20',
    normalizedTwitterLink: '',
    note: 'Promo campaign',
    posterId: 'poster-kawsar',
    posterName: 'Kawsar',
    createdAt: '2026-11-21T08:30:00.000Z',
  };

  const row = contentPostToSupabaseRow(post);
  assert.equal(row.facebook_normalized, 'facebook.com/runbd/posts/991');
  assert.equal(row.website_normalized, 'runbd.com/offer');
  assert.equal(row.tiktok_normalized, 'tiktok.com/@runbd/video/740001');
  assert.equal(row.instagram_normalized, 'instagram.com/p/c9xyz');
  assert.equal(row.twitter_normalized, 'x.com/runbd/status/180001');

  const parsed = rowToContentPost(row);
  assert.equal(parsed.note, 'Promo campaign');
  assert.equal(parsed.normalizedWebsiteLink, 'runbd.com/offer');
  assert.equal(parsed.normalizedTiktokLink, 'tiktok.com/@runbd/video/740001');
  assert.equal(parsed.normalizedInstagramLink, 'instagram.com/p/c9xyz');
  assert.equal(parsed.normalizedTwitterLink, 'x.com/runbd/status/180001');

  assert.equal(isSchemaMissingError({ code: '42P01', message: 'relation "public.leads" does not exist' }), true);
  assert.equal(isSchemaMissingError({ code: 'PGRST205', message: "Could not find the table 'public.leads' in the schema cache" }), true);
  assert.equal(isSchemaMissingError({ code: '23505', message: 'duplicate key value' }), false);
});

test('loginWithServer and restoreServerSession handle static Shared App HTML/404 and server 401 cleanly', async () => {
  const { loginWithServer, restoreServerSession } = await import('./apiSync');
  const originalFetch = globalThis.fetch;

  try {
    // 1. Static hosting returns HTML index.html (200 text/html) for /api/auth/login
    globalThis.fetch = (async () =>
      new Response('<!doctype html><html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as typeof fetch;

    const okLogin = await loginWithServer('naim@runbd', 'naim@/#312');
    assert.equal(okLogin.ok, true);
    assert.equal(okLogin.user?.id, 'collector-naim');

    const badFallbackLogin = await loginWithServer('naim@runbd', 'wrong-pass');
    assert.equal(badFallbackLogin.ok, false);

    const restoredStatic = await restoreServerSession('collector-naim');
    assert.equal(restoredStatic?.id, 'collector-naim');

    // 2. Live Express server returns 401 JSON -> must stay rejected
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    const serverRejected = await loginWithServer('naim@runbd', 'naim@/#312');
    assert.equal(serverRejected.ok, false);

    const serverSessionRejected = await restoreServerSession('collector-naim');
    assert.equal(serverSessionRejected, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Supabase settings mapper sanitizes disabled_agents and detects missing column errors cleanly', () => {
  assert.deepEqual(sanitizeDisabledAgentIds(['agent-tania', ' agent-tania ', 'agent-sakib', 123, '']), [
    'agent-tania',
    'agent-sakib',
  ]);
  assert.deepEqual(sanitizeDisabledAgentIds('["agent-kathy"]'), ['agent-kathy']);
  assert.deepEqual(sanitizeDisabledAgentIds(undefined), []);

  const mapped = rowToSettings({
    id: 'global',
    auto_assign_enabled: true,
    round_robin_index: 3,
    disabled_agents: ['agent-tania', 'agent-sakib'],
    google_sheets_webhook_url: 'https://script.google.com/macros/s/abc/exec',
    call_script: 'Script',
    last_synced_at: null,
    updated_at: '2026-11-22T10:00:00.000Z',
  });
  assert.deepEqual(mapped.disabledAgentIds, ['agent-tania', 'agent-sakib']);
  assert.equal(mapped.roundRobinIndex, 3);

  assert.equal(
    isMissingColumnError(
      { code: 'PGRST204', message: "Could not find the 'disabled_agents' column of 'app_settings' in the schema cache" },
      'disabled_agents'
    ),
    true
  );
  assert.equal(
    isMissingColumnError({ code: '42703', message: 'column "disabled_agents" does not exist' }, 'disabled_agents'),
    true
  );
  assert.equal(isMissingColumnError({ code: '23505', message: 'duplicate key' }, 'disabled_agents'), false);
});

test('resolveUpsertSupabaseCallLogRow reuses existing same-day row id by lead_id or normalized phone and flags duplicates for cleanup', () => {
  const existingRows = [
    {
      id: 'CL-MORNING',
      lead_id: 'L-1817',
      customer_name: 'Nadia Akter',
      phone: '01817705593',
      agent_id: 'agent-tanjin',
      agent_name: 'Tanjin',
      previous_status: 'Pending',
      new_status: 'Interested',
      notes: 'Call later',
      follow_up_at: null,
      call_date: '2026-11-22',
      created_at: '2026-11-22T09:00:00.000Z',
    },
    {
      id: 'CL-STRAY-DUP',
      lead_id: 'L-OTHER',
      customer_name: 'Nadia Akter',
      phone: '+880 1817-705593',
      agent_id: 'agent-tanjin',
      agent_name: 'Tanjin',
      previous_status: 'Interested',
      new_status: 'Busy / Call Later',
      notes: 'Stray row',
      follow_up_at: null,
      call_date: '2026-11-22',
      created_at: '2026-11-22T11:00:00.000Z',
    },
  ];

  const resolved = resolveUpsertSupabaseCallLogRow(
    {
      id: 'CL-FRESH-ID',
      lead_id: 'L-1817',
      customer_name: 'Nadia Akter',
      phone: '01817705593',
      agent_id: 'agent-tanjin',
      agent_name: 'Tanjin',
      previous_status: 'Busy / Call Later',
      new_status: 'Done',
      notes: 'Final Done',
      follow_up_at: null,
      call_date: '2026-11-22',
      created_at: '2026-11-22T14:00:00.000Z',
    },
    existingRows
  );

  // Reuses existing row ID, keeps earliest previous_status ('Pending'), and cleans up extra same-day duplicate
  assert.equal(resolved.rowToUpsert.id, 'CL-STRAY-DUP');
  assert.equal(resolved.rowToUpsert.previous_status, 'Pending');
  assert.equal(resolved.rowToUpsert.new_status, 'Done');
  assert.deepEqual(resolved.duplicateIdsToDelete, ['CL-MORNING']);

  // Different day does not match
  const nextDay = resolveUpsertSupabaseCallLogRow(
    {
      id: 'CL-NEXT-DAY',
      lead_id: 'L-1817',
      customer_name: 'Nadia Akter',
      phone: '01817705593',
      agent_id: 'agent-tanjin',
      agent_name: 'Tanjin',
      previous_status: 'Done',
      new_status: 'Order Confirmed',
      notes: '',
      follow_up_at: null,
      call_date: '2026-11-23',
      created_at: '2026-11-23T10:00:00.000Z',
    },
    existingRows
  );
  assert.equal(nextDay.rowToUpsert.id, 'CL-NEXT-DAY');
  assert.deepEqual(nextDay.duplicateIdsToDelete, []);
});

test('Supabase mappers normalize and preserve Workshop, Accessories, and Rent a Car across leads, call logs, and paid customers', () => {
  const categories = [
    { input: 'workshop', expected: 'Workshop', phone: '01711000011', id: 'L-WS-1' },
    { input: 'accessories', expected: 'Accessories', phone: '01811000022', id: 'L-AC-1' },
    { input: 'rent-a-car', expected: 'Rent a Car', phone: '01911000033', id: 'L-RC-1' },
  ];

  for (const item of categories) {
    const leadRow = leadToSupabaseRow({
      id: item.id,
      customerName: item.input,
      phone: item.phone,
      rawPhone: item.phone,
      facebookLink: '',
      normalizedFacebookLink: '',
      notes: '',
      collectorId: 'collector-farhan',
      collectorName: 'Farhan',
      assignedAgentId: 'agent-tanjin',
      assignedAgentName: 'Tanjin',
      status: 'Order Confirmed',
      followUpAt: null,
      lastCallNotes: '',
      createdAt: '2026-11-24T10:00:00.000Z',
      updatedAt: '2026-11-24T10:00:00.000Z',
      collectedDate: '2026-11-24',
    });
    assert.equal(leadRow.customer_name, item.expected);
    assert.equal(rowToLead(leadRow).customerName, item.expected);

    const logRow = callLogToSupabaseRow({
      id: `CL-${item.id}`,
      leadId: item.id,
      customerName: item.input,
      phone: item.phone,
      agentId: 'agent-tanjin',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Order Confirmed',
      notes: '',
      followUpAt: null,
      timestamp: '2026-11-24T10:05:00.000Z',
    });
    assert.equal(logRow.customer_name, item.expected);
    assert.equal(rowToCallLog(logRow).customerName, item.expected);

    const paidRow = paidCustomerToSupabaseRow({
      id: `PC-${item.id}`,
      leadId: item.id,
      customerName: item.input,
      phone: item.phone,
      assignedAgentId: 'agent-tanjin',
      assignedAgentName: 'Tanjin',
      confirmedDate: '2026-11-24',
      renewalDate: '2026-12-24',
      renewalStatus: 'Active',
      lastRenewedAt: null,
      packageName: '1-Month Standard',
      notes: '',
      createdAt: '2026-11-24T10:05:00.000Z',
      updatedAt: '2026-11-24T10:05:00.000Z',
    });
    assert.equal(paidRow.customer_name, item.expected);
    assert.equal(rowToPaidCustomer(paidRow).customerName, item.expected);
  }
});

test('Supabase Paid Customer mappers sanitize timestamp strings out of package_name', () => {
  const row = rowToPaidCustomer({
    id: 'PC-TS-1',
    lead_id: '',
    customer_name: 'Car',
    phone: '01711223344',
    assigned_agent_id: 'agent-tanjin',
    assigned_agent_name: 'Tanjin',
    confirmed_date: '2026-11-25',
    renewal_date: '2026-12-25',
    renewal_status: 'Active',
    package_name: '2026-11-25T10:30:00.000Z',
    notes: 'Should keep notes',
    created_at: '2026-11-25T10:30:00.000Z',
    updated_at: '2026-11-25T10:30:00.000Z',
  });
  assert.equal(row.packageName, '');
  assert.equal(row.leadId, 'TS-1');

  const manualRow = rowToPaidCustomer({
    id: 'PC-MAN-XYZ',
    lead_id: '',
    customer_name: 'Workshop',
    phone: '01811223344',
    assigned_agent_id: 'agent-kathy',
    assigned_agent_name: 'Kathy',
    confirmed_date: '2026-11-25',
    renewal_date: '2026-12-25',
    renewal_status: 'Active',
    package_name: '3-Month Package',
    notes: '',
    created_at: '2026-11-25T10:30:00.000Z',
    updated_at: '2026-11-25T10:30:00.000Z',
  });
  assert.equal(manualRow.leadId, '');
  assert.equal(manualRow.packageName, '3-Month Package');

  const outRow = paidCustomerToSupabaseRow({
    ...manualRow,
    packageName: '2026-11-25T11:00:00.000Z',
  });
  assert.equal(outRow.package_name, '');
});
