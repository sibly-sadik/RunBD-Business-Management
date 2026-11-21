import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callLogToSupabaseRow,
  contentPostToSupabaseRow,
  isSchemaMissingError,
  leadToSupabaseRow,
  paidCustomerToSupabaseRow,
  rowToCallLog,
  rowToContentPost,
  rowToLead,
  rowToPaidCustomer,
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
    notes: 'Order confirmed',
    createdAt: '2026-11-21T10:20:00.000Z',
    updatedAt: '2026-11-21T10:20:00.000Z',
  };

  const paidRow = paidCustomerToSupabaseRow(paid, 'https://facebook.com/mahmud.hasan');
  assert.equal(paidRow.renewal_date, '2026-12-21');
  assert.equal(paidRow.renewal_status, 'Active');

  const parsedPaid = rowToPaidCustomer(paidRow);
  assert.equal(parsedPaid.renewalDate, '2026-12-21');
  assert.equal(parsedPaid.assignedAgentName, 'Tanjin');
});

test('Supabase Kawsar post mapper normalizes Facebook and Website links and detects schema errors', () => {
  const post: ContentPost = {
    id: 'PST-1',
    facebookLink: 'https://www.facebook.com/runbd/posts/991?ref=share',
    normalizedFacebookLink: '',
    websiteLink: 'https://runbd.com/offer/?utm_source=fb',
    normalizedWebsiteLink: '',
    note: 'Promo campaign',
    posterId: 'poster-kawsar',
    posterName: 'Kawsar',
    createdAt: '2026-11-21T08:30:00.000Z',
  };

  const row = contentPostToSupabaseRow(post);
  assert.equal(row.facebook_normalized, 'facebook.com/runbd/posts/991');
  assert.equal(row.website_normalized, 'runbd.com/offer');

  const parsed = rowToContentPost(row);
  assert.equal(parsed.note, 'Promo campaign');
  assert.equal(parsed.normalizedWebsiteLink, 'runbd.com/offer');

  assert.equal(isSchemaMissingError({ code: '42P01', message: 'relation "public.leads" does not exist' }), true);
  assert.equal(isSchemaMissingError({ code: 'PGRST205', message: "Could not find the table 'public.leads' in the schema cache" }), true);
  assert.equal(isSchemaMissingError({ code: '23505', message: 'duplicate key value' }), false);
});
