import { DEMO_USERS } from '../data/seedData';
import { supabase } from '../lib/supabase';
import { User, UserRole } from '../types';
import {
  buildAvatarInitials,
  buildUniqueMemberId,
  defaultTitleForRole,
  normalizeMemberUsername,
  stripUserPassword,
  validateNewTeamMemberInput,
  validatePasswordResetInput,
} from './teamLogic';
import {
  hashPasswordSha256,
  isSha256HashFormat,
  verifySha256Password,
} from './webCryptoAuth';

interface DirectTeamMemberRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  avatar_initials: string;
  password_hash?: string;
  password_salt?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const ROLE_SORT_ORDER: Record<UserRole, number> = {
  admin: 0,
  agent: 1,
  collector: 2,
  poster: 3,
};

export function isSupabaseTeamSchemaMissing(
  err: { code?: string; message?: string } | null
): boolean {
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

function rowToClientUser(row: DirectTeamMemberRow): User {
  return stripUserPassword({
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: row.role,
    title: String(row.title || defaultTitleForRole(row.role)),
    avatarInitials: String(row.avatar_initials || buildAvatarInitials(String(row.name))),
    isActive: row.is_active !== false,
    createdAt: typeof row.created_at === 'string' ? row.created_at : undefined,
  });
}

function sortTeamMembers(members: User[]): User[] {
  const defaultOrder = new Map(DEMO_USERS.map((u, idx) => [u.id, idx]));
  return [...members].sort((a, b) => {
    const roleDiff = (ROLE_SORT_ORDER[a.role] ?? 9) - (ROLE_SORT_ORDER[b.role] ?? 9);
    if (roleDiff !== 0) return roleDiff;
    const seedA = defaultOrder.get(a.id);
    const seedB = defaultOrder.get(b.id);
    if (seedA !== undefined && seedB !== undefined) return seedA - seedB;
    if (seedA !== undefined) return -1;
    if (seedB !== undefined) return 1;
    const tsA = Date.parse(a.createdAt || '') || 0;
    const tsB = Date.parse(b.createdAt || '') || 0;
    if (tsA !== tsB) return tsA - tsB;
    return a.name.localeCompare(b.name);
  });
}

function formatSchemaMissingError(): string {
  return 'Supabase table "team_members" does not exist yet. Open Google Sheets Sync -> Copy Supabase SQL and execute it in Supabase SQL Editor.';
}

export async function ensureSeedTeamMembersDirect(): Promise<{
  ok: boolean;
  schemaMissing?: boolean;
  error?: string;
}> {
  try {
    const { count, error: countErr } = await supabase
      .from('team_members')
      .select('id', { count: 'exact', head: true });

    if (countErr) {
      const schemaMissing = isSupabaseTeamSchemaMissing(countErr);
      return {
        ok: false,
        schemaMissing,
        error: schemaMissing ? formatSchemaMissingError() : countErr.message,
      };
    }

    if ((count ?? 0) === 0) {
      const nowIso = new Date().toISOString();
      const seedRows = await Promise.all(
        DEMO_USERS.map(async (acct) => {
          const { hash, salt } = await hashPasswordSha256(acct.password);
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
        })
      );

      const { error: upsertErr } = await supabase
        .from('team_members')
        .upsert(seedRows, { onConflict: 'id', ignoreDuplicates: true });

      if (upsertErr) {
        const schemaMissing = isSupabaseTeamSchemaMissing(upsertErr);
        return {
          ok: false,
          schemaMissing,
          error: schemaMissing ? formatSchemaMissingError() : upsertErr.message,
        };
      }
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to reach Supabase team_members table.',
    };
  }
}

export async function fetchTeamMembersDirect(includeInactive: boolean): Promise<{
  ok: boolean;
  members?: User[];
  schemaMissing?: boolean;
  error?: string;
}> {
  const seedRes = await ensureSeedTeamMembersDirect();
  if (!seedRes.ok) {
    return {
      ok: false,
      schemaMissing: seedRes.schemaMissing,
      error: seedRes.error,
    };
  }

  try {
    let query = supabase
      .from('team_members')
      .select('id, name, email, role, title, avatar_initials, is_active, created_at');
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) {
      const schemaMissing = isSupabaseTeamSchemaMissing(error);
      return {
        ok: false,
        schemaMissing,
        error: schemaMissing ? formatSchemaMissingError() : error.message,
      };
    }

    const mapped = sortTeamMembers(
      ((data ?? []) as DirectTeamMemberRow[]).map(rowToClientUser)
    );
    return { ok: true, members: mapped, schemaMissing: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to fetch team members from Supabase.',
    };
  }
}

export async function createTeamMemberDirect(input: {
  name: string;
  email: string;
  role: UserRole;
  password: string;
  title?: string;
}): Promise<{
  ok: boolean;
  member?: User;
  schemaMissing?: boolean;
  error?: string;
}> {
  const seedRes = await ensureSeedTeamMembersDirect();
  if (!seedRes.ok) {
    return {
      ok: false,
      schemaMissing: seedRes.schemaMissing,
      error: seedRes.error ?? 'Failed to initialize Supabase team_members table.',
    };
  }

  try {
    const { data: existingRows, error: listErr } = await supabase
      .from('team_members')
      .select('id, email');

    if (listErr) {
      const schemaMissing = isSupabaseTeamSchemaMissing(listErr);
      return {
        ok: false,
        schemaMissing,
        error: schemaMissing ? formatSchemaMissingError() : listErr.message,
      };
    }

    const existingList = (existingRows ?? []) as Array<{ id: string; email: string }>;
    const validation = validateNewTeamMemberInput(input, existingList);
    if (validation.ok === false) {
      return { ok: false, error: validation.error };
    }

    const existingIds = new Set(existingList.map((r) => r.id));
    const id = buildUniqueMemberId(
      validation.normalized.name,
      validation.normalized.role,
      existingIds
    );
    const { hash, salt } = await hashPasswordSha256(validation.normalized.password);
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

    const { data: inserted, error: insertErr } = await supabase
      .from('team_members')
      .insert(row)
      .select('id, name, email, role, title, avatar_initials, is_active, created_at')
      .single();

    if (insertErr || !inserted) {
      const schemaMissing = isSupabaseTeamSchemaMissing(insertErr);
      const isUnique =
        insertErr?.code === '23505' ||
        (insertErr?.message ?? '').toLowerCase().includes('duplicate');
      return {
        ok: false,
        schemaMissing,
        error: isUnique
          ? `Username "${row.email}" is already in use.`
          : schemaMissing
          ? formatSchemaMissingError()
          : insertErr?.message || 'Failed to add team member in Supabase.',
      };
    }

    return {
      ok: true,
      member: rowToClientUser(inserted as DirectTeamMemberRow),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to create team member in Supabase.',
    };
  }
}

export async function updateTeamMemberDirect(
  memberId: string,
  actingAdminId: string | undefined,
  patch: {
    name?: string;
    role?: UserRole;
    title?: string;
    isActive?: boolean;
    password?: string;
  }
): Promise<{
  ok: boolean;
  member?: User;
  previousMember?: User;
  schemaMissing?: boolean;
  error?: string;
}> {
  const seedRes = await ensureSeedTeamMembersDirect();
  if (!seedRes.ok) {
    return {
      ok: false,
      schemaMissing: seedRes.schemaMissing,
      error: seedRes.error ?? 'Failed to access Supabase team_members table.',
    };
  }

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('team_members')
      .select('id, name, email, role, title, avatar_initials, is_active, created_at')
      .eq('id', memberId)
      .maybeSingle();

    if (fetchErr) {
      const schemaMissing = isSupabaseTeamSchemaMissing(fetchErr);
      return {
        ok: false,
        schemaMissing,
        error: schemaMissing ? formatSchemaMissingError() : fetchErr.message,
      };
    }

    if (!existing) {
      return { ok: false, error: 'Team member not found.' };
    }

    const existingRow = existing as DirectTeamMemberRow;
    const previousMember = rowToClientUser(existingRow);

    if (patch.isActive === false) {
      if (actingAdminId && memberId === actingAdminId) {
        return { ok: false, error: 'You cannot deactivate your own active Admin account.' };
      }
      if (existingRow.role === 'admin') {
        return { ok: false, error: 'Primary Admin accounts cannot be deactivated.' };
      }
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof patch.name === 'string') {
      const cleanName = patch.name.trim();
      if (cleanName.length < 2) {
        return { ok: false, error: 'Full Name must be at least 2 characters.' };
      }
      updates.name = cleanName;
      updates.avatar_initials = buildAvatarInitials(cleanName);
    }

    if (typeof patch.role === 'string') {
      if (existingRow.role === 'admin' && patch.role !== 'admin') {
        return { ok: false, error: 'Primary Admin role cannot be downgraded.' };
      }
      if (!['admin', 'agent', 'collector', 'poster'].includes(patch.role)) {
        return { ok: false, error: 'Invalid team member role.' };
      }
      updates.role = patch.role;
      if (typeof patch.title !== 'string') {
        updates.title = defaultTitleForRole(patch.role);
      }
    }

    if (typeof patch.title === 'string') {
      const cleanTitle = patch.title.trim();
      updates.title =
        cleanTitle || defaultTitleForRole((updates.role as UserRole) || existingRow.role);
    }

    if (typeof patch.isActive === 'boolean') {
      updates.is_active = patch.isActive;
    }

    if (typeof patch.password === 'string' && patch.password.length > 0) {
      const pwCheck = validatePasswordResetInput(patch.password);
      if (pwCheck.ok === false) {
        return { ok: false, error: pwCheck.error };
      }
      const { hash, salt } = await hashPasswordSha256(patch.password);
      updates.password_hash = hash;
      updates.password_salt = salt;
    }

    const { data: updated, error: updateErr } = await supabase
      .from('team_members')
      .update(updates)
      .eq('id', memberId)
      .select('id, name, email, role, title, avatar_initials, is_active, created_at')
      .single();

    if (updateErr || !updated) {
      return {
        ok: false,
        schemaMissing: isSupabaseTeamSchemaMissing(updateErr),
        error: updateErr?.message || 'Failed to update team member in Supabase.',
      };
    }

    return {
      ok: true,
      member: rowToClientUser(updated as DirectTeamMemberRow),
      previousMember,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to update team member in Supabase.',
    };
  }
}

export async function deleteTeamMemberDirect(
  memberId: string,
  actingAdminId: string | undefined
): Promise<{
  ok: boolean;
  removedMember?: User;
  schemaMissing?: boolean;
  error?: string;
}> {
  const seedRes = await ensureSeedTeamMembersDirect();
  if (!seedRes.ok) {
    return {
      ok: false,
      schemaMissing: seedRes.schemaMissing,
      error: seedRes.error ?? 'Failed to access Supabase team_members table.',
    };
  }

  if ((actingAdminId && memberId === actingAdminId) || memberId === 'admin-1') {
    return {
      ok: false,
      error: 'You cannot remove your own or the primary Admin account.',
    };
  }

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('team_members')
      .select('id, name, email, role, title, avatar_initials, is_active, created_at')
      .eq('id', memberId)
      .maybeSingle();

    if (fetchErr) {
      const schemaMissing = isSupabaseTeamSchemaMissing(fetchErr);
      return {
        ok: false,
        schemaMissing,
        error: schemaMissing ? formatSchemaMissingError() : fetchErr.message,
      };
    }

    if (!existing) {
      return { ok: false, error: 'Team member not found.' };
    }

    const existingMember = rowToClientUser(existing as DirectTeamMemberRow);
    if (existingMember.role === 'admin') {
      return { ok: false, error: 'Admin accounts cannot be removed.' };
    }

    const { error: deleteErr } = await supabase
      .from('team_members')
      .delete()
      .eq('id', memberId);

    if (deleteErr) {
      return {
        ok: false,
        schemaMissing: isSupabaseTeamSchemaMissing(deleteErr),
        error: deleteErr.message,
      };
    }

    return { ok: true, removedMember: existingMember };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to remove team member from Supabase.',
    };
  }
}

export async function authenticateAgainstSupabaseDirect(
  rawUsername: string,
  password: string
): Promise<{
  ok: boolean;
  user?: User;
  authoritative?: boolean;
  schemaMissing?: boolean;
  error?: string;
}> {
  const normalizedUsername = normalizeMemberUsername(rawUsername);
  if (!normalizedUsername || !password) {
    return {
      ok: false,
      authoritative: true,
      error: 'Invalid username or password. Please verify your assigned RunBD credentials.',
    };
  }

  const seedRes = await ensureSeedTeamMembersDirect();
  if (!seedRes.ok) {
    return {
      ok: false,
      authoritative: false,
      schemaMissing: seedRes.schemaMissing,
      error: seedRes.error,
    };
  }

  try {
    const { data, error } = await supabase
      .from('team_members')
      .select(
        'id, name, email, role, title, avatar_initials, password_hash, password_salt, is_active, created_at'
      )
      .ilike('email', normalizedUsername)
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        authoritative: false,
        schemaMissing: isSupabaseTeamSchemaMissing(error),
        error: error.message,
      };
    }

    if (!data) {
      return {
        ok: false,
        authoritative: true,
        error: 'Invalid username or password. Please verify your assigned RunBD credentials.',
      };
    }

    const row = data as DirectTeamMemberRow;
    const storedHash = row.password_hash ?? '';
    const storedSalt = row.password_salt ?? '';

    let passwordMatches = false;
    if (isSha256HashFormat(storedHash)) {
      passwordMatches = await verifySha256Password(password, storedSalt, storedHash);
    } else {
      // Legacy scrypt row seeded by an older Express process: allow default seed passwords and upgrade hash cleanly
      const defaultAccount = DEMO_USERS.find(
        (u) => u.id === row.id && u.email.toLowerCase() === normalizedUsername
      );
      if (defaultAccount && defaultAccount.password === password) {
        passwordMatches = true;
        try {
          const upgraded = await hashPasswordSha256(password);
          await supabase
            .from('team_members')
            .update({
              password_hash: upgraded.hash,
              password_salt: upgraded.salt,
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id);
        } catch {
          // Non-fatal hash upgrade failure
        }
      }
    }

    if (!passwordMatches) {
      return {
        ok: false,
        authoritative: true,
        error: 'Invalid username or password. Please verify your assigned RunBD credentials.',
      };
    }

    if (row.is_active === false) {
      return {
        ok: false,
        authoritative: true,
        error: 'This account has been deactivated by an Admin. Contact your Supervisor.',
      };
    }

    return {
      ok: true,
      authoritative: true,
      user: rowToClientUser(row),
    };
  } catch (err) {
    return {
      ok: false,
      authoritative: false,
      error: err instanceof Error ? err.message : 'Supabase authentication failed.',
    };
  }
}

export async function restoreUserFromSupabaseDirect(
  savedUserId: string
): Promise<{ authoritative: boolean; user: User | null }> {
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select('id, name, email, role, title, avatar_initials, is_active, created_at')
      .eq('id', savedUserId)
      .maybeSingle();

    if (error) {
      return { authoritative: false, user: null };
    }
    if (!data) {
      return { authoritative: true, user: null };
    }
    const row = data as DirectTeamMemberRow;
    if (row.is_active === false) {
      return { authoritative: true, user: null };
    }
    return { authoritative: true, user: rowToClientUser(row) };
  } catch {
    return { authoritative: false, user: null };
  }
}
