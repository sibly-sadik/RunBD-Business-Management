import { asc, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from './index.ts';
import {
  appSettings,
  auditLogs,
  callLogs,
  duplicateAttempts,
  kawsarPosts,
  leads,
  paidCustomers,
  users,
} from './schema.ts';
import {
  DEFAULT_CALL_SCRIPT,
  DEFAULT_WEBHOOK_URL,
  getTodayYmdServer,
  normalizeBdPhoneServer,
  normalizeFacebookUrlServer,
  normalizePostUrlServer,
  parseDateToYmdServer,
  sanitizeCallStatus,
  sanitizeRenewalStatus,
} from '../server/helpers.ts';
import type {
  AppSettings,
  AuditAction,
  AuditLog,
  CallLog,
  ContentPost,
  DuplicateAttempt,
  Lead,
  PaidCustomer,
  PostLinkField,
  UserRole,
} from '../types/index.ts';

function rowToLead(row: typeof leads.$inferSelect): Lead {
  return {
    id: row.id,
    customerName: row.customerName,
    phone: row.phone,
    rawPhone: row.rawPhone || row.phone,
    facebookLink: row.facebookLink,
    normalizedFacebookLink: row.facebookNormalized,
    notes: row.notes,
    collectorId: row.collectorId,
    collectorName: row.collectorName,
    assignedAgentId: row.assignedAgentId,
    assignedAgentName: row.assignedAgentName,
    status: sanitizeCallStatus(row.status),
    followUpAt: row.followUpAt,
    lastCallNotes: row.lastCallNotes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    collectedDate: row.collectedDate,
    date: row.collectedDate,
  };
}

function rowToCallLog(row: typeof callLogs.$inferSelect): CallLog {
  return {
    id: row.id,
    leadId: row.leadId,
    customerName: row.customerName,
    phone: row.phone,
    agentId: row.agentId,
    agentName: row.agentName,
    previousStatus: sanitizeCallStatus(row.previousStatus),
    newStatus: sanitizeCallStatus(row.newStatus),
    notes: row.notes,
    followUpAt: row.followUpAt,
    timestamp: row.createdAt,
  };
}

function rowToPaidCustomer(row: typeof paidCustomers.$inferSelect): PaidCustomer {
  return {
    id: row.id,
    leadId: row.leadId,
    customerName: row.customerName,
    phone: row.phone,
    assignedAgentId: row.assignedAgentId,
    assignedAgentName: row.assignedAgentName,
    confirmedDate: row.confirmedDate,
    renewalDate: row.renewalDate,
    renewalStatus: sanitizeRenewalStatus(row.renewalStatus),
    lastRenewedAt: row.lastRenewedAt,
    packageName: row.packageName ?? '',
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToContentPost(row: typeof kawsarPosts.$inferSelect): ContentPost {
  return {
    id: row.id,
    facebookLink: row.facebookLink,
    normalizedFacebookLink: row.facebookNormalized,
    websiteLink: row.websiteLink,
    normalizedWebsiteLink: row.websiteNormalized,
    tiktokLink: row.tiktokLink ?? '',
    normalizedTiktokLink: row.tiktokNormalized ?? '',
    instagramLink: row.instagramLink ?? '',
    normalizedInstagramLink: row.instagramNormalized ?? '',
    twitterLink: row.twitterLink ?? '',
    normalizedTwitterLink: row.twitterNormalized ?? '',
    note: row.title,
    posterId: row.posterId,
    posterName: row.posterName,
    createdAt: row.createdAt,
  };
}

function rowToDuplicateAttempt(row: typeof duplicateAttempts.$inferSelect): DuplicateAttempt {
  return {
    id: row.id,
    collectorId: row.collectorId,
    collectorName: row.collectorName,
    attemptedName: row.attemptedName,
    attemptedPhone: row.attemptedPhone,
    attemptedFacebook: row.attemptedFb,
    matchedBy: row.matchedBy === 'facebook' ? 'facebook' : 'phone',
    existingCollectorName: row.existingCollectorName,
    existingDate: row.existingDate,
    timestamp: row.createdAt,
  };
}

function rowToAuditLog(row: typeof auditLogs.$inferSelect): AuditLog {
  return {
    id: row.id,
    actorId: row.actorId,
    actorName: row.actorName,
    actorRole: row.actorRole as UserRole,
    action: row.action as AuditAction,
    details: row.details,
    timestamp: row.createdAt,
  };
}

function buildLeadInsertValues(lead: Lead): typeof leads.$inferInsert {
  const normalizedPhone =
    normalizeBdPhoneServer(lead.phone || lead.rawPhone) ||
    lead.phone.trim() ||
    lead.rawPhone.trim();
  const facebookNormalized =
    lead.normalizedFacebookLink?.trim() ||
    normalizeFacebookUrlServer(lead.facebookLink);
  const collectedDate =
    parseDateToYmdServer(lead.collectedDate ?? lead.date ?? lead.createdAt) ??
    getTodayYmdServer();

  return {
    id: lead.id,
    customerName: lead.customerName,
    phone: normalizedPhone,
    rawPhone: lead.rawPhone || normalizedPhone,
    phoneNormalized: normalizedPhone,
    facebookLink: lead.facebookLink ?? '',
    facebookNormalized,
    notes: lead.notes ?? '',
    collectorId: lead.collectorId,
    collectorName: lead.collectorName,
    assignedAgentId: lead.assignedAgentId ?? null,
    assignedAgentName: lead.assignedAgentName ?? null,
    status: sanitizeCallStatus(lead.status),
    followUpAt: lead.followUpAt ?? null,
    lastCallNotes: lead.lastCallNotes ?? '',
    collectedDate,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

function buildPaidInsertValues(
  customer: PaidCustomer,
  facebookLink = ''
): typeof paidCustomers.$inferInsert {
  const phone = normalizeBdPhoneServer(customer.phone) || customer.phone.trim();
  return {
    id: customer.id,
    leadId: customer.leadId,
    customerName: customer.customerName,
    phone,
    facebookLink,
    assignedAgentId: customer.assignedAgentId ?? null,
    assignedAgentName: customer.assignedAgentName ?? null,
    confirmedDate: customer.confirmedDate,
    renewalDate: customer.renewalDate,
    renewalStatus: sanitizeRenewalStatus(customer.renewalStatus),
    lastRenewedAt: customer.lastRenewedAt ?? null,
    packageName: (customer.packageName ?? '').trim(),
    notes: customer.notes ?? '',
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  name: string,
  role: UserRole
) {
  try {
    const result = await db
      .insert(users)
      .values({ uid, email, name, role })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email, name, role },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed (getOrCreateUser):', error);
    throw new Error('Database operation failed.', { cause: error });
  }
}

export async function findLeadDuplicateInDb(
  rawPhone: string,
  rawFacebookLink: string
): Promise<{
  isDuplicate: boolean;
  matchedBy?: 'phone' | 'facebook';
  existingLead?: Lead;
}> {
  try {
    const phoneNorm = normalizeBdPhoneServer(rawPhone);
    if (phoneNorm) {
      const phoneMatch = await db
        .select()
        .from(leads)
        .where(eq(leads.phoneNormalized, phoneNorm))
        .limit(1);
      if (phoneMatch.length > 0) {
        return {
          isDuplicate: true,
          matchedBy: 'phone',
          existingLead: rowToLead(phoneMatch[0]),
        };
      }
    }

    const fbNorm = normalizeFacebookUrlServer(rawFacebookLink);
    if (fbNorm) {
      const fbMatch = await db
        .select()
        .from(leads)
        .where(eq(leads.facebookNormalized, fbNorm))
        .limit(1);
      if (fbMatch.length > 0) {
        return {
          isDuplicate: true,
          matchedBy: 'facebook',
          existingLead: rowToLead(fbMatch[0]),
        };
      }
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('Database query failed (findLeadDuplicateInDb):', error);
    throw new Error('Database duplicate check failed.', { cause: error });
  }
}

export async function findPostDuplicateInDb(
  rawFacebookLink: string,
  rawWebsiteLink: string,
  rawTiktokLink = '',
  rawInstagramLink = '',
  rawTwitterLink = ''
): Promise<{
  isDuplicate: boolean;
  matchedField?: PostLinkField;
  existingPost?: ContentPost;
}> {
  try {
    const targets: Array<{ field: PostLinkField; norm: string }> = [
      { field: 'Facebook Link' as PostLinkField, norm: rawFacebookLink ? normalizePostUrlServer(rawFacebookLink) : '' },
      { field: 'Website Link' as PostLinkField, norm: rawWebsiteLink ? normalizePostUrlServer(rawWebsiteLink) : '' },
      { field: 'TikTok Link' as PostLinkField, norm: rawTiktokLink ? normalizePostUrlServer(rawTiktokLink) : '' },
      { field: 'Instagram Link' as PostLinkField, norm: rawInstagramLink ? normalizePostUrlServer(rawInstagramLink) : '' },
      { field: 'Twitter Link' as PostLinkField, norm: rawTwitterLink ? normalizePostUrlServer(rawTwitterLink) : '' },
    ].filter((t) => Boolean(t.norm));

    for (const target of targets) {
      const match = await db
        .select()
        .from(kawsarPosts)
        .where(
          or(
            eq(kawsarPosts.facebookNormalized, target.norm),
            eq(kawsarPosts.websiteNormalized, target.norm),
            eq(kawsarPosts.tiktokNormalized, target.norm),
            eq(kawsarPosts.instagramNormalized, target.norm),
            eq(kawsarPosts.twitterNormalized, target.norm)
          )
        )
        .limit(1);
      if (match.length > 0) {
        return {
          isDuplicate: true,
          matchedField: target.field,
          existingPost: rowToContentPost(match[0]),
        };
      }
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('Database query failed (findPostDuplicateInDb):', error);
    throw new Error('Database post duplicate check failed.', { cause: error });
  }
}

export async function getSettingsFromDb(): Promise<AppSettings> {
  try {
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, 'global'))
      .limit(1);
    if (rows.length === 0) {
      return {
        autoAssignEnabled: true,
        roundRobinIndex: 0,
        disabledAgentIds: [],
        googleSheetsWebhookUrl: DEFAULT_WEBHOOK_URL,
        callScript: DEFAULT_CALL_SCRIPT,
        lastSyncedAt: null,
      };
    }
    const row = rows[0];
    return {
      autoAssignEnabled: row.autoAssignEnabled,
      roundRobinIndex: row.roundRobinIndex,
      disabledAgentIds: [],
      googleSheetsWebhookUrl: row.googleSheetsWebhookUrl || DEFAULT_WEBHOOK_URL,
      callScript: row.callScript || DEFAULT_CALL_SCRIPT,
      lastSyncedAt: row.lastSyncedAt,
    };
  } catch (error) {
    console.error('Database query failed (getSettingsFromDb):', error);
    throw new Error('Failed to load application settings.', { cause: error });
  }
}

export async function upsertSettingsInDb(next: AppSettings): Promise<AppSettings> {
  try {
    const nowIso = new Date().toISOString();
    const webhook = next.googleSheetsWebhookUrl.trim() || DEFAULT_WEBHOOK_URL;
    await db
      .insert(appSettings)
      .values({
        id: 'global',
        autoAssignEnabled: Boolean(next.autoAssignEnabled),
        roundRobinIndex: Math.max(0, Math.floor(Number(next.roundRobinIndex) || 0)),
        googleSheetsWebhookUrl: webhook,
        callScript: next.callScript || DEFAULT_CALL_SCRIPT,
        lastSyncedAt: next.lastSyncedAt ?? null,
        updatedAt: nowIso,
      })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: {
          autoAssignEnabled: Boolean(next.autoAssignEnabled),
          roundRobinIndex: Math.max(0, Math.floor(Number(next.roundRobinIndex) || 0)),
          googleSheetsWebhookUrl: webhook,
          callScript: next.callScript || DEFAULT_CALL_SCRIPT,
          lastSyncedAt: next.lastSyncedAt ?? null,
          updatedAt: nowIso,
        },
      });
    return {
      ...next,
      googleSheetsWebhookUrl: webhook,
    };
  } catch (error) {
    console.error('Database query failed (upsertSettingsInDb):', error);
    throw new Error('Failed to save application settings.', { cause: error });
  }
}

export async function getBootstrapForRole(role: UserRole, todayYmd: string) {
  try {
    const settingsRow = await getSettingsFromDb();

    const leadsPromise =
      role === 'admin'
        ? db.select().from(leads).orderBy(desc(leads.createdAt)).limit(2000)
        : role === 'collector' || role === 'agent'
        ? db
            .select()
            .from(leads)
            .where(eq(leads.collectedDate, todayYmd))
            .orderBy(desc(leads.createdAt))
            .limit(1000)
        : Promise.resolve([]);

    const callLogsPromise =
      role === 'admin'
        ? db.select().from(callLogs).orderBy(desc(callLogs.createdAt)).limit(2000)
        : role === 'agent'
        ? db
            .select()
            .from(callLogs)
            .where(eq(callLogs.callDate, todayYmd))
            .orderBy(desc(callLogs.createdAt))
            .limit(500)
        : Promise.resolve([]);

    const postsPromise =
      role === 'admin'
        ? db.select().from(kawsarPosts).orderBy(desc(kawsarPosts.createdAt)).limit(1000)
        : role === 'poster'
        ? db
            .select()
            .from(kawsarPosts)
            .where(eq(kawsarPosts.postedDate, todayYmd))
            .orderBy(desc(kawsarPosts.createdAt))
            .limit(500)
        : Promise.resolve([]);

    const paidPromise =
      role === 'admin' || role === 'agent'
        ? db
            .select()
            .from(paidCustomers)
            .orderBy(asc(paidCustomers.renewalDate))
            .limit(1000)
        : Promise.resolve([]);

    const dupPromise =
      role === 'admin'
        ? db
            .select()
            .from(duplicateAttempts)
            .orderBy(desc(duplicateAttempts.createdAt))
            .limit(500)
        : role === 'collector'
        ? db
            .select()
            .from(duplicateAttempts)
            .where(eq(duplicateAttempts.attemptDate, todayYmd))
            .orderBy(desc(duplicateAttempts.createdAt))
            .limit(300)
        : Promise.resolve([]);

    const auditPromise =
      role === 'admin'
        ? db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200)
        : Promise.resolve([]);

    const [
      leadRows,
      callLogRows,
      postRows,
      paidRows,
      dupRows,
      auditRows,
    ] = await Promise.all([
      leadsPromise,
      callLogsPromise,
      postsPromise,
      paidPromise,
      dupPromise,
      auditPromise,
    ]);

    return {
      leads: leadRows.map(rowToLead),
      callLogs: callLogRows.map(rowToCallLog),
      contentPosts: postRows.map(rowToContentPost),
      paidCustomers: paidRows.map(rowToPaidCustomer),
      duplicateAttempts: dupRows.map(rowToDuplicateAttempt),
      auditLogs: auditRows.map(rowToAuditLog),
      settings: settingsRow,
    };
  } catch (error) {
    console.error('Database query failed (getBootstrapForRole):', error);
    throw new Error('Failed to load workspace data from database.', { cause: error });
  }
}

export async function upsertLeadInDb(
  lead: Lead,
  nextRoundRobinIndex?: number
): Promise<Lead> {
  try {
    const values = buildLeadInsertValues(lead);
    await db.transaction(async (tx) => {
      await tx
        .insert(leads)
        .values(values)
        .onConflictDoUpdate({
          target: leads.id,
          set: {
            customerName: values.customerName,
            phone: values.phone,
            rawPhone: values.rawPhone,
            phoneNormalized: values.phoneNormalized,
            facebookLink: values.facebookLink,
            facebookNormalized: values.facebookNormalized,
            notes: values.notes,
            assignedAgentId: values.assignedAgentId,
            assignedAgentName: values.assignedAgentName,
            status: values.status,
            followUpAt: values.followUpAt,
            lastCallNotes: values.lastCallNotes,
            updatedAt: values.updatedAt,
          },
        });

      if (typeof nextRoundRobinIndex === 'number') {
        const nowIso = new Date().toISOString();
        const existingSettings = await tx
          .select()
          .from(appSettings)
          .where(eq(appSettings.id, 'global'))
          .limit(1);
        if (existingSettings.length > 0) {
          await tx
            .update(appSettings)
            .set({
              roundRobinIndex: Math.max(0, Math.floor(nextRoundRobinIndex)),
              updatedAt: nowIso,
            })
            .where(eq(appSettings.id, 'global'));
        } else {
          await tx.insert(appSettings).values({
            id: 'global',
            autoAssignEnabled: true,
            roundRobinIndex: Math.max(0, Math.floor(nextRoundRobinIndex)),
            googleSheetsWebhookUrl: DEFAULT_WEBHOOK_URL,
            callScript: DEFAULT_CALL_SCRIPT,
            lastSyncedAt: null,
            updatedAt: nowIso,
          });
        }
      }
    });

    return {
      ...lead,
      phone: values.phone,
      normalizedFacebookLink:
        values.facebookNormalized ?? lead.normalizedFacebookLink ?? '',
      collectedDate: values.collectedDate ?? lead.collectedDate,
    };
  } catch (error) {
    console.error('Database query failed (upsertLeadInDb):', error);
    throw new Error('Failed to save lead to database.', { cause: error });
  }
}

export async function upsertLeadsBatchInDb(
  leadList: Lead[],
  nextRoundRobinIndex?: number
): Promise<void> {
  if (leadList.length === 0) return;
  try {
    await db.transaction(async (tx) => {
      for (const lead of leadList) {
        const values = buildLeadInsertValues(lead);
        await tx
          .insert(leads)
          .values(values)
          .onConflictDoUpdate({
            target: leads.id,
            set: {
              customerName: values.customerName,
              phone: values.phone,
              rawPhone: values.rawPhone,
              phoneNormalized: values.phoneNormalized,
              facebookLink: values.facebookLink,
              facebookNormalized: values.facebookNormalized,
              notes: values.notes,
              assignedAgentId: values.assignedAgentId,
              assignedAgentName: values.assignedAgentName,
              status: values.status,
              followUpAt: values.followUpAt,
              lastCallNotes: values.lastCallNotes,
              updatedAt: values.updatedAt,
            },
          });
      }

      if (typeof nextRoundRobinIndex === 'number') {
        const nowIso = new Date().toISOString();
        const existingSettings = await tx
          .select()
          .from(appSettings)
          .where(eq(appSettings.id, 'global'))
          .limit(1);
        if (existingSettings.length > 0) {
          await tx
            .update(appSettings)
            .set({
              roundRobinIndex: Math.max(0, Math.floor(nextRoundRobinIndex)),
              updatedAt: nowIso,
            })
            .where(eq(appSettings.id, 'global'));
        } else {
          await tx.insert(appSettings).values({
            id: 'global',
            autoAssignEnabled: true,
            roundRobinIndex: Math.max(0, Math.floor(nextRoundRobinIndex)),
            googleSheetsWebhookUrl: DEFAULT_WEBHOOK_URL,
            callScript: DEFAULT_CALL_SCRIPT,
            lastSyncedAt: null,
            updatedAt: nowIso,
          });
        }
      }
    });
  } catch (error) {
    console.error('Database query failed (upsertLeadsBatchInDb):', error);
    throw new Error('Failed to save batch leads to database.', { cause: error });
  }
}

export async function recordCallLogTransaction(
  updatedLead: Lead,
  callLog: CallLog,
  paidCustomer?: PaidCustomer
): Promise<void> {
  try {
    const leadValues = buildLeadInsertValues(updatedLead);
    const callDate =
      parseDateToYmdServer(callLog.timestamp) ?? getTodayYmdServer();

    await db.transaction(async (tx) => {
      await tx
        .insert(leads)
        .values(leadValues)
        .onConflictDoUpdate({
          target: leads.id,
          set: {
            status: leadValues.status,
            followUpAt: leadValues.followUpAt,
            lastCallNotes: leadValues.lastCallNotes,
            updatedAt: leadValues.updatedAt,
          },
        });

      const normalizedPhone = normalizeBdPhoneServer(callLog.phone) || callLog.phone;
      const existingSameDay = await tx
        .select()
        .from(callLogs)
        .where(eq(callLogs.callDate, callDate));

      const targetCore = normalizedPhone.replace(/\D/g, '').slice(-10);
      const matched = existingSameDay.find((row) => {
        const sameAgent =
          (callLog.agentId && row.agentId === callLog.agentId) ||
          row.agentName.trim().toLowerCase() === callLog.agentName.trim().toLowerCase();
        if (!sameAgent) return false;
        if (callLog.leadId && row.leadId === callLog.leadId) return true;
        const rowCore = row.phone.replace(/\D/g, '').slice(-10);
        return Boolean(targetCore && rowCore && targetCore === rowCore);
      });

      if (matched) {
        await tx
          .update(callLogs)
          .set({
            leadId: callLog.leadId,
            customerName: callLog.customerName,
            phone: normalizedPhone,
            newStatus: sanitizeCallStatus(callLog.newStatus),
            notes: callLog.notes ?? '',
            followUpAt: callLog.followUpAt ?? null,
            createdAt: callLog.timestamp,
          })
          .where(eq(callLogs.id, matched.id));
      } else {
        await tx
          .insert(callLogs)
          .values({
            id: callLog.id,
            leadId: callLog.leadId,
            customerName: callLog.customerName,
            phone: normalizedPhone,
            agentId: callLog.agentId,
            agentName: callLog.agentName,
            previousStatus: sanitizeCallStatus(callLog.previousStatus),
            newStatus: sanitizeCallStatus(callLog.newStatus),
            notes: callLog.notes ?? '',
            followUpAt: callLog.followUpAt ?? null,
            callDate,
            createdAt: callLog.timestamp,
          })
          .onConflictDoUpdate({
            target: callLogs.id,
            set: {
              newStatus: sanitizeCallStatus(callLog.newStatus),
              notes: callLog.notes ?? '',
              followUpAt: callLog.followUpAt ?? null,
              createdAt: callLog.timestamp,
            },
          });
      }

      if (paidCustomer) {
        const paidValues = buildPaidInsertValues(
          paidCustomer,
          leadValues.facebookLink
        );
        await tx
          .insert(paidCustomers)
          .values(paidValues)
          .onConflictDoUpdate({
            target: paidCustomers.id,
            set: {
              customerName: paidValues.customerName,
              phone: paidValues.phone,
              facebookLink: paidValues.facebookLink,
              assignedAgentId: paidValues.assignedAgentId,
              assignedAgentName: paidValues.assignedAgentName,
              renewalStatus: paidValues.renewalStatus,
              notes: paidValues.notes,
              updatedAt: paidValues.updatedAt,
            },
          });
      }
    });
  } catch (error) {
    console.error('Database query failed (recordCallLogTransaction):', error);
    throw new Error('Failed to save call log to database.', { cause: error });
  }
}

export async function upsertPaidCustomerInDb(
  customer: PaidCustomer,
  facebookLink = ''
): Promise<void> {
  try {
    const values = buildPaidInsertValues(customer, facebookLink);
    await db
      .insert(paidCustomers)
      .values(values)
      .onConflictDoUpdate({
        target: paidCustomers.id,
        set: {
          customerName: values.customerName,
          phone: values.phone,
          facebookLink: values.facebookLink,
          assignedAgentId: values.assignedAgentId,
          assignedAgentName: values.assignedAgentName,
          confirmedDate: values.confirmedDate,
          renewalDate: values.renewalDate,
          renewalStatus: values.renewalStatus,
          lastRenewedAt: values.lastRenewedAt,
          packageName: values.packageName,
          notes: values.notes,
          updatedAt: values.updatedAt,
        },
      });
  } catch (error) {
    console.error('Database query failed (upsertPaidCustomerInDb):', error);
    throw new Error('Failed to save paid customer to database.', { cause: error });
  }
}

export async function deleteLeadInDb(leadId: string): Promise<void> {
  try {
    await db.delete(leads).where(eq(leads.id, leadId));
  } catch (error) {
    console.error('Database query failed (deleteLeadInDb):', error);
    throw new Error('Failed to delete lead from database.', { cause: error });
  }
}

export async function deletePaidCustomerInDb(
  customerId: string,
  match?: { leadId?: string; phone?: string }
): Promise<void> {
  try {
    const cleanId = customerId.trim();
    const cleanLeadId = (match?.leadId ?? '').trim();
    const rawPhone = (match?.phone ?? '').trim();
    const normPhone = (rawPhone ? normalizeBdPhoneServer(rawPhone) : '') ?? '';
    const core = (normPhone || rawPhone).replace(/\D/g, '').slice(-10);
    const conditions = [];
    const idList = Array.from(
      new Set(
        [
          cleanId,
          cleanLeadId ? `PC-${cleanLeadId}` : '',
          core ? `SHEET-PC-${core}` : '',
        ].filter(Boolean)
      )
    );
    if (idList.length > 0) conditions.push(inArray(paidCustomers.id, idList));
    const leadIds = Array.from(
      new Set(
        [
          cleanLeadId,
          cleanId.startsWith('PC-') && !cleanId.startsWith('PC-MAN-')
            ? cleanId.slice(3)
            : '',
        ].filter(Boolean)
      )
    );
    if (leadIds.length > 0) conditions.push(inArray(paidCustomers.leadId, leadIds));
    if (core) {
      const phones = Array.from(
        new Set(
          [normPhone, `0${core}`, `+880${core}`, `880${core}`, rawPhone].filter(
            (v): v is string => Boolean(v)
          )
        )
      );
      if (phones.length > 0) conditions.push(inArray(paidCustomers.phone, phones));
    }
    if (conditions.length === 0) return;
    await db.delete(paidCustomers).where(conditions.length === 1 ? conditions[0] : or(...conditions));
  } catch (error) {
    console.error('Database query failed (deletePaidCustomerInDb):', error);
    throw new Error('Failed to delete paid customer from database.', { cause: error });
  }
}

export async function upsertPaidCustomersBatchInDb(
  customers: PaidCustomer[]
): Promise<void> {
  if (customers.length === 0) return;
  try {
    await db.transaction(async (tx) => {
      for (const customer of customers) {
        const values = buildPaidInsertValues(customer);
        await tx
          .insert(paidCustomers)
          .values(values)
          .onConflictDoUpdate({
            target: paidCustomers.id,
            set: {
              customerName: values.customerName,
              phone: values.phone,
              assignedAgentId: values.assignedAgentId,
              assignedAgentName: values.assignedAgentName,
              confirmedDate: values.confirmedDate,
              renewalDate: values.renewalDate,
              renewalStatus: values.renewalStatus,
              lastRenewedAt: values.lastRenewedAt,
              packageName: values.packageName,
              notes: values.notes,
              updatedAt: values.updatedAt,
            },
          });
      }
    });
  } catch (error) {
    console.error('Database query failed (upsertPaidCustomersBatchInDb):', error);
    throw new Error('Failed to save paid customers batch.', { cause: error });
  }
}

export async function insertContentPostInDb(post: ContentPost): Promise<void> {
  try {
    const fbNorm = post.facebookLink
      ? post.normalizedFacebookLink || normalizePostUrlServer(post.facebookLink)
      : '';
    const webNorm = post.websiteLink
      ? post.normalizedWebsiteLink || normalizePostUrlServer(post.websiteLink)
      : '';
    const tiktokNorm = post.tiktokLink
      ? post.normalizedTiktokLink || normalizePostUrlServer(post.tiktokLink)
      : '';
    const igNorm = post.instagramLink
      ? post.normalizedInstagramLink || normalizePostUrlServer(post.instagramLink)
      : '';
    const twNorm = post.twitterLink
      ? post.normalizedTwitterLink || normalizePostUrlServer(post.twitterLink)
      : '';
    const postedDate =
      parseDateToYmdServer(post.createdAt) ?? getTodayYmdServer();

    await db
      .insert(kawsarPosts)
      .values({
        id: post.id,
        title: post.note ?? '',
        facebookLink: post.facebookLink ?? '',
        facebookNormalized: fbNorm,
        websiteLink: post.websiteLink ?? '',
        websiteNormalized: webNorm,
        tiktokLink: post.tiktokLink ?? '',
        tiktokNormalized: tiktokNorm,
        instagramLink: post.instagramLink ?? '',
        instagramNormalized: igNorm,
        twitterLink: post.twitterLink ?? '',
        twitterNormalized: twNorm,
        posterId: post.posterId,
        posterName: post.posterName,
        postedDate,
        createdAt: post.createdAt,
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error('Database query failed (insertContentPostInDb):', error);
    throw new Error('Failed to save post entry to database.', { cause: error });
  }
}

export async function insertDuplicateAttemptInDb(
  attempt: DuplicateAttempt,
  existingLeadId = ''
): Promise<void> {
  try {
    const attemptDate =
      parseDateToYmdServer(attempt.timestamp) ?? getTodayYmdServer();
    await db
      .insert(duplicateAttempts)
      .values({
        id: attempt.id,
        collectorId: attempt.collectorId,
        collectorName: attempt.collectorName,
        attemptedName: attempt.attemptedName ?? '',
        attemptedPhone: attempt.attemptedPhone ?? '',
        attemptedFb: attempt.attemptedFacebook ?? '',
        matchedBy: attempt.matchedBy,
        existingLeadId,
        existingCollectorName: attempt.existingCollectorName ?? '',
        existingDate: attempt.existingDate ?? '',
        attemptDate,
        createdAt: attempt.timestamp,
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error('Database query failed (insertDuplicateAttemptInDb):', error);
    throw new Error('Failed to save duplicate attempt.', { cause: error });
  }
}

export async function insertAuditLogInDb(log: AuditLog): Promise<void> {
  try {
    await db
      .insert(auditLogs)
      .values({
        id: log.id,
        actorId: log.actorId,
        actorName: log.actorName,
        actorRole: log.actorRole,
        action: log.action,
        details: log.details,
        createdAt: log.timestamp,
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error('Database query failed (insertAuditLogInDb):', error);
    throw new Error('Failed to save audit log.', { cause: error });
  }
}

export async function syncPulledRecordsToDb(input: {
  leads?: Lead[];
  callLogs?: CallLog[];
  contentPosts?: ContentPost[];
  paidCustomers?: PaidCustomer[];
}): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      if (input.leads && input.leads.length > 0) {
        for (const lead of input.leads) {
          const values = buildLeadInsertValues(lead);
          await tx
            .insert(leads)
            .values(values)
            .onConflictDoUpdate({
              target: leads.id,
              set: {
                customerName: values.customerName,
                phone: values.phone,
                rawPhone: values.rawPhone,
                phoneNormalized: values.phoneNormalized,
                facebookLink: values.facebookLink,
                facebookNormalized: values.facebookNormalized,
                notes: values.notes,
                assignedAgentId: values.assignedAgentId,
                assignedAgentName: values.assignedAgentName,
                status: values.status,
                followUpAt: values.followUpAt,
                lastCallNotes: values.lastCallNotes,
                updatedAt: values.updatedAt,
              },
            });
        }
      }

      if (input.callLogs && input.callLogs.length > 0) {
        for (const log of input.callLogs) {
          const callDate =
            parseDateToYmdServer(log.timestamp) ?? getTodayYmdServer();
          await tx
            .insert(callLogs)
            .values({
              id: log.id,
              leadId: log.leadId,
              customerName: log.customerName,
              phone: normalizeBdPhoneServer(log.phone) || log.phone,
              agentId: log.agentId,
              agentName: log.agentName,
              previousStatus: sanitizeCallStatus(log.previousStatus),
              newStatus: sanitizeCallStatus(log.newStatus),
              notes: log.notes ?? '',
              followUpAt: log.followUpAt ?? null,
              callDate,
              createdAt: log.timestamp,
            })
            .onConflictDoNothing();
        }
      }

      if (input.contentPosts && input.contentPosts.length > 0) {
        for (const post of input.contentPosts) {
          const fbNorm = post.facebookLink
            ? post.normalizedFacebookLink || normalizePostUrlServer(post.facebookLink)
            : '';
          const webNorm = post.websiteLink
            ? post.normalizedWebsiteLink || normalizePostUrlServer(post.websiteLink)
            : '';
          const tiktokNorm = post.tiktokLink
            ? post.normalizedTiktokLink || normalizePostUrlServer(post.tiktokLink)
            : '';
          const igNorm = post.instagramLink
            ? post.normalizedInstagramLink || normalizePostUrlServer(post.instagramLink)
            : '';
          const twNorm = post.twitterLink
            ? post.normalizedTwitterLink || normalizePostUrlServer(post.twitterLink)
            : '';
          const postedDate =
            parseDateToYmdServer(post.createdAt) ?? getTodayYmdServer();
          await tx
            .insert(kawsarPosts)
            .values({
              id: post.id,
              title: post.note ?? '',
              facebookLink: post.facebookLink ?? '',
              facebookNormalized: fbNorm,
              websiteLink: post.websiteLink ?? '',
              websiteNormalized: webNorm,
              tiktokLink: post.tiktokLink ?? '',
              tiktokNormalized: tiktokNorm,
              instagramLink: post.instagramLink ?? '',
              instagramNormalized: igNorm,
              twitterLink: post.twitterLink ?? '',
              twitterNormalized: twNorm,
              posterId: post.posterId,
              posterName: post.posterName,
              postedDate,
              createdAt: post.createdAt,
            })
            .onConflictDoNothing();
        }
      }

      if (input.paidCustomers && input.paidCustomers.length > 0) {
        for (const customer of input.paidCustomers) {
          const values = buildPaidInsertValues(customer);
          await tx
            .insert(paidCustomers)
            .values(values)
            .onConflictDoUpdate({
              target: paidCustomers.id,
              set: {
                customerName: values.customerName,
                phone: values.phone,
                assignedAgentId: values.assignedAgentId,
                assignedAgentName: values.assignedAgentName,
                confirmedDate: values.confirmedDate,
                renewalDate: values.renewalDate,
                renewalStatus: values.renewalStatus,
                lastRenewedAt: values.lastRenewedAt,
                packageName: values.packageName,
                notes: values.notes,
                updatedAt: values.updatedAt,
              },
            });
        }
      }
    });
  } catch (error) {
    console.error('Database query failed (syncPulledRecordsToDb):', error);
    throw new Error('Failed to sync records to database.', { cause: error });
  }
}
