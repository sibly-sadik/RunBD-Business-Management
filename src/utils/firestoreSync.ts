import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Unsubscribe,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  isFirestoreQuotaError,
  isFirestoreQuotaExceeded,
  markFirestoreQuotaExceeded,
  onFirestoreQuotaExceeded,
  OperationType,
} from '../firebase';
import {
  AppSettings,
  AuditLog,
  CallLog,
  ContentPost,
  DuplicateAttempt,
  Lead,
  PaidCustomer,
} from '../types';

const activeSubscriptions = new Set<Unsubscribe>();

onFirestoreQuotaExceeded(() => {
  activeSubscriptions.forEach((unsub) => {
    try {
      unsub();
    } catch {
      // Ignore cleanup errors
    }
  });
  activeSubscriptions.clear();
});

function trackSubscription(unsub: Unsubscribe): Unsubscribe {
  activeSubscriptions.add(unsub);
  return () => {
    activeSubscriptions.delete(unsub);
    unsub();
  };
}

function clampString(value: string | undefined | null, maxLen: number): string {
  return (value ?? '').slice(0, maxLen);
}

function clampNullableString(
  value: string | undefined | null,
  maxLen: number
): string | null {
  if (value === null || value === undefined || value === '') return null;
  return value.slice(0, maxLen);
}

function sanitizeLeadForFirestore(lead: Lead): Lead {
  return {
    id: clampString(lead.id, 128),
    customerName: clampString(lead.customerName || 'Unknown', 200),
    phone: clampString(lead.phone, 32),
    rawPhone: clampString(lead.rawPhone, 64),
    facebookLink: clampString(lead.facebookLink, 500),
    normalizedFacebookLink: clampString(lead.normalizedFacebookLink, 500),
    notes: clampString(lead.notes, 2000),
    collectorId: clampString(lead.collectorId, 64),
    collectorName: clampString(lead.collectorName, 100),
    assignedAgentId: clampNullableString(lead.assignedAgentId, 64),
    assignedAgentName: clampNullableString(lead.assignedAgentName, 100),
    status: lead.status,
    followUpAt: clampNullableString(lead.followUpAt, 64),
    lastCallNotes: clampString(lead.lastCallNotes, 2000),
    createdAt: clampString(lead.createdAt, 64),
    updatedAt: clampString(lead.updatedAt, 64),
  };
}

function sanitizeCallLogForFirestore(log: CallLog): CallLog {
  return {
    id: clampString(log.id, 128),
    leadId: clampString(log.leadId, 128),
    customerName: clampString(log.customerName, 200),
    phone: clampString(log.phone, 32),
    agentId: clampString(log.agentId, 64),
    agentName: clampString(log.agentName, 100),
    previousStatus: log.previousStatus,
    newStatus: log.newStatus,
    notes: clampString(log.notes, 2000),
    followUpAt: clampNullableString(log.followUpAt, 64),
    timestamp: clampString(log.timestamp, 64),
  };
}

function sanitizeContentPostForFirestore(post: ContentPost): ContentPost {
  return {
    id: clampString(post.id, 128),
    facebookLink: clampString(post.facebookLink, 1000),
    normalizedFacebookLink: clampString(post.normalizedFacebookLink, 1000),
    websiteLink: clampString(post.websiteLink, 1000),
    normalizedWebsiteLink: clampString(post.normalizedWebsiteLink, 1000),
    note: clampString(post.note, 500),
    posterId: clampString(post.posterId, 64),
    posterName: clampString(post.posterName, 100),
    createdAt: clampString(post.createdAt, 64),
  };
}

function sanitizeAuditLogForFirestore(log: AuditLog): AuditLog {
  return {
    id: clampString(log.id, 128),
    actorId: clampString(log.actorId, 64),
    actorName: clampString(log.actorName, 100),
    actorRole: log.actorRole,
    action: log.action,
    details: clampString(log.details, 1000),
    timestamp: clampString(log.timestamp, 64),
  };
}

function sanitizeDuplicateAttemptForFirestore(
  attempt: DuplicateAttempt
): DuplicateAttempt {
  return {
    id: clampString(attempt.id, 128),
    collectorId: clampString(attempt.collectorId, 64),
    collectorName: clampString(attempt.collectorName, 100),
    attemptedName: clampString(attempt.attemptedName, 200),
    attemptedPhone: clampString(attempt.attemptedPhone, 64),
    attemptedFacebook: clampString(attempt.attemptedFacebook, 500),
    matchedBy: attempt.matchedBy,
    existingCollectorName: clampString(attempt.existingCollectorName, 100),
    existingDate: clampString(attempt.existingDate, 64),
    timestamp: clampString(attempt.timestamp, 64),
  };
}

function sanitizeSettingsForFirestore(settings: AppSettings): AppSettings {
  return {
    autoAssignEnabled: Boolean(settings.autoAssignEnabled),
    roundRobinIndex: Math.max(0, Math.floor(Number(settings.roundRobinIndex) || 0)),
    googleSheetsWebhookUrl: clampString(settings.googleSheetsWebhookUrl, 1000),
    callScript: clampString(settings.callScript, 10000),
    lastSyncedAt: clampNullableString(settings.lastSyncedAt, 64),
  };
}

function sanitizePaidCustomerForFirestore(customer: PaidCustomer): PaidCustomer {
  return {
    id: clampString(customer.id, 128),
    leadId: clampString(customer.leadId, 128),
    customerName: clampString(customer.customerName || 'Paid Customer', 200),
    phone: clampString(customer.phone, 32),
    assignedAgentId: clampNullableString(customer.assignedAgentId, 64),
    assignedAgentName: clampNullableString(customer.assignedAgentName, 100),
    confirmedDate: clampString(customer.confirmedDate, 32),
    renewalDate: clampString(customer.renewalDate, 32),
    renewalStatus: customer.renewalStatus,
    lastRenewedAt: clampNullableString(customer.lastRenewedAt, 64),
    notes: clampString(customer.notes, 2000),
    createdAt: clampString(customer.createdAt, 64),
    updatedAt: clampString(customer.updatedAt, 64),
  };
}

export function subscribeToLeads(
  onData: (leads: Lead[]) => void,
  options?: { sinceIso?: string }
): Unsubscribe {
  if (isFirestoreQuotaExceeded()) return () => {};
  const path = 'leads';
  const q = options?.sinceIso
    ? query(
        collection(db, path),
        where('createdAt', '>=', options.sinceIso),
        orderBy('createdAt', 'desc'),
        limit(500)
      )
    : query(collection(db, path), orderBy('createdAt', 'desc'), limit(500));
  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as Lead);
      onData(items);
    },
    (error) => {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded();
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
  return trackSubscription(unsub);
}

export function subscribeToCallLogs(
  onData: (logs: CallLog[]) => void,
  options?: { sinceIso?: string }
): Unsubscribe {
  if (isFirestoreQuotaExceeded()) return () => {};
  const path = 'callLogs';
  const q = options?.sinceIso
    ? query(
        collection(db, path),
        where('timestamp', '>=', options.sinceIso),
        orderBy('timestamp', 'desc'),
        limit(300)
      )
    : query(collection(db, path), orderBy('timestamp', 'desc'), limit(300));
  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as CallLog);
      onData(items);
    },
    (error) => {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded();
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
  return trackSubscription(unsub);
}

export function subscribeToContentPosts(
  onData: (posts: ContentPost[]) => void,
  options?: { sinceIso?: string }
): Unsubscribe {
  if (isFirestoreQuotaExceeded()) return () => {};
  const path = 'contentPosts';
  const q = options?.sinceIso
    ? query(
        collection(db, path),
        where('createdAt', '>=', options.sinceIso),
        orderBy('createdAt', 'desc'),
        limit(250)
      )
    : query(collection(db, path), orderBy('createdAt', 'desc'), limit(250));
  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as ContentPost);
      onData(items);
    },
    (error) => {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded();
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
  return trackSubscription(unsub);
}

export function subscribeToAuditLogs(onData: (logs: AuditLog[]) => void): Unsubscribe {
  if (isFirestoreQuotaExceeded()) return () => {};
  const path = 'auditLogs';
  const q = query(collection(db, path), orderBy('timestamp', 'desc'), limit(150));
  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as AuditLog);
      onData(items);
    },
    (error) => {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded();
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
  return trackSubscription(unsub);
}

export function subscribeToDuplicateAttempts(
  onData: (attempts: DuplicateAttempt[]) => void,
  options?: { sinceIso?: string }
): Unsubscribe {
  if (isFirestoreQuotaExceeded()) return () => {};
  const path = 'duplicateAttempts';
  const q = options?.sinceIso
    ? query(
        collection(db, path),
        where('timestamp', '>=', options.sinceIso),
        orderBy('timestamp', 'desc'),
        limit(100)
      )
    : query(collection(db, path), orderBy('timestamp', 'desc'), limit(100));
  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as DuplicateAttempt);
      onData(items);
    },
    (error) => {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded();
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
  return trackSubscription(unsub);
}

export function subscribeToSettings(
  onData: (settings: AppSettings) => void
): Unsubscribe {
  if (isFirestoreQuotaExceeded()) return () => {};
  const path = 'settings/global';
  const unsub = onSnapshot(
    doc(db, 'settings', 'global'),
    (snapshot) => {
      if (snapshot.exists()) {
        onData(snapshot.data() as AppSettings);
      }
    },
    (error) => {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded();
        return;
      }
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
  return trackSubscription(unsub);
}

export function subscribeToPaidCustomers(
  onData: (customers: PaidCustomer[]) => void
): Unsubscribe {
  if (isFirestoreQuotaExceeded()) return () => {};
  const path = 'paidCustomers';
  const q = query(collection(db, path), orderBy('renewalDate', 'asc'), limit(500));
  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as PaidCustomer);
      onData(items);
    },
    (error) => {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded();
        return;
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
  return trackSubscription(unsub);
}

export async function saveLeadToFirestore(lead: Lead): Promise<void> {
  if (isFirestoreQuotaExceeded()) return;
  const path = `leads/${lead.id}`;
  try {
    await setDoc(doc(db, 'leads', lead.id), sanitizeLeadForFirestore(lead));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveLeadsBatchToFirestore(leads: Lead[]): Promise<void> {
  if (isFirestoreQuotaExceeded() || !leads.length) return;
  const CHUNK_SIZE = 450;
  try {
    for (let i = 0; i < leads.length; i += CHUNK_SIZE) {
      const chunk = leads.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const lead of chunk) {
        batch.set(doc(db, 'leads', lead.id), sanitizeLeadForFirestore(lead));
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'leads');
  }
}

export async function saveCallLogToFirestore(log: CallLog): Promise<void> {
  if (isFirestoreQuotaExceeded()) return;
  const path = `callLogs/${log.id}`;
  try {
    await setDoc(doc(db, 'callLogs', log.id), sanitizeCallLogForFirestore(log));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveContentPostToFirestore(post: ContentPost): Promise<void> {
  if (isFirestoreQuotaExceeded()) return;
  const path = `contentPosts/${post.id}`;
  try {
    await setDoc(doc(db, 'contentPosts', post.id), sanitizeContentPostForFirestore(post));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveAuditLogToFirestore(log: AuditLog): Promise<void> {
  if (isFirestoreQuotaExceeded()) return;
  const path = `auditLogs/${log.id}`;
  try {
    await setDoc(doc(db, 'auditLogs', log.id), sanitizeAuditLogForFirestore(log));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveDuplicateAttemptToFirestore(
  attempt: DuplicateAttempt
): Promise<void> {
  if (isFirestoreQuotaExceeded()) return;
  const path = `duplicateAttempts/${attempt.id}`;
  try {
    await setDoc(
      doc(db, 'duplicateAttempts', attempt.id),
      sanitizeDuplicateAttemptForFirestore(attempt)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveSettingsToFirestore(settings: AppSettings): Promise<void> {
  if (isFirestoreQuotaExceeded()) return;
  const path = 'settings/global';
  try {
    await setDoc(
      doc(db, 'settings', 'global'),
      sanitizeSettingsForFirestore(settings)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function savePaidCustomerToFirestore(customer: PaidCustomer): Promise<void> {
  if (isFirestoreQuotaExceeded()) return;
  const path = `paidCustomers/${customer.id}`;
  try {
    await setDoc(
      doc(db, 'paidCustomers', customer.id),
      sanitizePaidCustomerForFirestore(customer)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function savePaidCustomersBatchToFirestore(
  customers: PaidCustomer[]
): Promise<void> {
  if (isFirestoreQuotaExceeded() || !customers.length) return;
  const CHUNK_SIZE = 450;
  try {
    for (let i = 0; i < customers.length; i += CHUNK_SIZE) {
      const chunk = customers.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const customer of chunk) {
        batch.set(
          doc(db, 'paidCustomers', customer.id),
          sanitizePaidCustomerForFirestore(customer)
        );
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'paidCustomers');
  }
}
