import { neon } from '@neondatabase/serverless';
import { OAuth2Client } from 'google-auth-library';

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not configured on the server.');
  }
  return neon(url);
}

export function setCorsHeaders(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,DELETE,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Accept, Content-Type, X-Requested-With'
  );
}

export interface AuthedUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

const oauthClient = new OAuth2Client();

/**
 * Verify the Google ID token in the `Authorization: Bearer <token>` header.
 * Sends a 401/500 and returns null when the caller is not authenticated.
 */
export async function requireUser(req: any, res: any): Promise<AuthedUser | null> {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) {
    console.error('GOOGLE_CLIENT_ID environment variable is not configured on the server.');
    res.status(500).json({ error: 'Server auth is not configured' });
    return null;
  }

  const header = String(req.headers?.authorization || '');
  const idToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!idToken) {
    res.status(401).json({ error: 'Missing bearer token' });
    return null;
  }

  try {
    const ticket = await oauthClient.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      res.status(401).json({ error: 'Token has no verified email' });
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture,
    };
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
}

export function parseBody(req: any) {
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
}

export function serverError(res: any, err: unknown, message: string) {
  console.error(message, err);
  return res.status(500).json({ error: message });
}
