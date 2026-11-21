import { DEMO_USERS } from '../data/seedData';
import {
  AppSettings,
  AuditLog,
  CallLog,
  ContentPost,
  DuplicateAttempt,
  Lead,
  PaidCustomer,
  User,
} from '../types';
import { authenticateUser } from './leadLogic';

let inMemoryAuthToken: string | null = null;

export function setInMemoryAuthToken(token: string | null): void {
  inMemoryAuthToken = token;
}

export function getInMemoryAuthToken(): string | null {
  return inMemoryAuthToken;
}

async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-Requested-With', 'RunBD-Client');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryAuthToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryAuthToken}`);
  }
  return fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });
}

function toClientUser(raw: Omit<User, 'password'> & { password?: string }): User {
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    password: '',
    role: raw.role,
    title: raw.title,
    avatarInitials: raw.avatarInitials,
  };
}

export async function loginWithServer(
  username: string,
  password: string
): Promise<{ ok: boolean; user?: User; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as {
        user?: Omit<User, 'password'>;
        token?: string;
        error?: string;
      };
      if (res.ok && data.user) {
        if (data.token) {
          setInMemoryAuthToken(data.token);
        }
        return { ok: true, user: toClientUser(data.user) };
      }
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error:
            data.error ??
            'Invalid username or password. Please verify your assigned RunBD credentials.',
        };
      }
    }
  } catch {
    // Backend /api/auth/login not reachable (e.g., static Shared App deployment) -> fall through cleanly
  }

  const matched = authenticateUser(DEMO_USERS, username, password);
  if (!matched) {
    return {
      ok: false,
      error:
        'Invalid username or password. Please verify your assigned RunBD credentials.',
    };
  }
  return { ok: true, user: toClientUser(matched) };
}

export async function restoreServerSession(
  savedUserId?: string | null
): Promise<User | null> {
  try {
    const res = await apiFetch('/api/auth/session', { method: 'GET' });
    if (res.status === 401 || res.status === 403) {
      return null;
    }
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = (await res.json()) as { user?: Omit<User, 'password'> };
      return data.user ? toClientUser(data.user) : null;
    }
  } catch {
    // Fall through to static session lookup when backend is not present
  }

  if (!savedUserId) return null;
  const matched = DEMO_USERS.find((u) => u.id === savedUserId);
  return matched ? toClientUser(matched) : null;
}

export async function logoutFromServer(): Promise<void> {
  setInMemoryAuthToken(null);
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore logout network error
  }
}

export async function fetchBootstrapFromDb(): Promise<{
  ok: boolean;
  leads?: Lead[];
  callLogs?: CallLog[];
  contentPosts?: ContentPost[];
  paidCustomers?: PaidCustomer[];
  duplicateAttempts?: DuplicateAttempt[];
  auditLogs?: AuditLog[];
  settings?: AppSettings;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/bootstrap', { method: 'GET' });
    const data = (await res.json()) as {
      ok?: boolean;
      leads?: Lead[];
      callLogs?: CallLog[];
      contentPosts?: ContentPost[];
      paidCustomers?: PaidCustomer[];
      duplicateAttempts?: DuplicateAttempt[];
      auditLogs?: AuditLog[];
      settings?: AppSettings;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      leads: data.leads ?? [],
      callLogs: data.callLogs ?? [],
      contentPosts: data.contentPosts ?? [],
      paidCustomers: data.paidCustomers ?? [],
      duplicateAttempts: data.duplicateAttempts ?? [],
      auditLogs: data.auditLogs ?? [],
      settings: data.settings,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Database fetch failed.',
    };
  }
}

export async function checkLeadDuplicateInDb(
  phone: string,
  facebookLink: string
): Promise<{
  ok: boolean;
  isDuplicate: boolean;
  matchedBy?: 'phone' | 'facebook';
  existingLead?: Lead;
  error?: string;
}> {
  try {
    const params = new URLSearchParams();
    if (phone.trim()) params.set('phone', phone.trim());
    if (facebookLink.trim()) params.set('facebookLink', facebookLink.trim());
    const res = await apiFetch(`/api/leads/check-duplicate?${params.toString()}`, {
      method: 'GET',
    });
    const data = (await res.json()) as {
      ok?: boolean;
      isDuplicate?: boolean;
      matchedBy?: 'phone' | 'facebook';
      existingLead?: Lead;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        isDuplicate: false,
        error: data.error ?? `HTTP ${res.status}`,
      };
    }
    return {
      ok: Boolean(data.ok),
      isDuplicate: Boolean(data.isDuplicate),
      matchedBy: data.matchedBy,
      existingLead: data.existingLead,
      error: data.error,
    };
  } catch (err) {
    return {
      ok: false,
      isDuplicate: false,
      error: err instanceof Error ? err.message : 'Duplicate check failed.',
    };
  }
}

export async function createLeadInDb(
  lead: Lead,
  nextRoundRobinIndex: number
): Promise<{
  ok: boolean;
  isDuplicate?: boolean;
  matchedBy?: 'phone' | 'facebook';
  existingLead?: Lead;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/leads', {
      method: 'POST',
      body: JSON.stringify({ lead, nextRoundRobinIndex }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      isDuplicate?: boolean;
      matchedBy?: 'phone' | 'facebook';
      existingLead?: Lead;
      error?: string;
    };
    if (res.status === 409 && data.isDuplicate && data.existingLead) {
      return {
        ok: false,
        isDuplicate: true,
        matchedBy: data.matchedBy ?? 'phone',
        existingLead: data.existingLead,
      };
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to save lead.',
    };
  }
}

export async function importLeadsBatchInDb(
  leads: Lead[],
  nextRoundRobinIndex: number
): Promise<{
  ok: boolean;
  accepted?: Lead[];
  duplicates?: Array<{
    lead: Lead;
    matchedBy: 'phone' | 'facebook';
    existingLead: Lead;
  }>;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/leads/batch', {
      method: 'POST',
      body: JSON.stringify({ leads, nextRoundRobinIndex }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      accepted?: Lead[];
      duplicates?: Array<{
        lead: Lead;
        matchedBy: 'phone' | 'facebook';
        existingLead: Lead;
      }>;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      accepted: data.accepted ?? [],
      duplicates: data.duplicates ?? [],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Batch import failed.',
    };
  }
}

export async function updateLeadInDb(
  lead: Lead,
  paidCustomer?: PaidCustomer
): Promise<void> {
  await apiFetch(`/api/leads/${encodeURIComponent(lead.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ lead, paidCustomer }),
  });
}

export async function saveCallLogInDb(
  updatedLead: Lead,
  callLog: CallLog,
  paidCustomer?: PaidCustomer
): Promise<void> {
  await apiFetch('/api/call-logs', {
    method: 'POST',
    body: JSON.stringify({ updatedLead, callLog, paidCustomer }),
  });
}

export async function checkPostDuplicateInDb(
  facebookLink: string,
  websiteLink: string
): Promise<{
  ok: boolean;
  isDuplicate: boolean;
  matchedField?: 'Facebook Link' | 'Website Link';
  existingPost?: ContentPost;
  error?: string;
}> {
  try {
    const params = new URLSearchParams();
    if (facebookLink.trim()) params.set('facebookLink', facebookLink.trim());
    if (websiteLink.trim()) params.set('websiteLink', websiteLink.trim());
    const res = await apiFetch(`/api/posts/check-duplicate?${params.toString()}`, {
      method: 'GET',
    });
    const data = (await res.json()) as {
      ok?: boolean;
      isDuplicate?: boolean;
      matchedField?: 'Facebook Link' | 'Website Link';
      existingPost?: ContentPost;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        isDuplicate: false,
        error: data.error ?? `HTTP ${res.status}`,
      };
    }
    return {
      ok: Boolean(data.ok),
      isDuplicate: Boolean(data.isDuplicate),
      matchedField: data.matchedField,
      existingPost: data.existingPost,
      error: data.error,
    };
  } catch (err) {
    return {
      ok: false,
      isDuplicate: false,
      error: err instanceof Error ? err.message : 'Post duplicate check failed.',
    };
  }
}

export async function createPostInDb(post: ContentPost): Promise<{
  ok: boolean;
  isDuplicate?: boolean;
  matchedField?: 'Facebook Link' | 'Website Link';
  existingPost?: ContentPost;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ post }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      isDuplicate?: boolean;
      matchedField?: 'Facebook Link' | 'Website Link';
      existingPost?: ContentPost;
      error?: string;
    };
    if (res.status === 409 && data.isDuplicate && data.existingPost) {
      return {
        ok: false,
        isDuplicate: true,
        matchedField: data.matchedField ?? 'Facebook Link',
        existingPost: data.existingPost,
      };
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to save post.',
    };
  }
}

export async function upsertPaidCustomerInDb(
  paidCustomer: PaidCustomer,
  facebookLink = ''
): Promise<void> {
  await apiFetch('/api/paid-customers/upsert', {
    method: 'POST',
    body: JSON.stringify({ paidCustomer, facebookLink }),
  });
}

export async function saveDuplicateAttemptInDb(
  attempt: DuplicateAttempt,
  existingLeadId = ''
): Promise<void> {
  await apiFetch('/api/duplicate-attempts', {
    method: 'POST',
    body: JSON.stringify({ attempt, existingLeadId }),
  });
}

export async function saveAuditLogInDb(log: AuditLog): Promise<void> {
  await apiFetch('/api/audit-logs', {
    method: 'POST',
    body: JSON.stringify({ log }),
  });
}

export async function saveSettingsInDb(settings: AppSettings): Promise<void> {
  await apiFetch('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

export async function syncPulledRecordsToPg(payload: {
  leads?: Lead[];
  callLogs?: CallLog[];
  contentPosts?: ContentPost[];
  paidCustomers?: PaidCustomer[];
}): Promise<void> {
  await apiFetch('/api/sync/batch', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
