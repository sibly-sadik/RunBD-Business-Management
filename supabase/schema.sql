-- RunBD Business Management Application - Supabase (PostgreSQL) Schema
-- Idempotent migration: safe to run multiple times in Supabase SQL Editor.

-- 1. Leads table (Master Leads Ledger + B-tree indexes for <100ms duplicate guard)
CREATE TABLE IF NOT EXISTS public.leads (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  raw_phone TEXT NOT NULL DEFAULT '',
  phone_normalized TEXT NOT NULL DEFAULT '',
  facebook_link TEXT NOT NULL DEFAULT '',
  facebook_normalized TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  collector_id TEXT NOT NULL DEFAULT '',
  collector_name TEXT NOT NULL DEFAULT '',
  assigned_agent_id TEXT,
  assigned_agent_name TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  follow_up_at TEXT,
  last_call_notes TEXT NOT NULL DEFAULT '',
  collected_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_phone_normalized ON public.leads (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_facebook_normalized ON public.leads (facebook_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_collected_date ON public.leads (collected_date);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_agent_name ON public.leads (assigned_agent_name);

-- 2. Call Logs table (Agent Calls + Today calls sidebar & KPI counts)
CREATE TABLE IF NOT EXISTS public.call_logs (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  agent_id TEXT NOT NULL DEFAULT '',
  agent_name TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  follow_up_at TEXT,
  call_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_call_logs_date_agent ON public.call_logs (call_date, agent_name);

-- 3. Paid Customers table (Auto-created on Order Confirmed + 30-day renewal tracking)
CREATE TABLE IF NOT EXISTS public.paid_customers (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  facebook_link TEXT NOT NULL DEFAULT '',
  assigned_agent_id TEXT,
  assigned_agent_name TEXT,
  confirmed_date TEXT NOT NULL,
  renewal_date TEXT NOT NULL,
  renewal_status TEXT NOT NULL DEFAULT 'Active',
  last_renewed_at TEXT,
  package_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

ALTER TABLE public.paid_customers
  ADD COLUMN IF NOT EXISTS package_name TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_paid_customers_renewal_date ON public.paid_customers (renewal_date);

-- 4. Kawsar Posts table (Content & Link Poster + B-tree indexes for duplicate link guard)
CREATE TABLE IF NOT EXISTS public.kawsar_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  facebook_link TEXT NOT NULL DEFAULT '',
  facebook_normalized TEXT NOT NULL DEFAULT '',
  website_link TEXT NOT NULL DEFAULT '',
  website_normalized TEXT NOT NULL DEFAULT '',
  tiktok_link TEXT NOT NULL DEFAULT '',
  tiktok_normalized TEXT NOT NULL DEFAULT '',
  instagram_link TEXT NOT NULL DEFAULT '',
  instagram_normalized TEXT NOT NULL DEFAULT '',
  twitter_link TEXT NOT NULL DEFAULT '',
  twitter_normalized TEXT NOT NULL DEFAULT '',
  poster_id TEXT NOT NULL DEFAULT 'poster-kawsar',
  poster_name TEXT NOT NULL DEFAULT 'Kawsar',
  posted_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE public.kawsar_posts
  ADD COLUMN IF NOT EXISTS tiktok_link TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tiktok_normalized TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS instagram_link TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS instagram_normalized TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS twitter_link TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS twitter_normalized TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_kawsar_posts_fb_norm ON public.kawsar_posts (facebook_normalized);
CREATE INDEX IF NOT EXISTS idx_kawsar_posts_web_norm ON public.kawsar_posts (website_normalized);
CREATE INDEX IF NOT EXISTS idx_kawsar_posts_tiktok_norm ON public.kawsar_posts (tiktok_normalized);
CREATE INDEX IF NOT EXISTS idx_kawsar_posts_ig_norm ON public.kawsar_posts (instagram_normalized);
CREATE INDEX IF NOT EXISTS idx_kawsar_posts_tw_norm ON public.kawsar_posts (twitter_normalized);
CREATE INDEX IF NOT EXISTS idx_kawsar_posts_posted_date ON public.kawsar_posts (posted_date);

-- 5. Duplicate Attempts table (Blocked Duplicates Today & Audit)
CREATE TABLE IF NOT EXISTS public.duplicate_attempts (
  id TEXT PRIMARY KEY,
  attempted_phone TEXT NOT NULL DEFAULT '',
  attempted_fb TEXT NOT NULL DEFAULT '',
  attempted_name TEXT NOT NULL DEFAULT '',
  collector_id TEXT NOT NULL DEFAULT '',
  collector_name TEXT NOT NULL DEFAULT '',
  matched_by TEXT NOT NULL DEFAULT 'phone',
  existing_lead_id TEXT NOT NULL DEFAULT '',
  existing_collector_name TEXT NOT NULL DEFAULT '',
  existing_date TEXT NOT NULL DEFAULT '',
  attempt_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_duplicate_attempts_attempt_date ON public.duplicate_attempts (attempt_date);

-- 6. Audit Logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL DEFAULT 'admin',
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- 7. App Settings table (Round-Robin pointer, Disabled Agents, Webhook URL, Call Script)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id TEXT PRIMARY KEY,
  auto_assign_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  round_robin_index INTEGER NOT NULL DEFAULT 0,
  disabled_agents JSONB NOT NULL DEFAULT '[]'::jsonb,
  google_sheets_webhook_url TEXT NOT NULL DEFAULT '',
  call_script TEXT NOT NULL DEFAULT '',
  last_synced_at TEXT,
  updated_at TEXT NOT NULL
);

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS disabled_agents JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 8. Team Members table (Dynamic Admin-managed Agents, Collectors, Posters & Admins)
CREATE TABLE IF NOT EXISTS public.team_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'agent', 'collector', 'poster')),
  title TEXT NOT NULL DEFAULT '',
  avatar_initials TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_members_email_lower ON public.team_members (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_team_members_role_active ON public.team_members (role, is_active);

-- Disable Row Level Security (RLS) so team workspaces read/write immediately with the configured Supabase client
ALTER TABLE public.leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.paid_customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kawsar_posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members DISABLE ROW LEVEL SECURITY;
