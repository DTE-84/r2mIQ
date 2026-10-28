import { getSql, parseBody, requireUser, serverError, setCorsHeaders } from './_db';

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authed = await requireUser(req, res);
  if (!authed) return;

  try {
    // Identity comes from the verified token; only preferences come from the client.
    // plan_tier is never taken from the request: new users start on 'free' and the
    // tier is left alone on conflict, so only a server-side billing path can change it.
    const { preferredVoice, speechRate } = parseBody(req) || {};

    const sql = getSql();
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
        ${authed.sub},
        ${authed.name},
        ${authed.email},
        ${authed.picture ?? null},
        'google-oauth',
        ${preferredVoice ?? null},
        ${Number(speechRate ?? 1.0)},
        'free',
        0,
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
    return res.status(200).json({
      user: authed,
      planTier: row?.plan_tier || 'free',
      dailyCharsUsed: Number(row?.daily_chars_used ?? 0),
    });
  } catch (err) {
    return serverError(res, err, 'Failed to upsert user');
  }
}
