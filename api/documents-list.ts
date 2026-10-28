import { getSql, requireUser, serverError, setCorsHeaders } from './_db';

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authed = await requireUser(req, res);
  if (!authed) return;

  try {
    const sql = getSql();
    const rows = await sql`
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
      WHERE owner_email = ${authed.email}
      ORDER BY updated_at DESC
    `;

    const documents = (rows as Record<string, any>[]).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      content: String(r.content ?? ''),
      category: r.category || 'Read Aloud',
      wordCount: Number(r.word_count ?? 0),
      durationLabel: r.duration_label ? String(r.duration_label) : '0:00',
      ownerEmail: r.owner_email ? String(r.owner_email) : undefined,
      inQueue: Boolean(r.in_queue),
      queueOrder: Number(r.queue_order ?? 0),
      updatedAt: r.updated_at
        ? new Date(r.updated_at).toISOString()
        : new Date().toISOString(),
    }));

    return res.status(200).json({ documents });
  } catch (err) {
    return serverError(res, err, 'Failed to fetch documents');
  }
}
