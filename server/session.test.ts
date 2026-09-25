import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = { id: string; user_id: string; email: string; token_hash: string; last_seen_at: string; expires_at: string; revoked_at: string | null };
const db = { rows: [] as Row[], failing: false, googleCalls: 0 };

vi.mock('./db.js', () => ({
  query: vi.fn(async (sql: string, p: any[] = []) => {
    if (db.failing) throw new Error('db down');
    if (sql.startsWith('INSERT INTO user_sessions')) {
      db.rows.push({ id: `s${db.rows.length}`, user_id: p[0], email: p[1], token_hash: p[2], last_seen_at: new Date().toISOString(), expires_at: new Date(p[4]).toISOString(), revoked_at: null });
    } else if (sql.startsWith('SELECT id, user_id')) {
      return db.rows.filter((r) => r.token_hash === p[0]);
    } else if (sql.startsWith('UPDATE user_sessions SET last_seen_at')) {
      const r = db.rows.find((x) => x.id === p[0]); if (r) { r.last_seen_at = new Date().toISOString(); r.expires_at = new Date(p[1]).toISOString(); }
    } else if (sql.startsWith('UPDATE user_sessions SET revoked_at')) {
      const r = db.rows.find((x) => x.token_hash === p[0]); if (r) r.revoked_at = new Date().toISOString();
    }
    return [];
  }),
}));
vi.mock('./googleAuthVerify.js', async (orig) => ({
  ...(await orig<any>()),
  verifyGoogleAccessToken: vi.fn(async (t: string | null) => { db.googleCalls++; return t === 'good-google-token' ? { email: 'me@example.com' } : null; }),
}));
vi.mock('./telegramStore.js', () => ({ findOrCreateUserByEmail: vi.fn(async () => 'user-1') }));

import { handleSessionApi } from './sessionRoutes';
import { verifyRequestUser } from './requestAuth';
import { verifySession, hashSessionToken } from './sessionStore';

function mockRes() {
  const r: any = { headers: {}, code: 0, body: null };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; };
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  return r;
}
const req = (method: string, headers: Record<string, string> = {}) => ({ method, headers });
const cookieFrom = (res: any) => String(res.headers['Set-Cookie']).split(';')[0];

describe('app-owned login session', () => {
  beforeEach(() => { db.rows = []; db.failing = false; db.googleCalls = 0; });

  it('only a valid Google token can start a session', async () => {
    const bad = mockRes();
    await handleSessionApi(req('POST', { authorization: 'Bearer nope' }), bad);
    expect(bad.code).toBe(401);
    const good = mockRes();
    await handleSessionApi(req('POST', { authorization: 'Bearer good-google-token' }), good);
    expect(good.code).toBe(200);
    expect(good.headers['Set-Cookie']).toMatch(/^aot_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
    // Only the hash is stored, never the token itself.
    const token = decodeURIComponent(cookieFrom(good).split('=')[1]);
    expect(db.rows[0].token_hash).toBe(hashSessionToken(token));
    expect(db.rows[0].token_hash).not.toBe(token);
  });

  it('the cookie identifies the user on later requests, without asking Google', async () => {
    const res = mockRes();
    await handleSessionApi(req('POST', { authorization: 'Bearer good-google-token' }), res);
    db.googleCalls = 0;
    const user = await verifyRequestUser(req('GET', { cookie: `other=1; ${cookieFrom(res)}` }));
    expect(user).toEqual({ email: 'me@example.com' });
    expect(db.googleCalls).toBe(0);
    const check = mockRes();
    await handleSessionApi(req('GET', { cookie: cookieFrom(res) }), check);
    expect(check.body).toEqual({ ok: true, email: 'me@example.com' });
  });

  it('sign-out revokes the session and clears the cookie', async () => {
    const res = mockRes();
    await handleSessionApi(req('POST', { authorization: 'Bearer good-google-token' }), res);
    const out = mockRes();
    await handleSessionApi(req('DELETE', { cookie: cookieFrom(res) }), out);
    expect(out.headers['Set-Cookie']).toContain('Max-Age=0');
    expect(await verifyRequestUser(req('GET', { cookie: cookieFrom(res) }))).toBeNull();
  });

  it('expired sessions are refused; active ones renew', async () => {
    const res = mockRes();
    await handleSessionApi(req('POST', { authorization: 'Bearer good-google-token' }), res);
    const token = decodeURIComponent(cookieFrom(res).split('=')[1]);
    db.rows[0].last_seen_at = new Date(Date.now() - 2 * 3600e3).toISOString();
    const before = db.rows[0].expires_at;
    expect(await verifySession(token)).toEqual({ userId: 'user-1', email: 'me@example.com' });
    expect(db.rows[0].expires_at >= before).toBe(true);
    db.rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await verifySession(token)).toBeNull();
  });

  it('a Google token in the header decides over an older cookie (account switch)', async () => {
    const res = mockRes();
    await handleSessionApi(req('POST', { authorization: 'Bearer good-google-token' }), res);
    db.rows[0].email = 'old-account@example.com';
    expect(await verifyRequestUser(req('GET', { cookie: cookieFrom(res), authorization: 'Bearer good-google-token' }))).toEqual({ email: 'me@example.com' });
    // An expired/invalid token falls back to the cookie session.
    expect(await verifyRequestUser(req('GET', { cookie: cookieFrom(res), authorization: 'Bearer expired' }))).toEqual({ email: 'old-account@example.com' });
  });

  it('still accepts a Google token when there is no session, or the session store is down', async () => {
    expect(await verifyRequestUser(req('GET', { authorization: 'Bearer good-google-token' }))).toEqual({ email: 'me@example.com' });
    db.failing = true;
    expect(await verifyRequestUser(req('GET', { cookie: 'aot_session=abcdefghijklmnopqrstuvwxyz', authorization: 'Bearer good-google-token' }))).toEqual({ email: 'me@example.com' });
    expect(await verifyRequestUser(req('GET', {}))).toBeNull();
    const down = mockRes();
    await handleSessionApi(req('GET', { cookie: 'aot_session=abcdefghijklmnopqrstuvwxyz' }), down);
    expect(down.code).toBe(503);
  });
});
