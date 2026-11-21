import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignLeadsRoundRobin,
  authenticateUser,
  buildTelUrl,
  buildWhatsAppUrl,
  computeAgentPerformance,
  computeDashboardMetrics,
  computeFinalDailySummary,
  computeKawsarPostStats,
  findDuplicateLead,
  findDuplicatePost,
  generateDailyReportCsv,
  generateFinalDailySummaryCsv,
  getScheduledFollowUps,
  isValidPostUrl,
  normalizeBdPhone,
  normalizeFacebookUrl,
  normalizePostUrl,
  parseCsvLeads,
} from './leadLogic';
import { DEMO_USERS } from '../data/seedData';
import { CallLog, ContentPost, Lead, User } from '../types';

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
  assert.ok(buildWhatsAppUrl('+8801711223344', 'Karim').startsWith('https://wa.me/8801711223344?text='));
});

test('authenticateUser verifies exact credentials for Admin, 6 Call Center Agents, and 2 Data Collectors (Farhan & Naim)', () => {
  const validPairs: Array<[string, string, string, string]> = [
    ['admin@runbd', 'admin@/#312', 'admin', 'Jahid Islam'],
    ['tazin@runbd', 'tazin@/#312', 'agent', 'Tanjin'],
    ['kathy@runbd', 'kathy@/#312', 'agent', 'Kathy'],
    ['tania@runbd', 'tania@/#312', 'agent', 'Tania'],
    ['shanaz@runbd', 'shanaz@/#312', 'agent', 'Shanaz'],
    ['sizon@runbd', 'sizon@/#312', 'agent', 'Sizon'],
    ['sakib@runbd', 'sakib@/#312', 'agent', 'Sakib'],
    ['farhan@runbd', 'farhan@/#312', 'collector', 'Farhan'],
    ['naim@runbd', 'naim@/#312', 'collector', 'Naim'],
    ['kawsar@runbd', 'kawsar@/#312', 'poster', 'Kawsar'],
  ];

  for (const [username, password, expectedRole, expectedName] of validPairs) {
    const user = authenticateUser(DEMO_USERS, username, password);
    assert.ok(user, `Expected valid login for ${username}`);
    assert.equal(user.role, expectedRole);
    assert.equal(user.name, expectedName);
  }

  // Case-insensitive username, case-sensitive exact password
  assert.equal(authenticateUser(DEMO_USERS, 'TAZIN@RUNBD', 'tazin@/#312')?.name, 'Tanjin');
  assert.equal(authenticateUser(DEMO_USERS, 'tazin@runbd', 'Tazin@/#312'), null);
  // Cross-agent password rejected
  assert.equal(authenticateUser(DEMO_USERS, 'tazin@runbd', 'kathy@/#312'), null);
  // Old generic collector rejected
  assert.equal(authenticateUser(DEMO_USERS, 'collector@runbd', 'collector@/#312'), null);
  // Old password rejected
  assert.equal(authenticateUser(DEMO_USERS, 'admin@runbd', 'password123'), null);
});

test('generateDailyReportCsv compiles daily calls, successful orders, and follow-ups for all 6 agents plus TOTAL', () => {
  const reportDate = new Date(2026, 10, 17, 15, 0, 0); // Nov 17, 2026 local
  const todayIso = new Date(2026, 10, 17, 11, 30, 0).toISOString();
  const followUpIso = new Date(2026, 10, 17, 16, 0, 0).toISOString();
  const yesterdayIso = new Date(2026, 10, 16, 11, 30, 0).toISOString();

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

  const now = new Date(2026, 10, 18, 12, 0, 0);
  const todayIso = new Date(2026, 10, 18, 9, 30, 0).toISOString();
  const yesterdayIso = new Date(2026, 10, 17, 9, 30, 0).toISOString();

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
  const targetIso = new Date(2026, 10, 18, 10, 0, 0).toISOString();
  const otherDayIso = new Date(2026, 10, 17, 10, 0, 0).toISOString();

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
  assert.equal(summary.agentTotals.callsMade, 2);
  assert.equal(summary.agentTotals.orderConfirmed, 1);
  assert.equal(summary.collectors[0].leadsCollectedOnDate, 1); // Farhan on targetDate
  assert.equal(summary.collectors[1].leadsCollectedOnDate, 1); // Naim on targetDate
  assert.equal(summary.totalCollectedOnDate, 2);
  assert.equal(summary.kawsar.facebookLinks, 1);
  assert.equal(summary.kawsar.websiteLinks, 2);

  const csv = generateFinalDailySummaryCsv(summary);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('CALL CENTER AGENTS PERFORMANCE'));
  assert.ok(csv.includes('DATA COLLECTORS HISTORY'));
  assert.ok(csv.includes('CONTENT & LINK POSTER (KAWSAR)'));
  assert.ok(csv.includes('Kawsar,2,1,2'));
});


