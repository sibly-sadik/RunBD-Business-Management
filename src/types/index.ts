export type UserRole = 'admin' | 'agent' | 'collector' | 'poster';

export type CallStatus =
  | 'Pending'
  | 'Done'
  | 'Interested'
  | 'Order Confirmed'
  | 'Busy / Call Later'
  | 'Not Interested'
  | 'Switched Off / No Answer'
  | 'Wrong Number';

export const CALL_STATUSES: CallStatus[] = [
  'Pending',
  'Done',
  'Interested',
  'Order Confirmed',
  'Busy / Call Later',
  'Not Interested',
  'Switched Off / No Answer',
  'Wrong Number',
];

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  title: string;
  avatarInitials: string;
}

export interface Lead {
  id: string;
  customerName: string;
  phone: string; // Normalized canonical 01XXXXXXXXX
  rawPhone: string;
  facebookLink: string;
  normalizedFacebookLink: string;
  notes: string;
  collectorId: string;
  collectorName: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  status: CallStatus;
  followUpAt: string | null; // ISO string
  lastCallNotes: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  collectedDate?: string; // Optional YYYY-MM-DD stored collection date
  date?: string; // Optional YYYY-MM-DD legacy stored date
}

export interface CallLog {
  id: string;
  leadId: string;
  customerName: string;
  phone: string;
  agentId: string;
  agentName: string;
  previousStatus: CallStatus;
  newStatus: CallStatus;
  notes: string;
  followUpAt: string | null;
  timestamp: string; // ISO string
}

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LEAD_CREATED'
  | 'BULK_IMPORT'
  | 'STATUS_UPDATED'
  | 'LEAD_REASSIGNED'
  | 'SETTINGS_UPDATED'
  | 'SHEETS_SYNCED'
  | 'POST_LINK_LOGGED'
  | 'PAID_CUSTOMER_ADDED'
  | 'PAID_CUSTOMER_RENEWED';

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: AuditAction;
  details: string;
  timestamp: string; // ISO string
}

export interface DuplicateAttempt {
  id: string;
  collectorId: string;
  collectorName: string;
  attemptedName: string;
  attemptedPhone: string;
  attemptedFacebook: string;
  matchedBy: 'phone' | 'facebook';
  existingCollectorName: string;
  existingDate: string;
  timestamp: string;
}

export interface AppSettings {
  autoAssignEnabled: boolean;
  roundRobinIndex: number;
  disabledAgentIds: string[];
  googleSheetsWebhookUrl: string;
  callScript: string;
  lastSyncedAt: string | null;
}

export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'error';

export type DateRangePreset = 'today' | 'week' | 'month' | 'all' | 'custom';

export interface DateRangeFilter {
  preset: DateRangePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

export interface CsvPreviewRow {
  rowNumber: number;
  customerName: string;
  rawPhone: string;
  normalizedPhone: string | null;
  facebookLink: string;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
}

export interface AgentPerformanceMetric {
  agentId: string;
  agentName: string;
  assignedLeads: number;
  totalCalls: number;
  orderConfirmed: number;
  interested: number;
  conversions: number; // Order Confirmed + Interested
  successRate: number; // % of totalCalls or assignedLeads
}

export interface CollectorStat {
  collectorId: string;
  collectorName: string;
  todayCount: number;
  totalCount: number;
  duplicateBlockedCount: number;
}

export interface ContentPost {
  id: string;
  facebookLink: string;
  normalizedFacebookLink: string;
  websiteLink: string;
  normalizedWebsiteLink: string;
  note: string;
  posterId: string;
  posterName: string;
  createdAt: string; // ISO string
}

export type RenewalStatus = 'Active' | 'Renewed' | 'Expired';

export const RENEWAL_STATUSES: RenewalStatus[] = ['Active', 'Renewed', 'Expired'];

export interface PaidCustomer {
  id: string;
  leadId: string;
  customerName: string;
  phone: string; // Normalized canonical 01XXXXXXXXX
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  confirmedDate: string; // YYYY-MM-DD
  renewalDate: string; // YYYY-MM-DD (Confirmed Date + 30 days)
  renewalStatus: RenewalStatus;
  lastRenewedAt: string | null;
  notes: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}
