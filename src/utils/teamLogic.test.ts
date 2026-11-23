import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_USERS } from '../data/seedData';
import type { Lead, User } from '../types/index.ts';
import { assignLeadsRoundRobin, computeFinalDailySummary } from './leadLogic';
import { hashPasswordWithSalt, verifyScryptPassword } from '../server/teamUsers';
import {
  buildAvatarInitials,
  buildUniqueMemberId,
  defaultTitleForRole,
  getActiveTeamMembers,
  getCallCenterAgents,
  getContentPosters,
  getDataCollectors,
  mergeTeamMembersWithFallback,
  stripUserPassword,
  validateNewTeamMemberInput,
  validatePasswordResetInput,
} from './teamLogic';

test('buildAvatarInitials generates clean 2-letter initials', () => {
  assert.equal(buildAvatarInitials('Rakib'), 'RA');
  assert.equal(buildAvatarInitials('Jahid Islam'), 'JI');
  assert.equal(buildAvatarInitials('  Mehedi   Hasan  '), 'MH');
  assert.equal(buildAvatarInitials('   '), 'RB');
});

test('buildUniqueMemberId prevents collisions with incrementing suffix', () => {
  const existing = new Set(['agent-rakib', 'agent-rakib-2']);
  assert.equal(buildUniqueMemberId('Rakib', 'agent', new Set()), 'agent-rakib');
  assert.equal(buildUniqueMemberId('Rakib', 'agent', existing), 'agent-rakib-3');
  assert.equal(buildUniqueMemberId('Mehedi Hasan', 'collector', new Set()), 'collector-mehedi-hasan');
});

test('validateNewTeamMemberInput validates fields, uniqueness, and role bounds', () => {
  const existing = [{ email: 'tazin@runbd' }, { email: 'farhan@runbd' }];

  const valid = validateNewTeamMemberInput(
    {
      name: '  Rakib  ',
      email: '  RAKIB@RUNBD ',
      role: 'agent',
      password: 'secret123',
    },
    existing
  );
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.normalized.name, 'Rakib');
    assert.equal(valid.normalized.email, 'rakib@runbd');
    assert.equal(valid.normalized.role, 'agent');
    assert.equal(valid.normalized.title, defaultTitleForRole('agent'));
  }

  const dup = validateNewTeamMemberInput(
    { name: 'Tazin Duplicate', email: 'TAZIN@runbd', role: 'agent', password: 'secret123' },
    existing
  );
  assert.equal(dup.ok, false);

  const shortPw = validateNewTeamMemberInput(
    { name: 'Rakib', email: 'rakib@runbd', role: 'agent', password: '123' },
    existing
  );
  assert.equal(shortPw.ok, false);

  const badSpaces = validateNewTeamMemberInput(
    { name: 'Rakib', email: 'rakib runbd', role: 'collector', password: 'secret123' },
    existing
  );
  assert.equal(badSpaces.ok, false);

  const adminRoleAttempt = validateNewTeamMemberInput(
    { name: 'New Admin', email: 'newadmin@runbd', role: 'admin', password: 'secret123' },
    existing
  );
  assert.equal(adminRoleAttempt.ok, false);

  assert.equal(validatePasswordResetInput('12345').ok, false);
  assert.equal(validatePasswordResetInput('123456').ok, true);
});

test('stripUserPassword removes sensitive password while preserving active status', () => {
  const sanitized = stripUserPassword({
    id: 'agent-rakib',
    name: 'Rakib',
    email: 'rakib@runbd',
    password: 'do-not-leak-this',
    role: 'agent',
    title: 'Call Center Agent',
    avatarInitials: 'RA',
    isActive: false,
  });
  assert.equal(sanitized.password, '');
  assert.equal(sanitized.isActive, false);
});

test('role selectors exclude deactivated members by default and include when requested', () => {
  const roster: User[] = [
    ...DEMO_USERS.map((u) => stripUserPassword(u)),
    {
      id: 'agent-rakib',
      name: 'Rakib',
      email: 'rakib@runbd',
      password: '',
      role: 'agent',
      title: 'Call Center Agent',
      avatarInitials: 'RA',
      isActive: true,
    },
    {
      id: 'collector-mehedi',
      name: 'Mehedi',
      email: 'mehedi@runbd',
      password: '',
      role: 'collector',
      title: 'Data Collector',
      avatarInitials: 'ME',
      isActive: false,
    },
  ];

  assert.equal(getCallCenterAgents(roster).some((a) => a.id === 'agent-rakib'), true);
  assert.equal(getCallCenterAgents(roster).length, 7);
  assert.equal(getDataCollectors(roster).length, 2);
  assert.equal(getDataCollectors(roster, { includeInactive: true }).length, 3);
  assert.equal(getContentPosters(roster).length, 1);
  assert.equal(getActiveTeamMembers(roster).some((u) => u.id === 'collector-mehedi'), false);
});

test('server scrypt password hashing uses random salts and constant-time verification', () => {
  const first = hashPasswordWithSalt('rakib@2026');
  const second = hashPasswordWithSalt('rakib@2026');

  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(verifyScryptPassword('rakib@2026', first.salt, first.hash), true);
  assert.equal(verifyScryptPassword('wrong-password', first.salt, first.hash), false);
  assert.equal(verifyScryptPassword('rakib@2026', second.salt, first.hash), false);
});

test('dynamic Round-Robin & Final Daily Summary incorporate newly added team members', () => {
  const dynamicAgents: User[] = [
    ...DEMO_USERS.filter((u) => u.role === 'agent').map(stripUserPassword),
    {
      id: 'agent-rakib',
      name: 'Rakib',
      email: 'rakib@runbd',
      password: '',
      role: 'agent',
      title: 'Call Center Agent',
      avatarInitials: 'RA',
      isActive: true,
    },
  ];
  const dynamicCollectors: User[] = [
    ...DEMO_USERS.filter((u) => u.role === 'collector').map(stripUserPassword),
    {
      id: 'collector-mehedi',
      name: 'Mehedi',
      email: 'mehedi@runbd',
      password: '',
      role: 'collector',
      title: 'Data Collector',
      avatarInitials: 'ME',
      isActive: true,
    },
  ];

  const todayIso = new Date().toISOString();
  const baseLeads: Array<Omit<Lead, 'assignedAgentId' | 'assignedAgentName'>> = Array.from(
    { length: 7 },
    (_, idx) => ({
      id: `RBD-${idx + 1}`,
      customerName: `Customer ${idx + 1}`,
      phone: `+880171100000${idx}`,
      rawPhone: `0171100000${idx}`,
      facebookLink: '',
      normalizedFacebookLink: '',
      notes: '',
      collectorId: 'collector-mehedi',
      collectorName: 'Mehedi',
      status: 'Pending',
      followUpAt: null,
      lastCallNotes: '',
      createdAt: todayIso,
      updatedAt: todayIso,
    })
  );

  const { assignedLeads } = assignLeadsRoundRobin(baseLeads, dynamicAgents, 0, true, []);
  assert.equal(assignedLeads.some((l) => l.assignedAgentName === 'Rakib'), true);

  const summary = computeFinalDailySummary(
    dynamicAgents,
    dynamicCollectors,
    assignedLeads,
    [],
    []
  );
  assert.equal(summary.agents.some((r) => r.agentName === 'Rakib'), true);
  const mehediRow = summary.collectors.find((r) => r.collectorName === 'Mehedi');
  assert.equal(mehediRow?.leadsCollectedOnDate, 7);

  const mergedFallback = mergeTeamMembersWithFallback([], DEMO_USERS);
  assert.equal(mergedFallback.length, DEMO_USERS.length);
  assert.equal(mergedFallback.every((m) => m.password === ''), true);
});
