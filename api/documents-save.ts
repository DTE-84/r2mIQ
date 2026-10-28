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
    const doc = parseBody(req);
    if (!doc || !doc.id || !doc.title) {
      return res.status(400).json({ error: 'Invalid document payload' });
    }

    // Owner always comes from the verified token. The conditional update means an
    // id owned by someone else is left untouched and returns no row.
    const sql = getSql();
    const rows = await sql`
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
        ${String(doc.id)},
        ${String(doc.title)},
        ${String(doc.content ?? '')},
        ${doc.category ?? 'Read Aloud'},
        ${Number(doc.wordCount ?? 0)},
        ${doc.durationLabel ?? '0:00'},
        ${authed.email},
        ${Boolean(doc.inQueue)},
        ${Number(doc.queueOrder ?? 0)},
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        category = EXCLUDED.category,
        word_count = EXCLUDED.word_count,
        duration_label = EXCLUDED.duration_label,
        in_queue = EXCLUDED.in_queue,
        queue_order = EXCLUDED.queue_order,
        updated_at = NOW()
      WHERE r2miq_documents.owner_email = ${authed.email}
      RETURNING id
    `;

    if (rows.length === 0) {
      return res.status(403).json({ error: 'Document belongs to another user' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return serverError(res, err, 'Failed to save document');
  }
}
