import { neon } from '@neondatabase/serverless';

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

const connectionString = process.env.EXPO_PUBLIC_DATABASE_URL;

if (!connectionString) {
  throw new Error('EXPO_PUBLIC_DATABASE_URL is not set. Add it to your .env file.');
}

const sql = neon(connectionString);

/**
 * Fetch all saved documents from Neon Postgres (ordered by most recently updated)
 */
export async function fetchDocumentsFromNeon(
  ownerEmail?: string
): Promise<SavedDocument[]> {
  const rows = ownerEmail
    ? await sql`
        SELECT
          id,
          title,
          content,
          category,
          word_count,
          duration_label,
          owner_email,
          in_queue,
          queue_order,
          updated_at
        FROM r2miq_documents
        WHERE owner_email = ${ownerEmail} OR owner_email IS NULL
        ORDER BY updated_at DESC
      `
    : await sql`
        SELECT
          id,
          title,
          content,
          category,
          word_count,
          duration_label,
          owner_email,
          in_queue,
          queue_order,
          updated_at
        FROM r2miq_documents
        ORDER BY updated_at DESC
      `;

  return (rows as Record<string, any>[]).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    content: String(r.content ?? ''),
    category: (r.category as DocCategory) || 'Read Aloud',
    wordCount: Number(r.word_count ?? 0),
    durationLabel: r.duration_label ? String(r.duration_label) : '0:00',
    ownerEmail: r.owner_email ? String(r.owner_email) : undefined,
    inQueue: Boolean(r.in_queue),
    queueOrder: Number(r.queue_order ?? 0),
    updatedAt: r.updated_at
      ? new Date(r.updated_at).toISOString()
      : new Date().toISOString(),
  }));
}

/**
 * Upsert (insert or update) a voice transcript or text document in Neon Postgres
 */
export async function upsertDocumentInNeon(doc: SavedDocument): Promise<void> {
  await sql`
    INSERT INTO r2miq_documents (
      id,
      title,
      content,
      category,
      word_count,
      duration_label,
      owner_email,
      in_queue,
      queue_order,
      updated_at
    )
    VALUES (
      ${doc.id},
      ${doc.title},
      ${doc.content},
      ${doc.category},
      ${doc.wordCount},
      ${doc.durationLabel ?? '0:00'},
      ${doc.ownerEmail ?? null},
      ${doc.inQueue ?? false},
      ${doc.queueOrder ?? 0},
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      category = EXCLUDED.category,
      word_count = EXCLUDED.word_count,
      duration_label = EXCLUDED.duration_label,
      owner_email = COALESCE(EXCLUDED.owner_email, r2miq_documents.owner_email),
      in_queue = EXCLUDED.in_queue,
      queue_order = EXCLUDED.queue_order,
      updated_at = NOW()
  `;
}

/**
 * Toggle queue membership for a document in Neon Postgres
 */
export async function toggleDocumentQueueInNeon(
  id: string,
  inQueue: boolean,
  queueOrder = 0
): Promise<void> {
  await sql`
    UPDATE r2miq_documents
    SET in_queue = ${inQueue}, queue_order = ${queueOrder}, updated_at = NOW()
    WHERE id = ${id}
  `;
}

/**
 * Delete a document from Neon Postgres by ID
 */
export async function deleteDocumentFromNeon(id: string): Promise<void> {
  await sql`
    DELETE FROM r2miq_documents
    WHERE id = ${id}
  `;
}

/**
 * Upsert a signed-in Google user profile, tier, and daily usage into Neon Postgres
 */
export async function upsertUserInNeon(
  user: GoogleUser,
  preferredVoice?: string,
  speechRate?: number
): Promise<{ planTier: PlanTier; dailyCharsUsed: number }> {
  const rows = (await sql`
    INSERT INTO r2miq_users (
      id,
      name,
      email,
      picture,
      provider,
      preferred_voice,
      speech_rate,
      plan_tier,
      daily_chars_used,
      daily_reset_date,
      last_login_at
    )
    VALUES (
      ${user.id},
      ${user.name},
      ${user.email},
      ${user.picture ?? null},
      ${user.provider},
      ${preferredVoice ?? null},
      ${speechRate ?? 1.0},
      ${user.planTier ?? 'free'},
      ${user.dailyCharsUsed ?? 0},
      CURRENT_DATE,
      NOW()
    )
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      picture = COALESCE(EXCLUDED.picture, r2miq_users.picture),
      provider = EXCLUDED.provider,
      preferred_voice = COALESCE(EXCLUDED.preferred_voice, r2miq_users.preferred_voice),
      speech_rate = COALESCE(EXCLUDED.speech_rate, r2miq_users.speech_rate),
      daily_chars_used = CASE
        WHEN r2miq_users.daily_reset_date < CURRENT_DATE THEN 0
        ELSE r2miq_users.daily_chars_used
      END,
      daily_reset_date = CURRENT_DATE,
      last_login_at = NOW()
    RETURNING plan_tier, daily_chars_used
  `) as Record<string, any>[];

  const row = rows[0];
  return {
    planTier: (row?.plan_tier as PlanTier) || user.planTier || 'free',
    dailyCharsUsed: Number(row?.daily_chars_used ?? 0),
  };
}

/**
 * Update a user's subscription tier or daily character consumption in Neon Postgres
 */
export async function updateUserTierAndUsageInNeon(
  email: string,
  planTier: PlanTier,
  dailyCharsUsed: number
): Promise<void> {
  await sql`
    UPDATE r2miq_users
    SET
      plan_tier = ${planTier},
      daily_chars_used = ${dailyCharsUsed},
      daily_reset_date = CURRENT_DATE
    WHERE email = ${email}
  `;
}
