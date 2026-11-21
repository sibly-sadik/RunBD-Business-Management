import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let firestoreQuotaExceeded = false;
const quotaExceededListeners = new Set<() => void>();

export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error) return false;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toLowerCase()
      : '';
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota exceeded')
  );
}

export function isFirestoreQuotaExceeded(): boolean {
  return firestoreQuotaExceeded;
}

export function markFirestoreQuotaExceeded(): void {
  if (firestoreQuotaExceeded) return;
  firestoreQuotaExceeded = true;
  console.warn(
    'Firestore daily free-tier quota exceeded. Switching cloud listeners to local + Google Sheets fallback until quota resets tomorrow.'
  );
  quotaExceededListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener callback errors
    }
  });
}

export function onFirestoreQuotaExceeded(listener: () => void): () => void {
  quotaExceededListeners.add(listener);
  if (firestoreQuotaExceeded) {
    try {
      listener();
    } catch {
      // Ignore
    }
  }
  return () => {
    quotaExceededListeners.delete(listener);
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  if (isFirestoreQuotaError(error)) {
    markFirestoreQuotaExceeded();
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      markFirestoreQuotaExceeded();
      return;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
