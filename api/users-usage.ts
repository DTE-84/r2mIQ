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
    // Usage only ever increases (resetting at the start of a new day), so a client
    // cannot zero its own count. The tier is read back, never written.
    const charsToAdd = Math.floor(Number(parseBody(req)?.charsToAdd ?? 0));
    if (!Number.isFinite(charsToAdd) || charsToAdd < 0) {
      return res.status(400).json({ error: 'charsToAdd must be a non-negative number' });
    }

    const sql = getSql();
    const rows = (await sql`
      UPDATE r2miq_users
      SET
        daily_chars_used = CASE
          WHEN daily_reset_date < CURRENT_DATE THEN ${charsToAdd}
          ELSE daily_chars_used + ${charsToAdd}
        END,
        daily_reset_date = CURRENT_DATE
      WHERE email = ${authed.email}
      RETURNING plan_tier, daily_chars_used
    `) as Record<string, any>[];

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(200).json({
      planTier: rows[0].plan_tier || 'free',
      dailyCharsUsed: Number(rows[0].daily_chars_used ?? 0),
    });
  } catch (err) {
    return serverError(res, err, 'Failed to record usage');
  }
}
