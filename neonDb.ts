export type DocCategory = 'Read Aloud' | 'Live Dictation' | 'Audio Transcript';
export type PlanTier = 'free' | 'pro' | 'runiq_bundle';

export interface TierSpec {
  id: PlanTier;
  name: string;
  badge: string;
  priceLabel: string;
  dailyCharLimit: number;
  maxVaultDocs: number;
  premiumVoices: boolean;
  savedQueue: boolean;
  driverMode: boolean;
  unitEconomicsNote: string;
}

export const TIER_SPECS: Record<PlanTier, TierSpec> = {
  free: {
    id: 'free',
    name: 'Free Starter',
    badge: 'FREE TIER',
    priceLabel: '$0 / mo',
    dailyCharLimit: 5000,
    maxVaultDocs: 5,
    premiumVoices: false,
    savedQueue: false,
    driverMode: false,
    unitEconomicsNote: 'Built-in browser voices • $0.00 marginal TTS cost',
  },
  pro: {
    id: 'pro',
    name: 'r2mIQ Pro',
    badge: 'PRO STUDIO',
    priceLabel: '$4.99 / mo',
    dailyCharLimit: 150000,
    maxVaultDocs: 9999,
    premiumVoices: true,
    savedQueue: true,
    driverMode: false,
    unitEconomicsNote: 'Premium natural voices, higher limits & Saved Listening Queue',
  },
  runiq_bundle: {
    id: 'runiq_bundle',
    name: 'RunIQ Driver Add-On',
    badge: 'RUNIQ BUNDLE',
    priceLabel: '+$2.99 / mo',
    dailyCharLimit: 300000,
    maxVaultDocs: 9999,
    premiumVoices: true,
    savedQueue: true,
    driverMode: true,
    unitEconomicsNote: 'Hands-free road queue, auto-read dispatches & RunIQ driver sync',
  },
};

export interface SavedDocument {
  id: string;
  title: string;
  content: string;
  category: DocCategory;
  updatedAt: string;
  wordCount: number;
  durationLabel?: string;
  ownerEmail?: string;
  inQueue?: boolean;
  queueOrder?: number;
}

export interface GoogleUser {
  id: string;
  name: string;
  email: string;
  picture?: string;
  provider: 'google-oauth' | 'google-workspace';
  planTier?: PlanTier;
  dailyCharsUsed?: number;
}

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || '';

// Google ID token sent as a bearer token; the API derives the user's identity from it.
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export interface IdTokenClaims {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  nonce?: string;
  exp: number;
}

/**
 * Read a Google ID token's claims for display and expiry checks. This does not
 * verify the signature — the API does that on every request.
 */
export function decodeIdToken(token: string): IdTokenClaims | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
    const json = decodeURIComponent(
      Array.from(atob(padded), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    );
    return JSON.parse(json) as IdTokenClaims;
  } catch {
    return null;
  }
}

export function isIdTokenExpired(token: string): boolean {
  const claims = decodeIdToken(token);
  return !claims || claims.exp * 1000 <= Date.now();
}

function apiFetch(path: string, init: { method: 'GET' | 'POST'; body?: unknown }) {
  if (!authToken) {
    return Promise.reject(new Error('Not signed in with Google'));
  }
  return fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

/**
 * Fetch the signed-in user's saved documents via the Vercel Function `/api/documents-list`
 */
export async function fetchDocumentsFromNeon(): Promise<SavedDocument[]> {
  const res = await apiFetch('/api/documents-list', { method: 'GET' });
  if (!res.ok) {
    throw new Error(`API error (${res.status}) fetching documents`);
  }
  const data = await res.json();
  return Array.isArray(data?.documents) ? data.documents : [];
}

/**
 * Upsert (insert or update) a voice transcript or text document via `/api/documents-save`
 */
export async function upsertDocumentInNeon(doc: SavedDocument): Promise<void> {
  const res = await apiFetch('/api/documents-save', { method: 'POST', body: doc });
  if (!res.ok) {
    throw new Error(`API error (${res.status}) saving document`);
  }
}

/**
 * Toggle queue membership for a document via `/api/documents-queue`
 */
export async function toggleDocumentQueueInNeon(
  id: string,
  inQueue: boolean,
  queueOrder = 0
): Promise<void> {
  const res = await apiFetch('/api/documents-queue', {
    method: 'POST',
    body: { id, inQueue, queueOrder },
  });
  if (!res.ok) {
    throw new Error(`API error (${res.status}) updating queue`);
  }
}

/**
 * Delete a document by ID via `/api/documents-delete`
 */
export async function deleteDocumentFromNeon(id: string): Promise<void> {
  const res = await apiFetch('/api/documents-delete', { method: 'POST', body: { id } });
  if (!res.ok) {
    throw new Error(`API error (${res.status}) deleting document`);
  }
}

/**
 * Sync the signed-in user's profile and preferences via `/api/users-upsert`.
 * The server derives identity from the ID token and returns the stored tier and usage.
 */
export async function upsertUserInNeon(
  preferredVoice?: string,
  speechRate?: number
): Promise<{ planTier: PlanTier; dailyCharsUsed: number }> {
  const res = await apiFetch('/api/users-upsert', {
    method: 'POST',
    body: { preferredVoice, speechRate },
  });
  if (!res.ok) {
    throw new Error(`API error (${res.status}) upserting user`);
  }
  const data = await res.json();
  return {
    planTier: (data?.planTier as PlanTier) || 'free',
    dailyCharsUsed: Number(data?.dailyCharsUsed ?? 0),
  };
}

/**
 * Add to today's character consumption via `/api/users-usage`. The server owns the
 * running total and the plan tier; both are returned.
 */
export async function recordUsageInNeon(
  charsToAdd: number
): Promise<{ planTier: PlanTier; dailyCharsUsed: number }> {
  const res = await apiFetch('/api/users-usage', { method: 'POST', body: { charsToAdd } });
  if (!res.ok) {
    throw new Error(`API error (${res.status}) recording usage`);
  }
  const data = await res.json();
  return {
    planTier: (data?.planTier as PlanTier) || 'free',
    dailyCharsUsed: Number(data?.dailyCharsUsed ?? 0),
  };
}
