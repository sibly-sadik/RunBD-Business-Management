import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import {
  findLeadDuplicateInDb,
  findPostDuplicateInDb,
  getBootstrapForRole,
  getOrCreateUser,
  getSettingsFromDb,
  insertAuditLogInDb,
  insertContentPostInDb,
  insertDuplicateAttemptInDb,
  recordCallLogTransaction,
  syncPulledRecordsToDb,
  upsertLeadInDb,
  upsertLeadsBatchInDb,
  upsertPaidCustomerInDb,
  upsertSettingsInDb,
} from './src/db/repository.ts';
import {
  requireAuth,
  SESSION_COOKIE_NAME,
  type AuthRequest,
} from './src/middleware/auth.ts';
import { createSessionToken } from './src/server/auth.ts';
import { getTodayYmdServer } from './src/server/helpers.ts';
import { authenticateServerTeamUser } from './src/server/teamUsers.ts';
import type {
  AppSettings,
  AuditLog,
  CallLog,
  ContentPost,
  DuplicateAttempt,
  Lead,
  PaidCustomer,
} from './src/types/index.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

function isHttpsRequest(req: express.Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return req.secure || proto.includes('https');
}

function buildSessionCookieHeader(
  req: express.Request,
  value: string,
  maxAgeSeconds: number
): string {
  const https = isHttpsRequest(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    https ? 'SameSite=None' : 'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (https) {
    parts.push('Secure', 'Partitioned');
  }
  return parts.join('; ');
}

// Health endpoint
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Authentication routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const body = req.body as { username?: unknown; password?: unknown } | undefined;
    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!username.trim() || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    const user = authenticateServerTeamUser(username, password);
    if (!user) {
      res.status(401).json({
        error: 'Invalid username or password. Please verify your assigned RunBD credentials.',
      });
      return;
    }

    await getOrCreateUser(user.id, user.email, user.name, user.role);
    const token = createSessionToken(user);
    res.setHeader('Set-Cookie', buildSessionCookieHeader(req, token, 60 * 60 * 24 * 7));
    res.json({ user, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Authentication service failed. Please try again.' });
  }
});

app.get('/api/auth/session', requireAuth, (req: AuthRequest, res) => {
  res.json({ user: req.authUser });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', buildSessionCookieHeader(req, '', 0));
  res.json({ ok: true });
});

// Scoped workspace bootstrap (strict Today-only for Agents/Collectors/Poster; Admin keeps history)
app.get('/api/bootstrap', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    const todayYmd = getTodayYmdServer();
    const data = await getBootstrapForRole(user.role, todayYmd);
    res.json({ ok: true, todayYmd, ...data });
  } catch (error) {
    console.error('Failed to bootstrap PostgreSQL data:', error);
    res.status(500).json({ error: 'Failed to load workspace data from database.' });
  }
});

// Instant indexed lead duplicate check (<100ms B-tree lookup)
app.get('/api/leads/check-duplicate', requireAuth, async (req: AuthRequest, res) => {
  try {
    const phone = typeof req.query.phone === 'string' ? req.query.phone : '';
    const facebookLink =
      typeof req.query.facebookLink === 'string' ? req.query.facebookLink : '';
    const result = await findLeadDuplicateInDb(phone, facebookLink);
    res.json({
      ok: true,
      isDuplicate: result.isDuplicate,
      matchedBy: result.matchedBy,
      existingLead: result.existingLead,
    });
  } catch (error) {
    console.error('Lead duplicate check error:', error);
    res.status(500).json({ ok: false, error: 'Database duplicate check failed.' });
  }
});

// Insert / upsert lead with authoritative server-side duplicate check
app.post('/api/leads', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    if (user.role !== 'collector' && user.role !== 'admin') {
      res.status(403).json({ error: 'Only Data Collectors or Admin can create leads.' });
      return;
    }

    const body = req.body as {
      lead?: Lead;
      nextRoundRobinIndex?: number;
    };
    const lead = body?.lead;
    if (!lead || typeof lead.id !== 'string' || !lead.customerName?.trim()) {
      res.status(400).json({ error: 'Valid lead payload is required.' });
      return;
    }

    const dupCheck = await findLeadDuplicateInDb(
      lead.phone || lead.rawPhone,
      lead.facebookLink
    );
    if (dupCheck.isDuplicate && dupCheck.existingLead) {
      res.status(409).json({
        ok: false,
        isDuplicate: true,
        matchedBy: dupCheck.matchedBy ?? 'phone',
        existingLead: dupCheck.existingLead,
      });
      return;
    }

    const saved = await upsertLeadInDb(
      {
        ...lead,
        collectorId: user.id,
        collectorName: user.name,
      },
      body.nextRoundRobinIndex
    );
    res.status(201).json({ ok: true, lead: saved });
  } catch (error) {
    console.error('Failed to create lead:', error);
    res.status(500).json({ error: 'Failed to save lead to database.' });
  }
});

// Bulk CSV lead import
app.post('/api/leads/batch', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    if (user.role !== 'collector' && user.role !== 'admin') {
      res.status(403).json({ error: 'Only Data Collectors or Admin can import leads.' });
      return;
    }

    const body = req.body as {
      leads?: Lead[];
      nextRoundRobinIndex?: number;
    };
    const incoming = Array.isArray(body?.leads) ? body.leads : [];
    if (incoming.length === 0) {
      res.status(400).json({ error: 'No leads provided.' });
      return;
    }

    const accepted: Lead[] = [];
    const duplicates: Array<{
      lead: Lead;
      matchedBy: 'phone' | 'facebook';
      existingLead: Lead;
    }> = [];

    for (const item of incoming) {
      const dupCheck = await findLeadDuplicateInDb(
        item.phone || item.rawPhone,
        item.facebookLink
      );
      if (dupCheck.isDuplicate && dupCheck.existingLead) {
        duplicates.push({
          lead: item,
          matchedBy: dupCheck.matchedBy ?? 'phone',
          existingLead: dupCheck.existingLead,
        });
      } else {
        accepted.push({
          ...item,
          collectorId: user.id,
          collectorName: user.name,
        });
      }
    }

    if (accepted.length > 0) {
      await upsertLeadsBatchInDb(accepted, body.nextRoundRobinIndex);
    }

    res.status(201).json({ ok: true, accepted, duplicates });
  } catch (error) {
    console.error('Failed to batch import leads:', error);
    res.status(500).json({ error: 'Failed to batch import leads.' });
  }
});

// Update lead (status / assignment) + optional Paid Customer upsert
app.patch('/api/leads/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    if (user.role !== 'admin' && user.role !== 'agent') {
      res.status(403).json({ error: 'Only Agents or Admin can update leads.' });
      return;
    }

    const body = req.body as {
      lead?: Lead;
      paidCustomer?: PaidCustomer;
    };
    if (!body?.lead || body.lead.id !== req.params.id) {
      res.status(400).json({ error: 'Valid lead payload matching route ID is required.' });
      return;
    }

    const saved = await upsertLeadInDb(body.lead);
    if (body.paidCustomer) {
      await upsertPaidCustomerInDb(body.paidCustomer, body.lead.facebookLink);
    }
    res.json({ ok: true, lead: saved });
  } catch (error) {
    console.error('Failed to update lead:', error);
    res.status(500).json({ error: 'Failed to update lead in database.' });
  }
});

// Log call + update lead + upsert Paid Customer atomically
app.post('/api/call-logs', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    if (user.role !== 'admin' && user.role !== 'agent') {
      res.status(403).json({ error: 'Only Call Center Agents or Admin can log calls.' });
      return;
    }

    const body = req.body as {
      updatedLead?: Lead;
      callLog?: CallLog;
      paidCustomer?: PaidCustomer;
    };
    if (!body?.updatedLead || !body?.callLog) {
      res.status(400).json({ error: 'Call log and updated lead payload are required.' });
      return;
    }

    await recordCallLogTransaction(body.updatedLead, body.callLog, body.paidCustomer);
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Failed to log call:', error);
    res.status(500).json({ error: 'Failed to record call log in database.' });
  }
});

// Instant indexed Kawsar post duplicate check (<100ms B-tree lookup)
app.get('/api/posts/check-duplicate', requireAuth, async (req: AuthRequest, res) => {
  try {
    const facebookLink =
      typeof req.query.facebookLink === 'string' ? req.query.facebookLink : '';
    const websiteLink =
      typeof req.query.websiteLink === 'string' ? req.query.websiteLink : '';
    const result = await findPostDuplicateInDb(facebookLink, websiteLink);
    res.json({
      ok: true,
      isDuplicate: result.isDuplicate,
      matchedField: result.matchedField,
      existingPost: result.existingPost,
    });
  } catch (error) {
    console.error('Post duplicate check error:', error);
    res.status(500).json({ ok: false, error: 'Database post duplicate check failed.' });
  }
});

// Insert Kawsar content post with server-side duplicate check
app.post('/api/posts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    if (user.role !== 'poster' && user.role !== 'admin') {
      res.status(403).json({ error: 'Only Kawsar or Admin can submit post links.' });
      return;
    }

    const body = req.body as { post?: ContentPost };
    const post = body?.post;
    if (!post || typeof post.id !== 'string') {
      res.status(400).json({ error: 'Valid post payload is required.' });
      return;
    }

    const dup = await findPostDuplicateInDb(post.facebookLink, post.websiteLink);
    if (dup.isDuplicate && dup.existingPost) {
      res.status(409).json({
        ok: false,
        isDuplicate: true,
        matchedField: dup.matchedField ?? 'Facebook Link',
        existingPost: dup.existingPost,
      });
      return;
    }

    await insertContentPostInDb({
      ...post,
      posterId: user.id,
      posterName: user.name,
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Failed to insert post:', error);
    res.status(500).json({ error: 'Failed to save post link to database.' });
  }
});

// Upsert Paid Customer (Order Confirmed / Renewed)
app.post('/api/paid-customers/upsert', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    if (user.role !== 'admin' && user.role !== 'agent') {
      res.status(403).json({ error: 'Unauthorized to update paid customers.' });
      return;
    }

    const body = req.body as { paidCustomer?: PaidCustomer; facebookLink?: string };
    if (!body?.paidCustomer?.id) {
      res.status(400).json({ error: 'Valid paid customer payload is required.' });
      return;
    }

    await upsertPaidCustomerInDb(body.paidCustomer, body.facebookLink ?? '');
    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to save paid customer:', error);
    res.status(500).json({ error: 'Failed to save paid customer to database.' });
  }
});

// Record duplicate attempt
app.post('/api/duplicate-attempts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as { attempt?: DuplicateAttempt; existingLeadId?: string };
    if (!body?.attempt?.id) {
      res.status(400).json({ error: 'Valid duplicate attempt payload is required.' });
      return;
    }
    await insertDuplicateAttemptInDb(body.attempt, body.existingLeadId ?? '');
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Failed to save duplicate attempt:', error);
    res.status(500).json({ error: 'Failed to save duplicate attempt.' });
  }
});

// Record audit log using verified actor identity
app.post('/api/audit-logs', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    const body = req.body as { log?: AuditLog };
    if (!body?.log?.id || !body?.log?.action) {
      res.status(400).json({ error: 'Valid audit log payload is required.' });
      return;
    }
    await insertAuditLogInDb({
      ...body.log,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Failed to save audit log:', error);
    res.status(500).json({ error: 'Failed to save audit log.' });
  }
});

// Update global settings (Admin full control; Agent allowed to update callScript)
app.put('/api/settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    const body = req.body as { settings?: AppSettings };
    if (!body?.settings) {
      res.status(400).json({ error: 'Settings payload is required.' });
      return;
    }

    if (user.role === 'admin') {
      const saved = await upsertSettingsInDb(body.settings);
      res.json({ ok: true, settings: saved });
      return;
    }

    if (user.role === 'agent') {
      const current = await getSettingsFromDb();
      const saved = await upsertSettingsInDb({
        ...current,
        callScript: body.settings.callScript,
      });
      res.json({ ok: true, settings: saved });
      return;
    }

    res.status(403).json({ error: 'Insufficient permissions to modify settings.' });
  } catch (error) {
    console.error('Failed to update settings:', error);
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});

// Two-way sync: persist records pulled from Google Sheets into PostgreSQL
app.post('/api/sync/batch', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as {
      leads?: Lead[];
      callLogs?: CallLog[];
      contentPosts?: ContentPost[];
      paidCustomers?: PaidCustomer[];
    };
    await syncPulledRecordsToDb({
      leads: Array.isArray(body?.leads) ? body.leads : undefined,
      callLogs: Array.isArray(body?.callLogs) ? body.callLogs : undefined,
      contentPosts: Array.isArray(body?.contentPosts) ? body.contentPosts : undefined,
      paidCustomers: Array.isArray(body?.paidCustomers) ? body.paidCustomers : undefined,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to sync sheet data to PostgreSQL:', error);
    res.status(500).json({ error: 'Failed to sync pulled data to database.' });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.use((_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`RunBD server running on http://0.0.0.0:${port}`);
  });
}

void startServer();
