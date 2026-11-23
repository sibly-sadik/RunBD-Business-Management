import type { User, UserRole } from '../types/index.ts';

export const MANAGED_TEAM_ROLES: UserRole[] = ['agent', 'collector', 'poster'];

export function stripUserPassword<T extends Omit<User, 'password'> & { password?: string }>(
  user: T
): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password: '',
    role: user.role,
    title: user.title,
    avatarInitials: user.avatarInitials,
    isActive: user.isActive !== false,
    createdAt: user.createdAt,
  };
}

export function buildAvatarInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'RB';
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0] ?? ''}${words[words.length - 1][0] ?? ''}`.toUpperCase();
}

export function defaultTitleForRole(role: UserRole): string {
  if (role === 'admin') return 'Manager';
  if (role === 'agent') return 'Call Center Agent';
  if (role === 'collector') return 'Data Collector';
  return 'Content & Link Poster';
}

export function normalizeMemberUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function buildUniqueMemberId(
  name: string,
  role: UserRole,
  existingIds: ReadonlySet<string>
): string {
  const prefix =
    role === 'admin'
      ? 'admin'
      : role === 'agent'
      ? 'agent'
      : role === 'collector'
      ? 'collector'
      : 'poster';
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'member';
  const baseId = `${prefix}-${slug}`.slice(0, 56);
  if (!existingIds.has(baseId)) {
    return baseId;
  }
  let counter = 2;
  while (existingIds.has(`${baseId}-${counter}`)) {
    counter++;
  }
  return `${baseId}-${counter}`;
}

export interface ValidateCreateMemberInput {
  name: string;
  email: string;
  role: string;
  password: string;
  title?: string;
}

export function validateNewTeamMemberInput(
  input: ValidateCreateMemberInput,
  existingMembers: Array<Pick<User, 'email'>>
): { ok: true; normalized: { name: string; email: string; role: UserRole; title: string; password: string } } | { ok: false; error: string } {
  const name = input.name.trim();
  const email = normalizeMemberUsername(input.email);
  const role = input.role.trim() as UserRole;
  const password = input.password;
  const title = input.title?.trim() || '';

  if (name.length < 2) {
    return { ok: false, error: 'Full Name must be at least 2 characters.' };
  }
  if (!email || email.length < 3 || /\s/.test(email)) {
    return { ok: false, error: 'Username / Email must be at least 3 characters with no spaces (e.g., rakib@runbd).' };
  }
  if (!['agent', 'collector', 'poster'].includes(role)) {
    return { ok: false, error: 'Role must be Call Center Agent, Data Collector, or Content & Link Poster.' };
  }
  if (!password || password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters long.' };
  }
  const duplicate = existingMembers.some(
    (m) => m.email.trim().toLowerCase() === email
  );
  if (duplicate) {
    return { ok: false, error: `Username "${email}" is already in use by another team member.` };
  }

  return {
    ok: true,
    normalized: {
      name,
      email,
      role,
      title: title || defaultTitleForRole(role),
      password,
    },
  };
}

export function validatePasswordResetInput(
  password: string
): { ok: true } | { ok: false; error: string } {
  if (!password || password.length < 6) {
    return { ok: false, error: 'New password must be at least 6 characters long.' };
  }
  return { ok: true };
}

export function getActiveTeamMembers(members: User[]): User[] {
  return members.filter((m) => m.isActive !== false);
}

export function getCallCenterAgents(members: User[], options?: { includeInactive?: boolean }): User[] {
  return members.filter(
    (m) => m.role === 'agent' && (options?.includeInactive ? true : m.isActive !== false)
  );
}

export function getDataCollectors(members: User[], options?: { includeInactive?: boolean }): User[] {
  return members.filter(
    (m) => m.role === 'collector' && (options?.includeInactive ? true : m.isActive !== false)
  );
}

export function getContentPosters(members: User[], options?: { includeInactive?: boolean }): User[] {
  return members.filter(
    (m) => m.role === 'poster' && (options?.includeInactive ? true : m.isActive !== false)
  );
}

export function mergeTeamMembersWithFallback(
  primary: User[],
  fallback: User[]
): User[] {
  const source = primary.length > 0 ? primary : fallback;
  const seen = new Set<string>();
  const result: User[] = [];
  for (const m of source) {
    if (!m || !m.id || seen.has(m.id)) continue;
    seen.add(m.id);
    result.push(stripUserPassword(m));
  }
  return result;
}
