import crypto from 'node:crypto';
import type { UserRole } from '../types/index.ts';
import type { PublicUser } from './auth.ts';

interface ServerTeamAccount extends PublicUser {
  passwordHash: string;
}

function hashSeedPassword(plain: string, salt: string): string {
  const derived = crypto.scryptSync(plain, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPasswordHash(plain: string, stored: string): boolean {
  const idx = stored.indexOf(':');
  if (idx <= 0) return false;
  const salt = stored.slice(0, idx);
  const expectedHex = stored.slice(idx + 1);
  const derived = crypto.scryptSync(plain, salt, 32);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

const RAW_ACCOUNTS: Array<{
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
  passwordHash: hashSeedPassword(acct.secret, acct.id),
}));

export function authenticateServerTeamUser(
  rawUsername: string,
  password: string
): PublicUser | null {
  const normalizedUsername = rawUsername.trim().toLowerCase();
  if (!normalizedUsername || !password) return null;
  const matched = SERVER_TEAM_USERS.find(
    (u) => u.email.toLowerCase() === normalizedUsername
  );
  if (!matched) return null;
  if (!verifyPasswordHash(password, matched.passwordHash)) return null;
  return {
    id: matched.id,
    name: matched.name,
    email: matched.email,
    role: matched.role,
    title: matched.title,
    avatarInitials: matched.avatarInitials,
  };
}
