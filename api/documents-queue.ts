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
    const { id, inQueue, queueOrder } = parseBody(req) || {};
    if (!id) {
      return res.status(400).json({ error: 'Document id is required' });
    }

    const sql = getSql();
    const rows = await sql`
      UPDATE r2miq_documents
      SET
        in_queue = ${Boolean(inQueue)},
        queue_order = ${Number(queueOrder ?? 0)},
        updated_at = NOW()
      WHERE id = ${String(id)} AND owner_email = ${authed.email}
      RETURNING id
    `;

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return serverError(res, err, 'Failed to toggle queue status');
  }
}
