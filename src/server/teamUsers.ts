import crypto from 'node:crypto';
import type { UserRole } from '../types/index.ts';
import {
  buildAvatarInitials,
  buildUniqueMemberId,
  defaultTitleForRole,
  normalizeMemberUsername,
  validateNewTeamMemberInput,
  validatePasswordResetInput,
} from '../utils/teamLogic.ts';
import type { PublicUser } from './auth.ts';
import { supabaseServer } from './supabaseServer.ts';

interface ServerTeamAccount extends PublicUser {
  passwordHash: string;
}

export interface TeamMemberRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  avatar_initials: string;
  password_hash?: string;
  password_salt?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export function hashPasswordWithSalt(
  plain: string,
  salt?: string
): { hash: string; salt: string } {
  const resolvedSalt = salt?.trim() || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, resolvedSalt, 32).toString('hex');
  return { hash: derived, salt: resolvedSalt };
}

export function verifyScryptPassword(
  plain: string,
  salt: string,
  expectedHashHex: string
): boolean {
  if (!plain || !salt || !expectedHashHex) return false;
  try {
    const derived = crypto.scryptSync(plain, salt, 32);
    const expected = Buffer.from(expectedHashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function hashSeedPassword(plain: string, salt: string): string {
  const { hash } = hashPasswordWithSalt(plain, salt);
  return `${salt}:${hash}`;
}

function verifyPasswordHash(plain: string, stored: string): boolean {
  const idx = stored.indexOf(':');
  if (idx <= 0) return false;
  const salt = stored.slice(0, idx);
  const expectedHex = stored.slice(idx + 1);
  return verifyScryptPassword(plain, salt, expectedHex);
}

export const RAW_ACCOUNTS: Array<{
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  avatarInitials: string;
  secret: string;
}> = [
  {
    id: 'admin-1',
    name: 'Jahid Islam',
    email: 'admin@runbd',
    role: 'admin',
    title: 'Manager',
    avatarInitials: 'MH',
    secret: 'admin@/#312',
  },
  {
    id: 'agent-tanjin',
    name: 'Tanjin',
    email: 'tazin@runbd',
    role: 'agent',
    title: 'Senior Call Center Agent',
    avatarInitials: 'TJ',
    secret: 'tazin@/#312',
  },
  {
    id: 'agent-kathy',
    name: 'Kathy',
    email: 'kathy@runbd',
    role: 'agent',
    title: 'Call Center Agent',
    avatarInitials: 'KT',
    secret: 'kathy@/#312',
  },
  {
    id: 'agent-tania',
    name: 'Tania',
    email: 'tania@runbd',
    role: 'agent',
    title: 'Call Center Agent',
    avatarInitials: 'TN',
    secret: 'tania@/#312',
  },
  {
    id: 'agent-shanaz',
    name: 'Shanaz',
    email: 'shanaz@runbd',
    role: 'agent',
    title: 'Call Center Agent',
    avatarInitials: 'SH',
    secret: 'shanaz@/#312',
  },
  {
    id: 'agent-sizon',
    name: 'Sizon',
    email: 'sizon@runbd',
    role: 'agent',
    title: 'Call Center Agent',
    avatarInitials: 'SZ',
    secret: 'sizon@/#312',
  },
  {
    id: 'agent-sakib',
    name: 'Sakib',
    email: 'sakib@runbd',
    role: 'agent',
    title: 'Call Center Agent',
    avatarInitials: 'SK',
    secret: 'sakib@/#312',
  },
  {
    id: 'collector-farhan',
    name: 'Farhan',
    email: 'farhan@runbd',
    role: 'collector',
    title: 'Data Collector',
    avatarInitials: 'FR',
    secret: 'farhan@/#312',
  },
  {
    id: 'collector-naim',
    name: 'Naim',
    email: 'naim@runbd',
    role: 'collector',
    title: 'Data Collector',
    avatarInitials: 'NM',
    secret: 'naim@/#312',
  },
  {
    id: 'poster-kawsar',
    name: 'Kawsar',
    email: 'kawsar@runbd',
    role: 'poster',
    title: 'Content & Link Poster',
    avatarInitials: 'KW',
    secret: 'kawsar@/#312',
  },
];

export const SERVER_TEAM_USERS: ServerTeamAccount[] = RAW_ACCOUNTS.map((acct) => ({
  id: acct.id,
  name: acct.name,
  email: acct.email,
  role: acct.role,
  title: acct.title,
  avatarInitials: acct.avatarInitials,
  isActive: true,
  passwordHash: hashSeedPassword(acct.secret, acct.id),
}));

export function isSupabaseSchemaMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = (err.code ?? '').toUpperCase();
  const msg = (err.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table')
  );
}

export function rowToPublicUser(row: TeamMemberRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    title: row.title || defaultTitleForRole(row.role),
    avatarInitials: row.avatar_initials || buildAvatarInitials(row.name),
    isActive: row.is_active !== false,
    createdAt: row.created_at,
  };
}

export function getDefaultPublicDirectory(): PublicUser[] {
  return SERVER_TEAM_USERS.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    title: u.title,
    avatarInitials: u.avatarInitials,
    isActive: true,
  }));
}

const ROLE_SORT_ORDER: Record<UserRole, number> = {
  admin: 0,
  agent: 1,
  collector: 2,
  poster: 3,
};

export function sortPublicMembers(members: PublicUser[]): PublicUser[] {
  const defaultOrderMap = new Map(RAW_ACCOUNTS.map((a, idx) => [a.id, idx]));
  return [...members].sort((a, b) => {
    const roleDiff = (ROLE_SORT_ORDER[a.role] ?? 9) - (ROLE_SORT_ORDER[b.role] ?? 9);
    if (roleDiff !== 0) return roleDiff;
    const seedA = defaultOrderMap.get(a.id);
    const seedB = defaultOrderMap.get(b.id);
    if (seedA !== undefined && seedB !== undefined) return seedA - seedB;
    if (seedA !== undefined) return -1;
    if (seedB !== undefined) return 1;
    const tsA = Date.parse(a.createdAt || '') || 0;
    const tsB = Date.parse(b.createdAt || '') || 0;
    if (tsA !== tsB) return tsA - tsB;
    return a.name.localeCompare(b.name);
  });
}

let seededThisProcess = false;

export async function ensureSeedTeamMembersInSupabase(): Promise<{
  ok: boolean;
  schemaMissing?: boolean;
}> {
  if (seededThisProcess) {
    return { ok: true };
  }

  try {
    const { count, error: countErr } = await supabaseServer
      .from('team_members')
      .select('id', { count: 'exact', head: true });

    if (countErr) {
      if (isSupabaseSchemaMissing(countErr)) {
        return { ok: false, schemaMissing: true };
      }
      return { ok: false };
    }

    if ((count ?? 0) === 0) {
      const nowIso = new Date().toISOString();
      const seedRows = RAW_ACCOUNTS.map((acct) => {
        const { hash, salt } = hashPasswordWithSalt(acct.secret);
        return {
          id: acct.id,
          name: acct.name,
          email: acct.email,
          role: acct.role,
          title: acct.title,
          avatar_initials: acct.avatarInitials,
          password_hash: hash,
          password_salt: salt,
          is_active: true,
          created_at: nowIso,
          updated_at: nowIso,
        };
      });

      const { error: insertErr } = await supabaseServer
        .from('team_members')
        .upsert(seedRows, { onConflict: 'id', ignoreDuplicates: true });

      if (insertErr) {
        if (isSupabaseSchemaMissing(insertErr)) {
          return { ok: false, schemaMissing: true };
        }
        return { ok: false };
      }
    }

    seededThisProcess = true;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function listTeamMembersFromServer(options?: {
  includeInactive?: boolean;
}): Promise<{
  members: PublicUser[];
  schemaMissing?: boolean;
  fromFallback?: boolean;
}> {
  const seedRes = await ensureSeedTeamMembersInSupabase();
  if (seedRes.schemaMissing) {
    return {
      members: getDefaultPublicDirectory(),
      schemaMissing: true,
      fromFallback: true,
    };
  }

  try {
    let query = supabaseServer
      .from('team_members')
      .select('id, name, email, role, title, avatar_initials, is_active, created_at');
    if (!options?.includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) {
      return {
        members: getDefaultPublicDirectory(),
        schemaMissing: isSupabaseSchemaMissing(error),
        fromFallback: true,
      };
    }

    const mapped = sortPublicMembers(
      ((data ?? []) as TeamMemberRow[]).map(rowToPublicUser)
    );
    return {
      members: mapped.length > 0 || options?.includeInactive ? mapped : getDefaultPublicDirectory(),
      schemaMissing: false,
      fromFallback: false,
    };
  } catch {
    return {
      members: getDefaultPublicDirectory(),
      fromFallback: true,
    };
  }
}

export async function authenticateServerTeamUser(
  rawUsername: string,
  password: string
): Promise<{ ok: true; user: PublicUser } | { ok: false; reason: 'invalid' | 'inactive' }> {
  const normalizedUsername = normalizeMemberUsername(rawUsername);
  if (!normalizedUsername || !password) {
    return { ok: false, reason: 'invalid' };
  }

  const seedRes = await ensureSeedTeamMembersInSupabase();
  if (!seedRes.schemaMissing) {
    try {
      const { data, error } = await supabaseServer
        .from('team_members')
        .select(
          'id, name, email, role, title, avatar_initials, password_hash, password_salt, is_active, created_at'
        )
        .ilike('email', normalizedUsername)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        const row = data as TeamMemberRow;
        const validPw = verifyScryptPassword(
          password,
          row.password_salt ?? '',
          row.password_hash ?? ''
        );
        if (!validPw) {
          return { ok: false, reason: 'invalid' };
        }
        if (row.is_active === false) {
          return { ok: false, reason: 'inactive' };
        }
        return { ok: true, user: rowToPublicUser(row) };
      }

      if (!error && !data) {
        // Authoritatively queried team_members and no account matched this username
        return { ok: false, reason: 'invalid' };
      }
    } catch {
      // Network error -> fall back cleanly below
    }
  }

  const matched = SERVER_TEAM_USERS.find(
    (u) => u.email.toLowerCase() === normalizedUsername
  );
  if (!matched) return { ok: false, reason: 'invalid' };
  if (!verifyPasswordHash(password, matched.passwordHash)) {
    return { ok: false, reason: 'invalid' };
  }
  return {
    ok: true,
    user: {
      id: matched.id,
      name: matched.name,
      email: matched.email,
      role: matched.role,
      title: matched.title,
      avatarInitials: matched.avatarInitials,
      isActive: true,
    },
  };
}

export async function createTeamMemberInSupabase(input: {
  name: string;
  email: string;
  role: string;
  password: string;
  title?: string;
}): Promise<{
  ok: boolean;
  status: number;
  member?: PublicUser;
  schemaMissing?: boolean;
  error?: string;
}> {
  const seedRes = await ensureSeedTeamMembersInSupabase();
  if (seedRes.schemaMissing) {
    return {
      ok: false,
      status: 503,
      schemaMissing: true,
      error:
        'Supabase table "team_members" does not exist yet. Open Google Sheets Sync -> Copy Supabase SQL and execute it in Supabase SQL Editor.',
    };
  }

  const { data: existingRows, error: listErr } = await supabaseServer
    .from('team_members')
    .select('id, email');

  if (listErr) {
    return {
      ok: false,
      status: isSupabaseSchemaMissing(listErr) ? 503 : 500,
      schemaMissing: isSupabaseSchemaMissing(listErr),
      error: listErr.message,
    };
  }

  const existingList = (existingRows ?? []) as Array<{ id: string; email: string }>;
  const validation = validateNewTeamMemberInput(input, existingList);
  if (validation.ok === false) {
    const isDuplicate = validation.error.toLowerCase().includes('already in use');
    return { ok: false, status: isDuplicate ? 409 : 400, error: validation.error };
  }

  const existingIds = new Set(existingList.map((r) => r.id));
  const id = buildUniqueMemberId(
    validation.normalized.name,
    validation.normalized.role,
    existingIds
  );
  const { hash, salt } = hashPasswordWithSalt(validation.normalized.password);
  const nowIso = new Date().toISOString();

  const row = {
    id,
    name: validation.normalized.name,
    email: validation.normalized.email,
    role: validation.normalized.role,
    title: validation.normalized.title,
    avatar_initials: buildAvatarInitials(validation.normalized.name),
    password_hash: hash,
    password_salt: salt,
    is_active: true,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { data: inserted, error: insertErr } = await supabaseServer
    .from('team_members')
    .insert(row)
    .select('id, name, email, role, title, avatar_initials, is_active, created_at')
    .single();

  if (insertErr || !inserted) {
    const isUnique =
      insertErr?.code === '23505' ||
      (insertErr?.message ?? '').toLowerCase().includes('duplicate');
    return {
      ok: false,
      status: isUnique ? 409 : 500,
      error: isUnique
        ? `Username "${row.email}" is already in use.`
        : insertErr?.message || 'Failed to create team member.',
    };
  }

  return {
    ok: true,
    status: 201,
    member: rowToPublicUser(inserted as TeamMemberRow),
  };
}

export async function updateTeamMemberInSupabase(
  memberId: string,
  actingAdminId: string,
  patch: {
    name?: string;
    role?: UserRole;
    title?: string;
    isActive?: boolean;
    password?: string;
  }
): Promise<{
  ok: boolean;
  status: number;
  member?: PublicUser;
  previousMember?: PublicUser;
  schemaMissing?: boolean;
  error?: string;
}> {
  const seedRes = await ensureSeedTeamMembersInSupabase();
  if (seedRes.schemaMissing) {
    return {
      ok: false,
      status: 503,
      schemaMissing: true,
      error:
        'Supabase table "team_members" does not exist yet. Open Google Sheets Sync -> Copy Supabase SQL and execute it in Supabase SQL Editor.',
    };
  }

  const { data: existing, error: fetchErr } = await supabaseServer
    .from('team_members')
    .select('id, name, email, role, title, avatar_initials, is_active, created_at')
    .eq('id', memberId)
    .maybeSingle();

  if (fetchErr) {
    return {
      ok: false,
      status: isSupabaseSchemaMissing(fetchErr) ? 503 : 500,
      schemaMissing: isSupabaseSchemaMissing(fetchErr),
      error: fetchErr.message,
    };
  }

  if (!existing) {
    return { ok: false, status: 404, error: 'Team member not found.' };
  }

  const existingRow = existing as TeamMemberRow;
  const previousMember = rowToPublicUser(existingRow);

  if (patch.isActive === false) {
    if (memberId === actingAdminId) {
      return {
        ok: false,
        status: 400,
        error: 'You cannot deactivate your own active Admin account.',
      };
    }
    if (existingRow.role === 'admin') {
      return {
        ok: false,
        status: 400,
        error: 'Primary Admin accounts cannot be deactivated.',
      };
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof patch.name === 'string') {
    const cleanName = patch.name.trim();
    if (cleanName.length < 2) {
      return { ok: false, status: 400, error: 'Full Name must be at least 2 characters.' };
    }
    updates.name = cleanName;
    updates.avatar_initials = buildAvatarInitials(cleanName);
  }

  if (typeof patch.role === 'string') {
    if (existingRow.role === 'admin' && patch.role !== 'admin') {
      return {
        ok: false,
        status: 400,
        error: 'Primary Admin role cannot be downgraded.',
      };
    }
    if (!['admin', 'agent', 'collector', 'poster'].includes(patch.role)) {
      return { ok: false, status: 400, error: 'Invalid team member role.' };
    }
    updates.role = patch.role;
    if (typeof patch.title !== 'string') {
      updates.title = defaultTitleForRole(patch.role);
    }
  }

  if (typeof patch.title === 'string') {
    const cleanTitle = patch.title.trim();
    updates.title = cleanTitle || defaultTitleForRole((updates.role as UserRole) || existingRow.role);
  }

  if (typeof patch.isActive === 'boolean') {
    updates.is_active = patch.isActive;
  }

  if (typeof patch.password === 'string' && patch.password.length > 0) {
    const pwCheck = validatePasswordResetInput(patch.password);
    if (pwCheck.ok === false) {
      return { ok: false, status: 400, error: pwCheck.error };
    }
    const { hash, salt } = hashPasswordWithSalt(patch.password);
    updates.password_hash = hash;
    updates.password_salt = salt;
  }

  const { data: updated, error: updateErr } = await supabaseServer
    .from('team_members')
    .update(updates)
    .eq('id', memberId)
    .select('id, name, email, role, title, avatar_initials, is_active, created_at')
    .single();

  if (updateErr || !updated) {
    return {
      ok: false,
      status: 500,
      error: updateErr?.message || 'Failed to update team member.',
    };
  }

  return {
    ok: true,
    status: 200,
    member: rowToPublicUser(updated as TeamMemberRow),
    previousMember,
  };
}

export async function deleteTeamMemberInSupabase(
  memberId: string,
  actingAdminId: string
): Promise<{
  ok: boolean;
  status: number;
  removedMember?: PublicUser;
  schemaMissing?: boolean;
  error?: string;
}> {
  const seedRes = await ensureSeedTeamMembersInSupabase();
  if (seedRes.schemaMissing) {
    return {
      ok: false,
      status: 503,
      schemaMissing: true,
      error:
        'Supabase table "team_members" does not exist yet. Open Google Sheets Sync -> Copy Supabase SQL and execute it in Supabase SQL Editor.',
    };
  }

  if (memberId === actingAdminId || memberId === 'admin-1') {
    return {
      ok: false,
      status: 400,
      error: 'You cannot remove your own or the primary Admin account.',
    };
  }

  const { data: existing, error: fetchErr } = await supabaseServer
    .from('team_members')
    .select('id, name, email, role, title, avatar_initials, is_active, created_at')
    .eq('id', memberId)
    .maybeSingle();

  if (fetchErr) {
    return {
      ok: false,
      status: isSupabaseSchemaMissing(fetchErr) ? 503 : 500,
      schemaMissing: isSupabaseSchemaMissing(fetchErr),
      error: fetchErr.message,
    };
  }

  if (!existing) {
    return { ok: false, status: 404, error: 'Team member not found.' };
  }

  const existingMember = rowToPublicUser(existing as TeamMemberRow);
  if (existingMember.role === 'admin') {
    return { ok: false, status: 400, error: 'Admin accounts cannot be removed.' };
  }

  const { error: deleteErr } = await supabaseServer
    .from('team_members')
    .delete()
    .eq('id', memberId);

  if (deleteErr) {
    return {
      ok: false,
      status: 500,
      error: deleteErr.message,
    };
  }

  return {
    ok: true,
    status: 200,
    removedMember: existingMember,
  };
}
