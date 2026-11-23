import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysToYmd,
  assignLeadsRoundRobin,
  authenticateUser,
  buildDhakaFollowUpIso,
  buildSafeExternalUrl,
  buildTelUrl,
  buildWhatsAppUrl,
  clampDateToDhakaToday,
  normalizeWhatsAppPhone,
  openWhatsAppChat,
  WHATSAPP_WINDOW_NAME,
  computeAgentPerformance,
  computeDashboardMetrics,
  computeDaysRemaining,
  computeEffectiveRenewalStatus,
  computeFinalDailySummary,
  computeKawsarPostStats,
  createPaidCustomerFromLead,
  deduplicateSameDayCallLogs,
  detectDeviceClockAhead,
  filterAgentAssignedQueueLeads,
  filterCollectorTodayLeads,
  filterTodayCallLogs,
  filterTodayDuplicateAttempts,
  filterTodayLeads,
  filterTodayPosts,
  findDuplicateLead,
  findDuplicatePost,
  findExistingTodayCallLog,
  formatDateTime,
  formatShortDate,
  formatTime,
  generateDailyReportCsv,
  generateFinalDailySummaryCsv,
  generatePaidCustomersCsv,
  getActiveAgents,
  getAgentTodayCallLogs,
  getCopyablePhoneNumber,
  getDhakaDateString,
  getDhakaFollowUpFields,
  getDueRenewalCustomers,
  getLeadCollectedYmd,
  getNextRoundRobinAgent,
  getScheduledFollowUps,
  isTimestampToday,
  isValidPostUrl,
  normalizeBdPhone,
  normalizeFacebookUrl,
  normalizePostUrl,
  normalizeVehicleType,
  parseCsvLeads,
  parseDateToYmd,
  renewPaidCustomer,
  upsertTodayCallLogInList,
} from './leadLogic';
import { DATA_COLLECTORS, DEMO_USERS } from '../data/seedData';
import { authenticateServerTeamUser } from '../server/teamUsers';
import { CALL_STATUSES, CallLog, ContentPost, DuplicateAttempt, Lead, PaidCustomer, User, VEHICLE_TYPES } from '../types';

const mockAgents: User[] = [
  { id: 'a1', name: 'Tanjin', email: 'tanjin@runbd.com', password: '123', role: 'agent', title: 'Agent', avatarInitials: 'TJ' },
  { id: 'a2', name: 'Kathy', email: 'kathy@runbd.com', password: '123', role: 'agent', title: 'Agent', avatarInitials: 'KT' },
  { id: 'a3', name: 'Tania', email: 'tania@runbd.com', password: '123', role: 'agent', title: 'Agent', avatarInitials: 'TN' },
  { id: 'a4', name: 'Shanaz', email: 'shanaz@runbd.com', password: '123', role: 'agent', title: 'Agent', avatarInitials: 'SH' },
  { id: 'a5', name: 'Sizon', email: 'sizon@runbd.com', password: '123', role: 'agent', title: 'Agent', avatarInitials: 'SZ' },
  { id: 'a6', name: 'Sakib', email: 'sakib@runbd.com', password: '123', role: 'agent', title: 'Agent', avatarInitials: 'SK' },
];

const existingLeads: Lead[] = [
  {
    id: 'L-1',
    customerName: 'Rafiqul Islam',
    phone: '01711223344',
    rawPhone: '+8801711223344',
    facebookLink: 'https://www.facebook.com/rafiqul.islam.bd/',
    normalizedFacebookLink: 'facebook.com/rafiqul.islam.bd',
    notes: 'Interested in wholesale',
    collectorId: 'c1',
    collectorName: 'Collector 1',
    assignedAgentId: 'a1',
    assignedAgentName: 'Tanjin',
    status: 'Order Confirmed',
    followUpAt: null,
    lastCallNotes: 'Confirmed 5 units',
    createdAt: '2026-11-17T08:00:00.000Z',
    updatedAt: '2026-11-17T09:00:00.000Z',
  },
];

test('normalizeBdPhone treats +8801, 8801, 0088, +88, and 01 as identical canonical 01XXXXXXXXX', () => {
  assert.equal(normalizeBdPhone('+8801711223344'), '01711223344');
  assert.equal(normalizeBdPhone('8801711223344'), '01711223344');
  assert.equal(normalizeBdPhone('008801711223344'), '01711223344');
  assert.equal(normalizeBdPhone('0088 01711-223344'), '01711223344');
  assert.equal(normalizeBdPhone('01711223344'), '01711223344');
  assert.equal(normalizeBdPhone('+88 01711-223344'), '01711223344');
  assert.equal(normalizeBdPhone('881711223344'), '01711223344');
  assert.equal(normalizeBdPhone('1711223344'), '01711223344');
  assert.equal(normalizeBdPhone('01211223344'), null); // invalid BD operator prefix 012
  assert.equal(normalizeBdPhone('12345'), null);
});

test('normalizeFacebookUrl standardizes protocol, repeated subdomains, permalinks, and trailing slashes', () => {
  assert.equal(
    normalizeFacebookUrl('https://www.facebook.com/Rafiqul.Islam.BD/?ref=bookmarks'),
    'facebook.com/rafiqul.islam.bd'
  );
  assert.equal(
    normalizeFacebookUrl('http://m.facebook.com/rafiqul.islam.bd/'),
    'facebook.com/rafiqul.islam.bd'
  );
  assert.equal(
    normalizeFacebookUrl('https://www.m.facebook.com/rafiqul.islam.bd/?mibextid=ZbWKwL'),
    'facebook.com/rafiqul.islam.bd'
  );
  assert.equal(
    normalizeFacebookUrl('https://facebook.com/profile.php?id=10008452100&sk=about'),
    'facebook.com/profile.php?id=10008452100'
  );
  assert.equal(
    normalizeFacebookUrl('https://www.facebook.com/permalink.php?story_fbid=998877&id=112233&ref=share'),
    'facebook.com/permalink.php?story_fbid=998877&id=112233'
  );
});

test('findDuplicateLead detects duplicates by normalized phone or normalized Facebook URL', () => {
  const phoneDup = findDuplicateLead(existingLeads, '8801711223344', 'https://facebook.com/someone.else');
  assert.equal(phoneDup?.matchedBy, 'phone');
  assert.equal(phoneDup?.lead.id, 'L-1');

  const fbDup = findDuplicateLead(existingLeads, '01819998877', 'http://m.facebook.com/rafiqul.islam.bd');
  assert.equal(fbDup?.matchedBy, 'facebook');
  assert.equal(fbDup?.lead.id, 'L-1');

  const unique = findDuplicateLead(existingLeads, '01911002233', 'https://facebook.com/unique.person');
  assert.equal(unique, null);
});

test('parseCsvLeads validates rows, catches existing and intra-batch duplicates', () => {
  const csv = [
    'Name,Phone,Facebook_Link',
    'New Customer 1,+8801812345678,https://facebook.com/new.cust1',
    'Duplicate Existing,01711223344,https://facebook.com/other',
    'Duplicate Batch,8801812345678,https://facebook.com/new.cust2',
    'Invalid Phone,011999,https://facebook.com/bad.phone',
    'New Customer 2,01912345678,https://facebook.com/new.cust2',
  ].join('\n');

  const preview = parseCsvLeads(csv, existingLeads);
  assert.equal(preview.length, 5);
  assert.equal(preview[0].status, 'valid');
  assert.equal(preview[1].status, 'duplicate');
  assert.equal(preview[2].status, 'duplicate');
  assert.equal(preview[3].status, 'invalid');
  assert.equal(preview[4].status, 'valid');
});

test('assignLeadsRoundRobin distributes equally across 6 agents and respects autoAssign toggle', () => {
  const batch = Array.from({ length: 8 }, (_, i) => ({
    id: `N-${i}`,
    customerName: `Customer ${i}`,
    phone: `0171000000${i}`,
    rawPhone: `0171000000${i}`,
    facebookLink: '',
    normalizedFacebookLink: '',
    notes: '',
    collectorId: 'collector-farhan',
    collectorName: 'Farhan',
    status: 'Pending' as const,
    followUpAt: null,
    lastCallNotes: '',
    createdAt: '2026-11-17T10:00:00.000Z',
    updatedAt: '2026-11-17T10:00:00.000Z',
  }));

  const { assignedLeads, nextIndex } = assignLeadsRoundRobin(batch, mockAgents, 0, true);
  assert.deepEqual(
    assignedLeads.map((l) => l.assignedAgentName),
    ['Tanjin', 'Kathy', 'Tania', 'Shanaz', 'Sizon', 'Sakib', 'Tanjin', 'Kathy']
  );
  assert.equal(nextIndex, 2);

  const disabled = assignLeadsRoundRobin(batch.slice(0, 2), mockAgents, 2, false);
  assert.equal(disabled.assignedLeads[0].assignedAgentId, null);
  assert.equal(disabled.nextIndex, 2);
});

test('computeDashboardMetrics and computeAgentPerformance calculate conversion rate accurately', () => {
  const now = new Date('2026-11-17T12:00:00.000Z');
  const logs: CallLog[] = [
    {
      id: 'CL-1',
      leadId: 'L-1',
      customerName: 'Rafiqul Islam',
      phone: '01711223344',
      agentId: 'a1',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Order Confirmed',
      notes: 'Done',
      followUpAt: null,
      timestamp: '2026-11-17T09:00:00.000Z',
    },
  ];
  const metrics = computeDashboardMetrics(
    existingLeads,
    logs,
    { preset: 'all', startDate: '', endDate: '' },
    now
  );
  assert.equal(metrics.totalLeads, 1);
  assert.equal(metrics.orderConfirmedCount, 1);
  assert.equal(metrics.conversionRate, 100);

  const perf = computeAgentPerformance(
    mockAgents,
    existingLeads,
    logs,
    { preset: 'all', startDate: '', endDate: '' },
    now
  );
  assert.equal(perf[0].agentName, 'Tanjin');
  assert.equal(perf[0].conversions, 1);
  assert.equal(perf[0].successRate, 100);
});

test('Click-to-Call and WhatsApp link builders format Bangladeshi numbers properly', () => {
  assert.equal(buildTelUrl('01711223344'), 'tel:+8801711223344');
  assert.equal(normalizeWhatsAppPhone('01711223344'), '8801711223344');
  assert.equal(normalizeWhatsAppPhone('+880 1711-223344'), '8801711223344');
  assert.equal(normalizeWhatsAppPhone('008801711223344'), '8801711223344');
  assert.equal(normalizeWhatsAppPhone('1711223344'), '8801711223344');
  assert.equal(
    buildWhatsAppUrl('+8801711223344'),
    'https://web.whatsapp.com/send?phone=8801711223344'
  );
  assert.equal(
    buildWhatsAppUrl('01812345678'),
    'https://web.whatsapp.com/send?phone=8801812345678'
  );
});

test('openWhatsAppChat reuses single named tab runbd_whatsapp_tab and falls back cleanly when popups are blocked', () => {
  const openCalls: Array<{ url: string; target?: string; features?: string }> = [];
  let focusCount = 0;

  const mockWin = {
    open: (url: string, target?: string, features?: string) => {
      openCalls.push({ url, target, features });
      return {
        focus: () => {
          focusCount += 1;
        },
      };
    },
  };

  const first = openWhatsAppChat('01711223344', { win: mockWin });
  const second = openWhatsAppChat('+880 1812-345678', { win: mockWin });

  assert.equal(WHATSAPP_WINDOW_NAME, 'runbd_whatsapp_tab');
  assert.equal(first.opened, true);
  assert.equal(first.fallbackUsed, false);
  assert.equal(second.opened, true);
  assert.equal(focusCount, 2);
  assert.deepEqual(openCalls, [
    {
      url: 'https://web.whatsapp.com/send?phone=8801711223344',
      target: 'runbd_whatsapp_tab',
      features: undefined,
    },
    {
      url: 'https://web.whatsapp.com/send?phone=8801812345678',
      target: 'runbd_whatsapp_tab',
      features: undefined,
    },
  ]);

  // Popup-blocked fallback clicks a temporary <a target="runbd_whatsapp_tab">
  let blockedCallbackCalled = false;
  let clickedAnchor: { href: string; target: string } | null = null;
  let removed = false;

  const blockedRes = openWhatsAppChat('01911223344', {
    win: {
      open: () => null,
    },
    doc: {
      createElement: () => {
        const el = {
          href: '',
          target: '',
          style: {},
          click: () => {
            clickedAnchor = { href: el.href, target: el.target };
          },
          remove: () => {
            removed = true;
          },
        };
        return el;
      },
      body: {
        appendChild: () => {},
      },
    },
    onPopupBlocked: () => {
      blockedCallbackCalled = true;
    },
  });

  assert.equal(blockedRes.opened, false);
  assert.equal(blockedRes.fallbackUsed, true);
  assert.equal(blockedCallbackCalled, true);
  assert.deepEqual(clickedAnchor, {
    href: 'https://web.whatsapp.com/send?phone=8801911223344',
    target: 'runbd_whatsapp_tab',
  });
  assert.equal(removed, true);
});

test('authenticateUser and authenticateServerTeamUser verify credentials for Admin, 6 Agents, 2 Collectors & Poster Kawsar', async () => {
  const validPairs: Array<[string, string, string, string, string]> = [
    ['admin@runbd', 'admin@/#312', 'admin', 'Jahid Islam', 'admin-1'],
    ['tazin@runbd', 'tazin@/#312', 'agent', 'Tanjin', 'agent-tanjin'],
    ['kathy@runbd', 'kathy@/#312', 'agent', 'Kathy', 'agent-kathy'],
    ['tania@runbd', 'tania@/#312', 'agent', 'Tania', 'agent-tania'],
    ['shanaz@runbd', 'shanaz@/#312', 'agent', 'Shanaz', 'agent-shanaz'],
    ['sizon@runbd', 'sizon@/#312', 'agent', 'Sizon', 'agent-sizon'],
    ['sakib@runbd', 'sakib@/#312', 'agent', 'Sakib', 'agent-sakib'],
    ['farhan@runbd', 'farhan@/#312', 'collector', 'Farhan', 'collector-farhan'],
    ['naim@runbd', 'naim@/#312', 'collector', 'Naim', 'collector-naim'],
    ['kawsar@runbd', 'kawsar@/#312', 'poster', 'Kawsar', 'poster-kawsar'],
  ];

  for (const [username, password, expectedRole, expectedName, expectedId] of validPairs) {
    const user = authenticateUser(DEMO_USERS, username, password);
    assert.ok(user, `Expected valid client login for ${username}`);
    assert.equal(user.role, expectedRole);
    assert.equal(user.name, expectedName);
    assert.equal(user.id, expectedId);

    const serverRes = await authenticateServerTeamUser(username, password);
    if (serverRes.ok) {
      assert.equal(serverRes.user.role, expectedRole);
      assert.equal(serverRes.user.name, expectedName);
      assert.equal(serverRes.user.id, expectedId);
    } else {
      assert.equal(
        serverRes.reason,
        'inactive',
        `Expected valid or intentionally deactivated server login for ${username}, got ${serverRes.reason}`
      );
    }
  }

  assert.equal(DATA_COLLECTORS.length, 2);
  assert.deepEqual(
    DATA_COLLECTORS.map((c) => c.name),
    ['Farhan', 'Naim']
  );

  // Case-insensitive username, case-sensitive exact password
  assert.equal(authenticateUser(DEMO_USERS, 'TAZIN@RUNBD', 'tazin@/#312')?.name, 'Tanjin');
  assert.equal(authenticateUser(DEMO_USERS, 'KAWSAR@RUNBD', 'kawsar@/#312')?.id, 'poster-kawsar');
  assert.equal(authenticateUser(DEMO_USERS, 'kawsar@runbd', 'Kawsar@/#312'), null);
  const badServer = await authenticateServerTeamUser('kawsar@runbd', 'wrong');
  assert.equal(badServer.ok, false);
  assert.equal(authenticateUser(DEMO_USERS, 'tazin@runbd', 'Tazin@/#312'), null);
  // Cross-agent password rejected
  assert.equal(authenticateUser(DEMO_USERS, 'tazin@runbd', 'kathy@/#312'), null);
  // Old generic collector rejected
  assert.equal(authenticateUser(DEMO_USERS, 'collector@runbd', 'collector@/#312'), null);
  // Old password rejected
  assert.equal(authenticateUser(DEMO_USERS, 'admin@runbd', 'password123'), null);
});

test('generateDailyReportCsv compiles daily calls, successful orders, and follow-ups for all 6 agents plus TOTAL', () => {
  const reportDate = new Date('2026-11-17T15:00:00+06:00');
  const todayIso = new Date('2026-11-17T11:30:00+06:00').toISOString();
  const followUpIso = new Date('2026-11-17T16:00:00+06:00').toISOString();
  const yesterdayIso = new Date('2026-11-16T11:30:00+06:00').toISOString();

  const sampleLeads: Lead[] = [
    {
      ...existingLeads[0],
      id: 'L-T1',
      assignedAgentId: 'a1',
      assignedAgentName: 'Tanjin',
      status: 'Order Confirmed',
      followUpAt: null,
    },
    {
      ...existingLeads[0],
      id: 'L-K1',
      assignedAgentId: 'a2',
      assignedAgentName: 'Kathy',
      status: 'Busy / Call Later',
      followUpAt: followUpIso,
    },
  ];

  const sampleLogs: CallLog[] = [
    {
      id: 'C-1',
      leadId: 'L-T1',
      customerName: 'Cust 1',
      phone: '01711223344',
      agentId: 'a1',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Order Confirmed',
      notes: 'Done',
      followUpAt: null,
      timestamp: todayIso,
    },
    {
      id: 'C-2',
      leadId: 'L-K1',
      customerName: 'Cust 2',
      phone: '01811223344',
      agentId: 'a2',
      agentName: 'Kathy',
      previousStatus: 'Pending',
      newStatus: 'Busy / Call Later',
      notes: 'Call later',
      followUpAt: followUpIso,
      timestamp: todayIso,
    },
    {
      id: 'C-OLD',
      leadId: 'L-T1',
      customerName: 'Old Call',
      phone: '01711223344',
      agentId: 'a1',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Order Confirmed',
      notes: 'Yesterday',
      followUpAt: null,
      timestamp: yesterdayIso,
    },
  ];

  const csv = generateDailyReportCsv(mockAgents, sampleLeads, sampleLogs, reportDate);
  assert.ok(csv.startsWith('\uFEFF'), 'Should include UTF-8 BOM for Excel compatibility');
  const lines = csv.replace('\uFEFF', '').split('\n');
  assert.equal(lines.length, 8); // header + 6 agents + TOTAL
  assert.ok(lines[1].includes('2026-11-17,Tanjin,1,1,0,0,100%'));
  assert.ok(lines[2].includes('2026-11-17,Kathy,1,0,0,1,0%'));
  assert.ok(lines[6].includes('2026-11-17,Sakib,0,0,0,0,0%'));
  assert.ok(lines[7].includes('2026-11-17,TOTAL,2,1,0,1,50%'));
});

test('strict duplicate detection handles +8800, spaces, missing leading 0, and fb.me links', () => {
  assert.equal(normalizeBdPhone('+880 01711-223344'), '01711223344');
  assert.equal(normalizeBdPhone('1711223344'), '01711223344');

  const dup1 = findDuplicateLead(existingLeads, '+880 01711 223344', '');
  assert.equal(dup1?.matchedBy, 'phone');

  const dup2 = findDuplicateLead(existingLeads, '1711223344', '');
  assert.equal(dup2?.matchedBy, 'phone');

  const dupFb = findDuplicateLead(existingLeads, '01999887766', 'https://fb.me/Rafiqul.Islam.BD/');
  assert.equal(dupFb?.matchedBy, 'facebook');
});

test('getScheduledFollowUps includes both today and future scheduled follow-ups sorted chronologically', () => {
  const todayFollowUp = '2026-11-17T16:00:00.000Z';
  const futureFollowUp = '2026-11-20T10:30:00.000Z';
  const leadsList: Lead[] = [
    {
      ...existingLeads[0],
      id: 'L-FUTURE',
      assignedAgentId: 'a1',
      status: 'Interested',
      followUpAt: futureFollowUp,
    },
    {
      ...existingLeads[0],
      id: 'L-TODAY',
      assignedAgentId: 'a1',
      status: 'Busy / Call Later',
      followUpAt: todayFollowUp,
    },
    {
      ...existingLeads[0],
      id: 'L-NONE',
      assignedAgentId: 'a1',
      status: 'Pending',
      followUpAt: null,
    },
    {
      ...existingLeads[0],
      id: 'L-OTHER-AGENT',
      assignedAgentId: 'a2',
      status: 'Interested',
      followUpAt: futureFollowUp,
    },
  ];

  const queue = getScheduledFollowUps(leadsList, 'a1');
  assert.equal(queue.length, 2);
  assert.equal(queue[0].id, 'L-TODAY');
  assert.equal(queue[1].id, 'L-FUTURE');
});

test('Kawsar dual-link URL normalization, duplicate prevention, and live stats counters work accurately', () => {
  assert.equal(isValidPostUrl('https://facebook.com/runbd/posts/12345'), true);
  assert.equal(isValidPostUrl('runbd.com/products/hoodie'), true);
  assert.equal(isValidPostUrl('not a url'), false);

  assert.equal(
    normalizePostUrl('https://www.facebook.com/runbd/posts/12345/?fbclid=abc&utm_source=fb'),
    normalizePostUrl('http://m.facebook.com/runbd/posts/12345')
  );

  const now = new Date('2026-11-18T12:00:00+06:00');
  const todayIso = new Date('2026-11-18T09:30:00+06:00').toISOString();
  const yesterdayIso = new Date('2026-11-17T09:30:00+06:00').toISOString();

  const posts: ContentPost[] = [
    {
      id: 'POST-1',
      facebookLink: 'https://www.facebook.com/runbd/posts/12345/',
      normalizedFacebookLink: normalizePostUrl('https://www.facebook.com/runbd/posts/12345/'),
      websiteLink: 'https://runbd.com/products/winter-hoodie',
      normalizedWebsiteLink: normalizePostUrl('https://runbd.com/products/winter-hoodie'),
      note: 'Winter Hoodie Launch',
      posterId: 'poster-kawsar',
      posterName: 'Kawsar',
      createdAt: todayIso,
    },
    {
      id: 'POST-2',
      facebookLink: '',
      normalizedFacebookLink: '',
      websiteLink: 'https://runbd.com/products/summer-tee',
      normalizedWebsiteLink: normalizePostUrl('https://runbd.com/products/summer-tee'),
      note: 'Website Only Listing',
      posterId: 'poster-kawsar',
      posterName: 'Kawsar',
      createdAt: yesterdayIso,
    },
  ];

  // Duplicate check catches Facebook link variant
  const dupFb = findDuplicatePost(
    posts,
    'https://m.facebook.com/runbd/posts/12345?fbclid=xyz',
    'https://runbd.com/products/new-item'
  );
  assert.equal(dupFb?.post.id, 'POST-1');
  assert.equal(dupFb?.matchedField, 'Facebook Link');

  // Duplicate check catches Website link variant
  const dupWeb = findDuplicatePost(
    posts,
    'https://facebook.com/runbd/posts/99999',
    'https://www.runbd.com/products/winter-hoodie/'
  );
  assert.equal(dupWeb?.post.id, 'POST-1');
  assert.equal(dupWeb?.matchedField, 'Website Link');

  const unique = findDuplicatePost(
    posts,
    'https://facebook.com/runbd/posts/77777',
    'https://runbd.com/products/new-jacket'
  );
  assert.equal(unique, null);

  const stats = computeKawsarPostStats(posts, now);
  assert.equal(stats.todayCount, 1);
  assert.equal(stats.facebookCount, 1);
  assert.equal(stats.websiteCount, 2);
  assert.equal(stats.totalCount, 2);
});

test('computeFinalDailySummary and generateFinalDailySummaryCsv consolidate 6 agents, Farhan/Naim, and Kawsar by date', () => {
  const targetDate = '2026-11-18';
  const targetIso = new Date('2026-11-18T10:00:00+06:00').toISOString();
  const otherDayIso = new Date('2026-11-17T10:00:00+06:00').toISOString();

  const collectors: User[] = [
    { id: 'collector-farhan', name: 'Farhan', email: 'farhan@runbd', password: '123', role: 'collector', title: 'Collector', avatarInitials: 'FR' },
    { id: 'collector-naim', name: 'Naim', email: 'naim@runbd', password: '123', role: 'collector', title: 'Collector', avatarInitials: 'NM' },
  ];

  const sampleLeads: Lead[] = [
    {
      ...existingLeads[0],
      id: 'L-10',
      collectorId: 'collector-farhan',
      collectorName: 'Farhan',
      assignedAgentId: 'a1',
      assignedAgentName: 'Tanjin',
      status: 'Order Confirmed',
      createdAt: targetIso,
    },
    {
      ...existingLeads[0],
      id: 'L-11',
      collectorId: 'collector-naim',
      collectorName: 'Naim',
      assignedAgentId: 'a6',
      assignedAgentName: 'Sakib',
      status: 'Interested',
      createdAt: targetIso,
    },
    {
      ...existingLeads[0],
      id: 'L-OLD',
      collectorId: 'collector-farhan',
      collectorName: 'Farhan',
      assignedAgentId: 'a2',
      assignedAgentName: 'Kathy',
      status: 'Pending',
      createdAt: otherDayIso,
    },
  ];

  const sampleLogs: CallLog[] = [
    {
      id: 'CL-10',
      leadId: 'L-10',
      customerName: 'Cust 10',
      phone: '01711223344',
      agentId: 'a1',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Order Confirmed',
      notes: 'Confirmed',
      followUpAt: null,
      timestamp: targetIso,
    },
    {
      id: 'CL-11',
      leadId: 'L-11',
      customerName: 'Cust 11',
      phone: '01811223344',
      agentId: 'a6',
      agentName: 'Sakib',
      previousStatus: 'Pending',
      newStatus: 'Interested',
      notes: 'Interested',
      followUpAt: null,
      timestamp: targetIso,
    },
  ];

  const samplePosts: ContentPost[] = [
    {
      id: 'P-1',
      facebookLink: 'https://facebook.com/runbd/posts/1',
      normalizedFacebookLink: 'facebook.com/runbd/posts/1',
      websiteLink: 'https://runbd.com/p/1',
      normalizedWebsiteLink: 'runbd.com/p/1',
      note: 'Launch',
      posterId: 'poster-kawsar',
      posterName: 'Kawsar',
      createdAt: targetIso,
    },
    {
      id: 'P-2',
      facebookLink: '',
      normalizedFacebookLink: '',
      websiteLink: 'https://runbd.com/p/2',
      normalizedWebsiteLink: 'runbd.com/p/2',
      note: 'Web only',
      posterId: 'poster-kawsar',
      posterName: 'Kawsar',
      createdAt: targetIso,
    },
  ];

  const summary = computeFinalDailySummary(
    mockAgents,
    collectors,
    sampleLeads,
    sampleLogs,
    samplePosts,
    targetDate
  );

  assert.equal(summary.agents.length, 6);
  // Historical L-OLD assigned to Kathy (a2) on otherDayIso must NOT appear in targetDate assignedLeads or pending
  const tanjinRow = summary.agents.find((a) => a.agentId === 'a1');
  const kathyRow = summary.agents.find((a) => a.agentId === 'a2');
  const sakibRow = summary.agents.find((a) => a.agentId === 'a6');
  assert.equal(tanjinRow?.assignedLeads, 1);
  assert.equal(tanjinRow?.orderConfirmed, 1);
  assert.equal(kathyRow?.assignedLeads, 0);
  assert.equal(kathyRow?.pending, 0);
  assert.equal(sakibRow?.assignedLeads, 1);
  assert.equal(sakibRow?.interested, 1);
  assert.equal(summary.agentTotals.assignedLeads, 2);
  assert.equal(summary.agentTotals.callsMade, 2);
  assert.equal(summary.agentTotals.orderConfirmed, 1);
  assert.equal(summary.agentTotals.interested, 1);
  assert.equal(summary.agentTotals.pending, 0);
  assert.equal(summary.collectors[0].leadsCollectedOnDate, 1); // Farhan on targetDate
  assert.equal(summary.collectors[1].leadsCollectedOnDate, 1); // Naim on targetDate
  assert.equal(summary.totalCollectedOnDate, 2);
  assert.equal(summary.kawsar.facebookLinks, 1);
  assert.equal(summary.kawsar.websiteLinks, 2);

  const csv = generateFinalDailySummaryCsv(summary);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes(`CALL CENTER AGENTS PERFORMANCE (${targetDate})`));
  assert.ok(csv.includes(`DATA COLLECTORS (${targetDate})`));
  assert.ok(csv.includes(`CONTENT & LINK POSTER (KAWSAR - ${targetDate})`));
  assert.ok(!csv.includes('All Time'));
  assert.ok(csv.includes('Kawsar,2,1,2'));
});

test('Today-only filters isolate current day records so agents, collectors, and poster reset to 0 daily', () => {
  const now = new Date('2026-11-21T09:15:00+06:00');
  const todayIso = new Date('2026-11-21T08:30:00+06:00').toISOString();
  const yesterdayIso = new Date('2026-11-20T23:50:00+06:00').toISOString();

  assert.equal(isTimestampToday(todayIso, now), true);
  assert.equal(isTimestampToday(yesterdayIso, now), false);

  const mixedLeads: Lead[] = [
    { ...existingLeads[0], id: 'L-YEST', createdAt: yesterdayIso, updatedAt: todayIso },
    { ...existingLeads[0], id: 'L-TODAY', createdAt: todayIso, updatedAt: todayIso },
  ];
  assert.deepEqual(
    filterTodayLeads(mixedLeads, now).map((l) => l.id),
    ['L-TODAY']
  );
  assert.equal(filterTodayLeads([{ ...existingLeads[0], id: 'L-YEST', createdAt: yesterdayIso }], now).length, 0);

  const mixedLogs: CallLog[] = [
    {
      id: 'C-YEST',
      leadId: 'L-YEST',
      customerName: 'Old',
      phone: '01711223344',
      agentId: 'a1',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Interested',
      notes: '',
      followUpAt: null,
      timestamp: yesterdayIso,
    },
    {
      id: 'C-TODAY',
      leadId: 'L-TODAY',
      customerName: 'New',
      phone: '01811223344',
      agentId: 'a1',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Order Confirmed',
      notes: '',
      followUpAt: null,
      timestamp: todayIso,
    },
  ];
  assert.deepEqual(
    filterTodayCallLogs(mixedLogs, now).map((c) => c.id),
    ['C-TODAY']
  );

  const mixedPosts: ContentPost[] = [
    {
      id: 'P-YEST',
      facebookLink: 'https://facebook.com/runbd/posts/old',
      normalizedFacebookLink: 'facebook.com/runbd/posts/old',
      websiteLink: 'https://runbd.com/old',
      normalizedWebsiteLink: 'runbd.com/old',
      note: 'Yesterday post',
      posterId: 'poster-kawsar',
      posterName: 'Kawsar',
      createdAt: yesterdayIso,
    },
  ];
  assert.equal(filterTodayPosts(mixedPosts, now).length, 0);
  const kawsarDayStartStats = computeKawsarPostStats(mixedPosts, now);
  assert.equal(kawsarDayStartStats.todayCount, 0);
  assert.equal(kawsarDayStartStats.todayFacebookCount, 0);
  assert.equal(kawsarDayStartStats.todayWebsiteCount, 0);

  const mixedDups: DuplicateAttempt[] = [
    {
      id: 'D-YEST',
      collectorId: 'collector-farhan',
      collectorName: 'Farhan',
      attemptedName: 'Old',
      attemptedPhone: '01711223344',
      attemptedFacebook: '',
      matchedBy: 'phone',
      existingCollectorName: 'Naim',
      existingDate: yesterdayIso,
      timestamp: yesterdayIso,
    },
    {
      id: 'D-TODAY',
      collectorId: 'collector-farhan',
      collectorName: 'Farhan',
      attemptedName: 'New',
      attemptedPhone: '01811223344',
      attemptedFacebook: '',
      matchedBy: 'phone',
      existingCollectorName: 'Naim',
      existingDate: yesterdayIso,
      timestamp: todayIso,
    },
  ];
  assert.deepEqual(
    filterTodayDuplicateAttempts(mixedDups, now).map((d) => d.id),
    ['D-TODAY']
  );
});

test('Paid Customers: createPaidCustomerFromLead sets Today and +30 days, renewPaidCustomer extends +1 month, and 2-day advance alerts scope cleanly', () => {
  const now = new Date('2026-11-20T10:00:00+06:00'); // 2026-11-20 Asia/Dhaka
  assert.equal(addDaysToYmd('2026-11-20', 30), '2026-12-20');
  assert.equal(addDaysToYmd('2026-11-20', 2), '2026-11-22');

  const lead: Lead = {
    ...existingLeads[0],
    id: 'RBD-ORDER-1',
    customerName: 'Nusrat Jahan',
    phone: '01812345678',
    rawPhone: '+8801812345678',
    assignedAgentId: 'a1',
    assignedAgentName: 'Tanjin',
    status: 'Order Confirmed',
    lastCallNotes: '1 month subscription confirmed',
  };

  const created = createPaidCustomerFromLead(lead, now);
  assert.equal(created.id, 'PC-RBD-ORDER-1');
  assert.equal(created.leadId, 'RBD-ORDER-1');
  assert.equal(created.confirmedDate, '2026-11-20');
  assert.equal(created.renewalDate, '2026-12-20');
  assert.equal(created.renewalStatus, 'Active');
  assert.equal(computeDaysRemaining(created.renewalDate, now), 30);
  assert.equal(computeEffectiveRenewalStatus(created, now), 'Active');

  const due2Days: PaidCustomer = {
    ...created,
    id: 'PC-DUE-2',
    customerName: 'Due In 2 Days',
    renewalDate: '2026-11-22',
    assignedAgentId: 'a1',
    assignedAgentName: 'Tanjin',
    renewalStatus: 'Active',
  };
  const dueTodayOtherAgent: PaidCustomer = {
    ...created,
    id: 'PC-DUE-0',
    customerName: 'Due Today',
    renewalDate: '2026-11-20',
    assignedAgentId: 'a2',
    assignedAgentName: 'Kathy',
    renewalStatus: 'Active',
  };
  const alreadyExpired: PaidCustomer = {
    ...created,
    id: 'PC-EXP',
    customerName: 'Expired Customer',
    renewalDate: '2026-11-18',
    assignedAgentId: 'a1',
    assignedAgentName: 'Tanjin',
    renewalStatus: 'Active',
  };
  const explicitlyExpiredToday: PaidCustomer = {
    ...created,
    id: 'PC-EXP-FLAG',
    customerName: 'Explicitly Expired',
    renewalDate: '2026-11-21',
    assignedAgentId: 'a1',
    assignedAgentName: 'Tanjin',
    renewalStatus: 'Expired',
  };

  assert.equal(computeEffectiveRenewalStatus(alreadyExpired, now), 'Expired');

  const allDue = getDueRenewalCustomers(
    [created, due2Days, dueTodayOtherAgent, alreadyExpired, explicitlyExpiredToday],
    now
  );
  assert.deepEqual(
    allDue.map((d) => d.customer.id),
    ['PC-DUE-0', 'PC-DUE-2']
  );
  assert.equal(allDue[0].daysRemaining, 0);
  assert.equal(allDue[1].daysRemaining, 2);

  // Agent scoping shows only that agent's due renewals
  const agent1Due = getDueRenewalCustomers(
    [created, due2Days, dueTodayOtherAgent, alreadyExpired],
    now,
    'a1'
  );
  assert.deepEqual(
    agent1Due.map((d) => d.customer.id),
    ['PC-DUE-2']
  );

  // Renewing extends +30 days from existing future renewalDate and clears the 2-day alert
  const renewed = renewPaidCustomer(due2Days, now);
  assert.equal(renewed.renewalStatus, 'Renewed');
  assert.equal(renewed.renewalDate, '2026-12-22');
  assert.equal(computeDaysRemaining(renewed.renewalDate, now), 32);
  assert.equal(getDueRenewalCustomers([renewed], now).length, 0);

  // Renewing an expired customer extends +30 days from Today (not old past date)
  const renewedExpired = renewPaidCustomer(alreadyExpired, now);
  assert.equal(renewedExpired.renewalStatus, 'Renewed');
  assert.equal(renewedExpired.renewalDate, '2026-12-20');

  const csv = generatePaidCustomersCsv([due2Days, renewed], now);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('Customer Name,Phone,Assigned Agent,Confirmed Date,Renewal Date,Days Remaining,Renewal Status'));
  assert.ok(csv.includes('Due In 2 Days,01812345678,Tanjin,2026-11-20,2026-11-22,2,Active'));
});

test('filterTodayLeads strictly checks collectedDate/date/createdAt (including bare YYYY-MM-DD) and never falls back to updatedAt or missing date', () => {
  const now = new Date('2026-11-21T10:30:00+06:00'); // 2026-11-21 Asia/Dhaka
  const todayIso = new Date('2026-11-21T09:00:00+06:00').toISOString();

  assert.equal(parseDateToYmd('2026-11-20'), '2026-11-20');
  assert.equal(parseDateToYmd('2026-11-21'), '2026-11-21');
  assert.equal(parseDateToYmd(''), null);
  assert.equal(parseDateToYmd(undefined), null);

  const leadsToCheck: Lead[] = [
    { ...existingLeads[0], id: 'L-BARE-YEST', createdAt: '2026-11-20', updatedAt: todayIso },
    { ...existingLeads[0], id: 'L-COLLECTED-YEST', collectedDate: '2026-11-20', createdAt: todayIso, updatedAt: todayIso },
    { ...existingLeads[0], id: 'L-LEGACY-YEST', date: '2026-11-20', createdAt: todayIso, updatedAt: todayIso },
    { ...existingLeads[0], id: 'L-MISSING-DATE', createdAt: '', updatedAt: todayIso },
    { ...existingLeads[0], id: 'L-BARE-TODAY', createdAt: '2026-11-21', updatedAt: todayIso },
    { ...existingLeads[0], id: 'L-ISO-TODAY', createdAt: todayIso, updatedAt: todayIso },
  ];

  assert.equal(getLeadCollectedYmd(leadsToCheck[0]), '2026-11-20');
  assert.equal(getLeadCollectedYmd(leadsToCheck[3]), null);

  const result = filterTodayLeads(leadsToCheck, now);
  assert.deepEqual(
    result.map((l) => l.id),
    ['L-BARE-TODAY', 'L-ISO-TODAY']
  );
});

test('getAgentTodayCallLogs strictly isolates Today logs per agent and sorts newest-first', () => {
  const now = new Date('2026-11-21T16:00:00+06:00'); // 2026-11-21 Asia/Dhaka
  const todayMorning = new Date('2026-11-21T09:15:00+06:00').toISOString();
  const todayAfternoon = new Date('2026-11-21T14:30:00+06:00').toISOString();
  const yesterdayIso = new Date('2026-11-20T18:00:00+06:00').toISOString();
  const followUpIso = new Date('2026-11-22T11:00:00+06:00').toISOString();

  const logs: CallLog[] = [
    {
      id: 'CL-YEST-A1',
      leadId: 'L-1',
      customerName: 'Yesterday Lead',
      phone: '01711000001',
      agentId: 'a1',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Interested',
      notes: 'From yesterday',
      followUpAt: null,
      timestamp: yesterdayIso,
    },
    {
      id: 'CL-TODAY-A2',
      leadId: 'L-2',
      customerName: 'Kathy Lead',
      phone: '01711000002',
      agentId: 'a2',
      agentName: 'Kathy',
      previousStatus: 'Pending',
      newStatus: 'Order Confirmed',
      notes: 'Other agent call today',
      followUpAt: null,
      timestamp: todayAfternoon,
    },
    {
      id: 'CL-TODAY-A1-EARLY',
      leadId: 'L-3',
      customerName: 'First Call Today',
      phone: '01711000003',
      agentId: 'a1',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Busy / Call Later',
      notes: 'Call back tomorrow',
      followUpAt: followUpIso,
      timestamp: todayMorning,
    },
    {
      id: 'CL-TODAY-A1-LATE',
      leadId: 'L-4',
      customerName: 'Second Call Today',
      phone: '01711000004',
      agentId: 'a1',
      agentName: 'Tanjin',
      previousStatus: 'Interested',
      newStatus: 'Order Confirmed',
      notes: 'Confirmed order',
      followUpAt: null,
      timestamp: todayAfternoon,
    },
    {
      id: 'CL-INVALID-TS',
      leadId: 'L-5',
      customerName: 'Bad Date Lead',
      phone: '01711000005',
      agentId: 'a1',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Pending',
      notes: '',
      followUpAt: null,
      timestamp: '',
    },
  ];

  const a1Today = getAgentTodayCallLogs(logs, 'a1', now);
  assert.deepEqual(
    a1Today.map((c) => c.id),
    ['CL-TODAY-A1-LATE', 'CL-TODAY-A1-EARLY']
  );
  assert.equal(a1Today.length, 2);

  const a2Today = getAgentTodayCallLogs(logs, 'a2', now);
  assert.deepEqual(
    a2Today.map((c) => c.id),
    ['CL-TODAY-A2']
  );

  // Fresh day with no calls returns 0 for agent a3
  assert.equal(getAgentTodayCallLogs(logs, 'a3', now).length, 0);
});

test('Done status is available in CALL_STATUSES and excludes leads from scheduled follow-ups', () => {
  assert.equal(CALL_STATUSES.includes('Done'), true);

  const leadsList: Lead[] = [
    {
      ...existingLeads[0],
      id: 'L-DONE',
      assignedAgentId: 'a1',
      status: 'Done',
      followUpAt: '2026-11-21T16:00:00.000Z',
    },
    {
      ...existingLeads[0],
      id: 'L-INT',
      assignedAgentId: 'a1',
      status: 'Interested',
      followUpAt: '2026-11-21T17:00:00.000Z',
    },
  ];

  const queue = getScheduledFollowUps(leadsList, 'a1');
  assert.deepEqual(
    queue.map((l) => l.id),
    ['L-INT']
  );
});

test('getActiveAgents, getNextRoundRobinAgent, and assignLeadsRoundRobin skip disabled agents cleanly', () => {
  const disabledIds = ['a3', 'a6']; // Tania and Sakib marked Absent/OFF
  const active = getActiveAgents(mockAgents, disabledIds);
  assert.deepEqual(
    active.map((a) => a.name),
    ['Tanjin', 'Kathy', 'Shanaz', 'Sizon']
  );

  assert.equal(getNextRoundRobinAgent(mockAgents, 0, disabledIds)?.name, 'Tanjin');
  assert.equal(getNextRoundRobinAgent(mockAgents, 2, disabledIds)?.name, 'Shanaz');
  assert.equal(getNextRoundRobinAgent(mockAgents, 4, disabledIds)?.name, 'Tanjin');

  const batch = Array.from({ length: 6 }, (_, i) => ({
    id: `SKIP-${i}`,
    customerName: `Customer ${i}`,
    phone: `0172000000${i}`,
    rawPhone: `0172000000${i}`,
    facebookLink: '',
    normalizedFacebookLink: '',
    notes: '',
    collectorId: 'collector-farhan',
    collectorName: 'Farhan',
    status: 'Pending' as const,
    followUpAt: null,
    lastCallNotes: '',
    createdAt: '2026-11-22T10:00:00.000Z',
    updatedAt: '2026-11-22T10:00:00.000Z',
  }));

  const { assignedLeads, nextIndex } = assignLeadsRoundRobin(
    batch,
    mockAgents,
    1,
    true,
    disabledIds
  );
  assert.deepEqual(
    assignedLeads.map((l) => l.assignedAgentName),
    ['Kathy', 'Shanaz', 'Sizon', 'Tanjin', 'Kathy', 'Shanaz']
  );
  assert.equal(
    assignedLeads.some((l) => l.assignedAgentName === 'Tania' || l.assignedAgentName === 'Sakib'),
    false
  );
  assert.equal(nextIndex, 3);
  assert.equal(getNextRoundRobinAgent(mockAgents, nextIndex, disabledIds)?.name, 'Sizon');

  // If all agents are disabled, leaves unassigned gracefully
  const allDisabled = mockAgents.map((a) => a.id);
  assert.equal(getNextRoundRobinAgent(mockAgents, 0, allDisabled), null);
  const unassigned = assignLeadsRoundRobin(batch.slice(0, 2), mockAgents, 0, true, allDisabled);
  assert.deepEqual(
    unassigned.assignedLeads.map((l) => l.assignedAgentName),
    [null, null]
  );
});

test('filterAgentAssignedQueueLeads excludes Done leads by default while keeping Done accessible when explicitly filtered', () => {
  const queueLeads: Lead[] = [
    { ...existingLeads[0], id: 'Q-PENDING', customerName: 'Rahim', phone: '01711111111', status: 'Pending', lastCallNotes: '' },
    { ...existingLeads[0], id: 'Q-INTERESTED', customerName: 'Karim', phone: '01722222222', status: 'Interested', lastCallNotes: 'Wants callback' },
    { ...existingLeads[0], id: 'Q-DONE-1', customerName: 'Salam', phone: '01733333333', status: 'Done', lastCallNotes: 'Completed' },
    { ...existingLeads[0], id: 'Q-CONFIRMED', customerName: 'Jabbar', phone: '01744444444', status: 'Order Confirmed', lastCallNotes: '' },
  ];

  // Default ALL filter removes Done leads automatically
  const defaultQueue = filterAgentAssignedQueueLeads(queueLeads, 'ALL', '');
  assert.deepEqual(
    defaultQueue.map((l) => l.id),
    ['Q-PENDING', 'Q-INTERESTED', 'Q-CONFIRMED']
  );

  // Search under ALL still excludes Done leads
  const searchUnderAll = filterAgentAssignedQueueLeads(queueLeads, 'ALL', 'Salam');
  assert.equal(searchUnderAll.length, 0);

  // Explicit Done filter displays Done leads cleanly
  const doneOnly = filterAgentAssignedQueueLeads(queueLeads, 'Done', '');
  assert.deepEqual(
    doneOnly.map((l) => l.id),
    ['Q-DONE-1']
  );

  // Explicit Interested filter narrows to Interested only
  const interestedOnly = filterAgentAssignedQueueLeads(queueLeads, 'Interested', 'callback');
  assert.deepEqual(
    interestedOnly.map((l) => l.id),
    ['Q-INTERESTED']
  );
});

test('1 phone / lead = max 1 Today call entry per day: deduplicateSameDayCallLogs, upsertTodayCallLogInList, and KPI metrics', () => {
  const now = new Date('2026-11-22T16:30:00+06:00'); // 2026-11-22 Asia/Dhaka
  const morningIso = new Date('2026-11-22T10:00:00+06:00').toISOString();
  const afternoonIso = new Date('2026-11-22T14:00:00+06:00').toISOString();
  const yesterdayIso = new Date('2026-11-21T15:00:00+06:00').toISOString();

  // Existing duplicate Today logs for the same phone (+880 1817-705593 vs 01817705593)
  // plus a valid call from Yesterday for the same number (different day must stay separate)
  const rawLogs: CallLog[] = [
    {
      id: 'CL-OLD-DUP',
      leadId: 'L-1817',
      customerName: 'Nadia Akter',
      phone: '+880 1817-705593',
      agentId: 'a1',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Interested',
      notes: 'First call today',
      followUpAt: null,
      timestamp: morningIso,
    },
    {
      id: 'CL-NEW-DUP',
      leadId: 'L-1817',
      customerName: 'Nadia Akter',
      phone: '01817705593',
      agentId: 'a1',
      agentName: 'Tanjin',
      previousStatus: 'Interested',
      newStatus: 'Done',
      notes: 'Second update same day',
      followUpAt: null,
      timestamp: afternoonIso,
    },
    {
      id: 'CL-YEST-SAME-PHONE',
      leadId: 'L-1817',
      customerName: 'Nadia Akter',
      phone: '01817705593',
      agentId: 'a1',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Busy / Call Later',
      notes: 'Called yesterday',
      followUpAt: null,
      timestamp: yesterdayIso,
    },
  ];

  // 1) Deduplication keeps newest entry per day (Today=1, Yesterday=1 -> total 2 across days)
  const dedupedAll = deduplicateSameDayCallLogs(rawLogs);
  assert.deepEqual(
    dedupedAll.map((c) => c.id),
    ['CL-NEW-DUP', 'CL-YEST-SAME-PHONE']
  );

  // 2) Today calls & Agent Today calls count as 1 unique call (keeping newest status Done)
  const todayCalls = filterTodayCallLogs(rawLogs, now);
  assert.deepEqual(
    todayCalls.map((c) => c.id),
    ['CL-NEW-DUP']
  );
  const agentTodayCalls = getAgentTodayCallLogs(rawLogs, 'a1', now);
  assert.equal(agentTodayCalls.length, 1);
  assert.equal(agentTodayCalls[0].newStatus, 'Done');

  // 3) Admin KPIs, Leaderboard, Daily CSV, and Final Daily Summary count 1 unique call Today
  const leadsForMetric: Lead[] = [
    {
      ...existingLeads[0],
      id: 'L-1817',
      customerName: 'Nadia Akter',
      phone: '01817705593',
      assignedAgentId: 'a1',
      assignedAgentName: 'Tanjin',
      status: 'Done',
      createdAt: morningIso,
      updatedAt: afternoonIso,
    },
  ];
  const metrics = computeDashboardMetrics(
    leadsForMetric,
    rawLogs,
    { preset: 'today', startDate: '', endDate: '' },
    now
  );
  assert.equal(metrics.callsMadeToday, 1);
  assert.equal(metrics.totalCallsInRange, 1);

  const perf = computeAgentPerformance(
    mockAgents,
    leadsForMetric,
    rawLogs,
    { preset: 'today', startDate: '', endDate: '' },
    now
  );
  assert.equal(perf.find((p) => p.agentId === 'a1')?.totalCalls, 1);

  const summary = computeFinalDailySummary(
    mockAgents,
    [],
    leadsForMetric,
    rawLogs,
    [],
    '2026-11-22'
  );
  const tanjinSummary = summary.agents.find((a) => a.agentId === 'a1');
  assert.equal(tanjinSummary?.callsMade, 1);
  assert.equal(tanjinSummary?.done, 1);
  assert.equal(tanjinSummary?.interested, 0);
  assert.equal(summary.agentTotals.callsMade, 1);

  const csv = generateDailyReportCsv(mockAgents, leadsForMetric, rawLogs, now);
  assert.ok(csv.includes('2026-11-22,Tanjin,1,'));
  assert.ok(csv.includes('2026-11-22,TOTAL,1,'));

  // 4) Upsert in place finds existing Today entry (even with 880/01 phone formatting difference)
  const existingToday = findExistingTodayCallLog(
    rawLogs,
    'a1',
    'Tanjin',
    'L-1817',
    '8801817705593',
    '2026-11-22'
  );
  assert.equal(existingToday?.id, 'CL-NEW-DUP');

  const eveningIso = new Date('2026-11-22T16:15:00+06:00').toISOString();
  const updatedList = upsertTodayCallLogInList(rawLogs, {
    id: existingToday!.id,
    leadId: 'L-1817',
    customerName: 'Nadia Akter',
    phone: '01817705593',
    agentId: 'a1',
    agentName: 'Tanjin',
    previousStatus: 'Pending',
    newStatus: 'Order Confirmed',
    notes: 'Confirmed in evening',
    followUpAt: null,
    timestamp: eveningIso,
  });
  // Only 1 Today row (collapsed older CL-OLD-DUP) + 1 Yesterday row
  assert.deepEqual(
    updatedList.map((c) => `${c.id}:${c.newStatus}`),
    ['CL-NEW-DUP:Order Confirmed', 'CL-YEST-SAME-PHONE:Busy / Call Later']
  );
});

test('getCopyablePhoneNumber returns clean 11-digit BD number and buildSafeExternalUrl validates external links', () => {
  assert.equal(getCopyablePhoneNumber('+880 1675-962466'), '01675962466');
  assert.equal(getCopyablePhoneNumber('8801711223344'), '01711223344');
  assert.equal(getCopyablePhoneNumber('1812345678'), '01812345678');

  assert.equal(
    buildSafeExternalUrl('facebook.com/rafiqul.islam'),
    'https://facebook.com/rafiqul.islam'
  );
  assert.equal(
    buildSafeExternalUrl('https://www.facebook.com/share/p/123'),
    'https://www.facebook.com/share/p/123'
  );
  assert.equal(buildSafeExternalUrl('javascript:alert(1)'), null);
  assert.equal(buildSafeExternalUrl('   '), null);
});

test('Asia/Dhaka (UTC+6) date formatting, zero double-shift on bare YYYY-MM-DD, clock-ahead clamp, and collector Today filter', () => {
  // 17:59:59Z = 23:59:59 Dhaka (still Nov 23); 18:00:00Z = 00:00:00 Dhaka (Nov 24)
  assert.equal(getDhakaDateString(new Date('2026-11-23T17:59:59.000Z')), '2026-11-23');
  assert.equal(getDhakaDateString(new Date('2026-11-23T18:00:00.000Z')), '2026-11-24');

  // Bare YYYY-MM-DD strings must format directly with zero UTC/local shift
  assert.equal(formatShortDate('2026-11-23'), 'Nov 23, 2026');
  assert.equal(formatDateTime('2026-11-23'), 'Nov 23, 2026');
  assert.equal(formatTime('2026-11-23'), '');

  // Timestamps format in Asia/Dhaka
  assert.equal(formatShortDate('2026-11-23T17:30:00.000Z'), 'Nov 23, 2026');
  assert.equal(formatShortDate('2026-11-23T18:30:00.000Z'), 'Nov 24, 2026');

  // Future-date clamp prevents ahead device clock from saving tomorrow's date
  const clampedFuture = clampDateToDhakaToday('2026-11-24T01:00:00+06:00', '2026-11-23');
  assert.equal(clampedFuture.ymd, '2026-11-23');
  assert.equal(clampedFuture.wasClamped, true);
  assert.equal(clampedFuture.originalYmd, '2026-11-24');

  const unclampedToday = clampDateToDhakaToday('2026-11-23T22:00:00+06:00', '2026-11-23');
  assert.equal(unclampedToday.ymd, '2026-11-23');
  assert.equal(unclampedToday.wasClamped, false);

  // Device clock-ahead detection against server clock
  const aheadResult = detectDeviceClockAhead(
    new Date('2026-11-24T02:00:00+06:00'),
    new Date('2026-11-23T23:55:00+06:00')
  );
  assert.equal(aheadResult.isAhead, true);
  assert.equal(aheadResult.dhakaTodayYmd, '2026-11-23');
  assert.equal(aheadResult.deviceYmd, '2026-11-24');

  const normalResult = detectDeviceClockAhead(
    new Date('2026-11-23T23:55:00+06:00'),
    new Date('2026-11-23T23:55:00+06:00')
  );
  assert.equal(normalResult.isAhead, false);

  // Follow-up helpers round-trip cleanly in Dhaka +06:00
  const followUpIso = buildDhakaFollowUpIso('2026-11-24', '14:30');
  assert.equal(followUpIso, '2026-11-24T08:30:00.000Z');
  assert.deepEqual(getDhakaFollowUpFields(followUpIso), { date: '2026-11-24', time: '14:30' });

  // Collector Today guard surfaces both Today (Nov 23) and previously mis-dated future leads (Nov 24), excluding Yesterday (Nov 22)
  const dhakaNow = new Date('2026-11-23T23:00:00+06:00');
  const collectorLeads: Lead[] = [
    { ...existingLeads[0], id: 'L-YEST', collectedDate: '2026-11-22', createdAt: '2026-11-22T10:00:00+06:00' },
    { ...existingLeads[0], id: 'L-TODAY', collectedDate: '2026-11-23', createdAt: '2026-11-23T22:50:00+06:00' },
    { ...existingLeads[0], id: 'L-FUTURE-MISDATED', collectedDate: '2026-11-24', createdAt: '2026-11-24T00:05:00+06:00' },
    { ...existingLeads[0], id: 'L-NO-DATE', collectedDate: undefined, date: undefined, createdAt: '' },
  ];
  assert.deepEqual(
    filterCollectorTodayLeads(collectorLeads, dhakaNow).map((l) => l.id),
    ['L-TODAY', 'L-FUTURE-MISDATED']
  );
});

test('VEHICLE_TYPES, normalizeVehicleType (Track -> Truck), and Bulk CSV Vehicle_Type header parsing work seamlessly', () => {
  assert.deepEqual(VEHICLE_TYPES, ['Car', 'Bike', 'Truck', 'Bus', 'Pickup Truck']);

  assert.equal(normalizeVehicleType('car'), 'Car');
  assert.equal(normalizeVehicleType('  BIKE '), 'Bike');
  assert.equal(normalizeVehicleType('Track'), 'Truck');
  assert.equal(normalizeVehicleType('track'), 'Truck');
  assert.equal(normalizeVehicleType('truck'), 'Truck');
  assert.equal(normalizeVehicleType('bus'), 'Bus');
  assert.equal(normalizeVehicleType('pickup'), 'Pickup Truck');
  assert.equal(normalizeVehicleType('Pick up   truck'), 'Pickup Truck');
  assert.equal(normalizeVehicleType('Rafiqul Islam'), 'Rafiqul Islam');
  assert.equal(normalizeVehicleType('   '), '');

  const csv = [
    'Vehicle_Type,Phone,Facebook_Link',
    'car,+8801812345678,https://facebook.com/car.owner',
    'Track,01912345678,https://facebook.com/truck.owner',
    'pickup truck,01612345678,https://facebook.com/pickup.owner',
    ',01799887766,https://facebook.com/missing.vehicle',
  ].join('\n');

  const preview = parseCsvLeads(csv, existingLeads);
  assert.equal(preview.length, 4);
  assert.equal(preview[0].status, 'valid');
  assert.equal(preview[0].customerName, 'Car');
  assert.equal(preview[1].status, 'valid');
  assert.equal(preview[1].customerName, 'Truck');
  assert.equal(preview[2].status, 'valid');
  assert.equal(preview[2].customerName, 'Pickup Truck');
  assert.equal(preview[3].status, 'invalid');
});




