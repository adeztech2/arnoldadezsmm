import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { jwtVerify, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { findProfileById, upsertManusProfile, type Profile } from '@/db';

export const SESSION_COOKIE = 'webdev_app_session';
export const STATE_COOKIE = 'manus_oauth_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type ManusIdentity = {
  userId: string;
  openId: string;
  email: string;
  name: string;
};

type ManusUserInfo = { openId?: string; email?: string; name?: string; platforms?: unknown };

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing Manus environment variable: ${name}`);
  return value;
}

function secretKey() {
  return new TextEncoder().encode(required('MANUS_JWT_SECRET'));
}

function cookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`;
}

export function clearCookie(name: string) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`;
}

export async function createSessionCookie(profile: Profile) {
  return new SignJWT({
    appId: required('MANUS_PROJECT_ID'),
    openId: profile.open_id,
    email: profile.email,
    name: profile.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(profile.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

export async function resolveSession(request: Request): Promise<ManusIdentity | null> {
  const token = cookieValue(request, SESSION_COOKIE) ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    const userId = typeof payload.sub === 'string' ? payload.sub : undefined;
    const openId = typeof payload['openId'] === 'string' ? payload['openId'] : undefined;
    if (!userId || !openId) return null;
    const profile = await findProfileById(userId);
    if (!profile || profile.open_id !== openId || profile.disabled) return null;
    return { userId: profile.id, openId: profile.open_id, email: profile.email, name: profile.name };
  } catch {
    return null;
  }
}

export async function requireIdentity(request = getRequest()) {
  const identity = await resolveSession(request);
  if (!identity) throw new Error('Unauthorized. Sign in with Manus to continue.');
  return identity;
}

export const requireManusAuth = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const identity = await requireIdentity();
  return next({ context: { userId: identity.userId, identity } });
});

export function createOAuthState(origin: string) {
  const nonce = randomUUID();
  const redirectUri = `${origin}/manus-oauth/callback`;
  const state = encodeBase64Url(JSON.stringify({ nonce, redirectUri }));
  return { nonce, state, redirectUri };
}

export function verifyOAuthState(request: Request, state: string) {
  const nonce = cookieValue(request, STATE_COOKIE);
  const decoded = JSON.parse(decodeBase64Url(state)) as { nonce?: string; redirectUri?: string };
  const origin = new URL(request.url).origin;
  if (!nonce || decoded.nonce !== nonce || decoded.redirectUri !== `${origin}/manus-oauth/callback`) {
    throw new Error('Invalid OAuth state. Please restart sign in.');
  }
  return decoded.redirectUri;
}

export async function exchangeManusCode(code: string, redirectUri: string) {
  const response = await fetch(`${required('MANUS_OAUTH_API_URL')}/webdev.v1.WebDevAuthPublicService/ExchangeToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: required('MANUS_PROJECT_ID'), grantType: 'authorization_code', code, redirectUri }),
  });
  if (!response.ok) throw new Error('Manus OAuth token exchange failed.');
  const token = await response.json() as { accessToken?: string };
  if (!token.accessToken) throw new Error('Manus OAuth did not return an access token.');

  const identityResponse = await fetch(`${required('MANUS_OAUTH_API_URL')}/webdev.v1.WebDevAuthPublicService/GetUserInfo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token.accessToken}` },
    body: JSON.stringify({ accessToken: token.accessToken }),
  });
  if (!identityResponse.ok) throw new Error('Manus identity lookup failed.');
  const info = await identityResponse.json() as ManusUserInfo;
  if (!info.openId) throw new Error('Manus identity did not include an openId.');
  return { openId: info.openId, email: info.email ?? '', name: info.name ?? '' };
}

export async function establishSession(identity: { openId: string; email: string; name: string }) {
  const profile = await upsertManusProfile(identity);
  const token = await createSessionCookie(profile);
  return { profile, setCookie: cookie(SESSION_COOKIE, token, SESSION_MAX_AGE) };
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}
