import test from 'node:test';
import assert from 'node:assert/strict';
import { attemptNativePrint, buildFinalDailySummaryPdfDoc } from './dailySummaryPdf';
import { computeFinalDailySummary } from './leadLogic';
import { CallLog, ContentPost, Lead, User } from '../types';

const mockAgents: User[] = [
  { id: 'agent-tanjin', name: 'Tanjin', email: 'tazin@runbd', password: '123', role: 'agent', title: 'Agent', avatarInitials: 'TJ' },
  { id: 'agent-kathy', name: 'Kathy', email: 'kathy@runbd', password: '123', role: 'agent', title: 'Agent', avatarInitials: 'KT' },
];

const mockCollectors: User[] = [
  { id: 'collector-farhan', name: 'Farhan', email: 'farhan@runbd', password: '123', role: 'collector', title: 'Collector', avatarInitials: 'FR' },
  { id: 'collector-naim', name: 'Naim', email: 'naim@runbd', password: '123', role: 'collector', title: 'Collector', avatarInitials: 'NM' },
];

test('buildFinalDailySummaryPdfDoc builds a valid PDF with Today-only summary and activity rows', () => {
  const targetDate = '2026-11-22';
  const todayIso = '2026-11-22T10:15:00.000Z';

  const leads: Lead[] = [
    {
      id: 'L-TODAY',
      customerName: 'Today Customer',
      phone: '01711223344',
      rawPhone: '01711223344',
      facebookLink: 'https://facebook.com/today.cust',
      normalizedFacebookLink: 'facebook.com/today.cust',
      notes: 'Today lead note',
      collectorId: 'collector-farhan',
      collectorName: 'Farhan',
      assignedAgentId: 'agent-tanjin',
      assignedAgentName: 'Tanjin',
      status: 'Order Confirmed',
      followUpAt: null,
      lastCallNotes: 'Closed today',
      collectedDate: targetDate,
      createdAt: todayIso,
      updatedAt: todayIso,
    },
  ];

  const calls: CallLog[] = [
    {
      id: 'CL-TODAY',
      leadId: 'L-TODAY',
      customerName: 'Today Customer',
      phone: '01711223344',
      agentId: 'agent-tanjin',
      agentName: 'Tanjin',
      previousStatus: 'Pending',
      newStatus: 'Order Confirmed',
      notes: 'Closed today',
      followUpAt: null,
      timestamp: todayIso,
    },
  ];

  const posts: ContentPost[] = [
    {
      id: 'P-TODAY',
      facebookLink: 'https://facebook.com/runbd/posts/today',
      normalizedFacebookLink: 'facebook.com/runbd/posts/today',
      websiteLink: 'https://runbd.com/today',
      normalizedWebsiteLink: 'runbd.com/today',
      note: 'Today Campaign',
      posterId: 'poster-kawsar',
      posterName: 'Kawsar',
      createdAt: todayIso,
    },
  ];

  const summary = computeFinalDailySummary(
    mockAgents,
    mockCollectors,
    leads,
    calls,
    posts,
    targetDate
  );

  const { doc, filename } = buildFinalDailySummaryPdfDoc(summary, calls, leads, posts);
  assert.equal(filename, 'RunBD_Final_Daily_Summary_2026-11-22.pdf');

  const pdfBytes = doc.output('arraybuffer');
  assert.ok(pdfBytes.byteLength > 1000, 'Generated PDF should contain non-empty document bytes');
});

test('attemptNativePrint detects iframe sandbox blocking when beforeprint does not fire', () => {
  const listeners = new Map<string, Array<() => void>>();
  const fakeSandboxWindow = {
    self: {},
    top: {},
    addEventListener(evt: string, fn: () => void) {
      listeners.set(evt, [...(listeners.get(evt) ?? []), fn]);
    },
    removeEventListener(evt: string, fn: () => void) {
      listeners.set(
        evt,
        (listeners.get(evt) ?? []).filter((f) => f !== fn)
      );
    },
    print() {
      // Simulates Chrome sandbox ignoring window.print() without firing beforeprint
    },
  } as unknown as Window;

  const blockedRes = attemptNativePrint(fakeSandboxWindow);
  assert.equal(blockedRes.inIframe, true);
  assert.equal(blockedRes.nativePrintTriggered, false);

  const selfRef = {};
  const fakeTopWindow = {
    self: selfRef,
    top: selfRef,
    addEventListener(evt: string, fn: () => void) {
      listeners.set(evt, [...(listeners.get(evt) ?? []), fn]);
    },
    removeEventListener(evt: string, fn: () => void) {
      listeners.set(
        evt,
        (listeners.get(evt) ?? []).filter((f) => f !== fn)
      );
    },
    print() {
      for (const fn of listeners.get('beforeprint') ?? []) {
        fn();
      }
    },
  } as unknown as Window;

  const allowedRes = attemptNativePrint(fakeTopWindow);
  assert.equal(allowedRes.inIframe, false);
  assert.equal(allowedRes.nativePrintTriggered, true);
});
