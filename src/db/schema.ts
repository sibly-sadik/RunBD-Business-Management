import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  role: text('role').notNull().default('collector'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const leads = pgTable(
  'leads',
  {
    id: text('id').primaryKey(),
    customerName: text('customer_name').notNull(),
    phone: text('phone').notNull(),
    rawPhone: text('raw_phone').notNull().default(''),
    phoneNormalized: text('phone_normalized').notNull(),
    facebookLink: text('facebook_link').notNull().default(''),
    facebookNormalized: text('facebook_normalized').notNull().default(''),
    notes: text('notes').notNull().default(''),
    collectorId: text('collector_id').notNull(),
    collectorName: text('collector_name').notNull(),
    assignedAgentId: text('assigned_agent_id'),
    assignedAgentName: text('assigned_agent_name'),
    status: text('status').notNull().default('Pending'),
    followUpAt: text('follow_up_at'),
    lastCallNotes: text('last_call_notes').notNull().default(''),
    collectedDate: text('collected_date').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('leads_phone_normalized_idx').on(table.phoneNormalized),
    index('leads_facebook_normalized_idx').on(table.facebookNormalized),
    index('leads_collected_date_idx').on(table.collectedDate),
    index('leads_assigned_agent_name_idx').on(table.assignedAgentName),
  ]
);

export const callLogs = pgTable(
  'call_logs',
  {
    id: text('id').primaryKey(),
    leadId: text('lead_id').notNull(),
    customerName: text('customer_name').notNull(),
    phone: text('phone').notNull(),
    agentId: text('agent_id').notNull(),
    agentName: text('agent_name').notNull(),
    previousStatus: text('previous_status').notNull(),
    newStatus: text('new_status').notNull(),
    notes: text('notes').notNull().default(''),
    followUpAt: text('follow_up_at'),
    callDate: text('call_date').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('call_logs_date_agent_idx').on(table.callDate, table.agentName),
    index('call_logs_date_agent_id_idx').on(table.callDate, table.agentId),
  ]
);

export const paidCustomers = pgTable(
  'paid_customers',
  {
    id: text('id').primaryKey(),
    leadId: text('lead_id').notNull(),
    customerName: text('customer_name').notNull(),
    phone: text('phone').notNull(),
    facebookLink: text('facebook_link').notNull().default(''),
    assignedAgentId: text('assigned_agent_id'),
    assignedAgentName: text('assigned_agent_name'),
    confirmedDate: text('confirmed_date').notNull(),
    renewalDate: text('renewal_date').notNull(),
    renewalStatus: text('renewal_status').notNull().default('Active'),
    lastRenewedAt: text('last_renewed_at'),
    packageName: text('package_name').notNull().default(''),
    notes: text('notes').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('paid_customers_renewal_date_idx').on(table.renewalDate),
    index('paid_customers_lead_id_idx').on(table.leadId),
  ]
);

export const kawsarPosts = pgTable(
  'kawsar_posts',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull().default(''),
    facebookLink: text('facebook_link').notNull().default(''),
    facebookNormalized: text('facebook_normalized').notNull().default(''),
    websiteLink: text('website_link').notNull().default(''),
    websiteNormalized: text('website_normalized').notNull().default(''),
    tiktokLink: text('tiktok_link').notNull().default(''),
    tiktokNormalized: text('tiktok_normalized').notNull().default(''),
    instagramLink: text('instagram_link').notNull().default(''),
    instagramNormalized: text('instagram_normalized').notNull().default(''),
    twitterLink: text('twitter_link').notNull().default(''),
    twitterNormalized: text('twitter_normalized').notNull().default(''),
    posterId: text('poster_id').notNull(),
    posterName: text('poster_name').notNull(),
    postedDate: text('posted_date').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('kawsar_posts_facebook_normalized_idx').on(table.facebookNormalized),
    index('kawsar_posts_website_normalized_idx').on(table.websiteNormalized),
    index('kawsar_posts_tiktok_normalized_idx').on(table.tiktokNormalized),
    index('kawsar_posts_instagram_normalized_idx').on(table.instagramNormalized),
    index('kawsar_posts_twitter_normalized_idx').on(table.twitterNormalized),
    index('kawsar_posts_posted_date_idx').on(table.postedDate),
  ]
);

export const duplicateAttempts = pgTable(
  'duplicate_attempts',
  {
    id: text('id').primaryKey(),
    collectorId: text('collector_id').notNull(),
    collectorName: text('collector_name').notNull(),
    attemptedName: text('attempted_name').notNull().default(''),
    attemptedPhone: text('attempted_phone').notNull().default(''),
    attemptedFb: text('attempted_fb').notNull().default(''),
    matchedBy: text('matched_by').notNull().default('phone'),
    existingLeadId: text('existing_lead_id').notNull().default(''),
    existingCollectorName: text('existing_collector_name').notNull().default(''),
    existingDate: text('existing_date').notNull().default(''),
    attemptDate: text('attempt_date').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('duplicate_attempts_date_idx').on(table.attemptDate)]
);

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').notNull(),
  actorName: text('actor_name').notNull(),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  details: text('details').notNull(),
  createdAt: text('created_at').notNull(),
});

export const appSettings = pgTable('app_settings', {
  id: text('id').primaryKey(),
  autoAssignEnabled: boolean('auto_assign_enabled').notNull().default(true),
  roundRobinIndex: integer('round_robin_index').notNull().default(0),
  googleSheetsWebhookUrl: text('google_sheets_webhook_url').notNull().default(''),
  callScript: text('call_script').notNull().default(''),
  lastSyncedAt: text('last_synced_at'),
  updatedAt: text('updated_at').notNull(),
});
