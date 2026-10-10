import { NextResponse, type NextRequest } from 'next/server';
import { backend } from '@/lib/server/backend';
import { clearSessionCookies, setSessionCookies } from '@/lib/server/cookies';
import { crossSiteProblem } from '@/lib/server/csrf';
import { problem, relay } from '@/lib/server/relay';
import { callAsStaff, tokensFrom, type SessionReply } from '@/lib/server/session';

/**
 * Staff sign-in, one step per call, in the order the API walks through it:
 * `login` -> (`password`) -> (`two-factor/setup` + `two-factor/confirm`) or `verify`.
 *
 * The API answers with tokens; this route puts them in `HttpOnly` cookies and tells the page only
 * *where the person stands* (`nextStep`, who they are, what they may do). The page never holds a token.
 */
interface Step {
  method: 'GET' | 'POST';
  upstream: string;
  /** Sign-in itself needs no session; every later step does. */
  session: boolean;
}

const STEPS: Record<string, Step> = {
  login: { method: 'POST', upstream: '/admin/auth/login', session: false },
  verify: { method: 'POST', upstream: '/admin/auth/login/verify', session: true },
  password: { method: 'POST', upstream: '/admin/auth/password/change', session: true },
  'two-factor/setup': { method: 'POST', upstream: '/admin/auth/two-factor/setup', session: true },
  'two-factor/confirm': { method: 'POST', upstream: '/admin/auth/two-factor/confirm', session: true },
  session: { method: 'GET', upstream: '/admin/auth/me', session: true },
  logout: { method: 'POST', upstream: '/admin/auth/logout', session: true },
};

const MAX_BODY_BYTES = 16_000;

async function handle(request: NextRequest, ctx: RouteContext<'/api/auth/[...action]'>) {
  const { action } = await ctx.params;
  const step = STEPS[action.join('/')];
  if (!step || step.method !== request.method) return problem(404, 'NOT_FOUND', 'Not found.');

  const refused = crossSiteProblem(request);
  if (refused) return problem(403, 'FORBIDDEN', 'This request was not made from the console.');

  let body: string | undefined;
  if (request.method === 'POST') {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return problem(413, 'PAYLOAD_TOO_LARGE', 'That request is too large.');
    body = text || undefined;
  }

  if (action.join('/') === 'logout') return logout(request);

  const answer: SessionReply = step.session
    ? await callAsStaff(request, { method: step.method, path: step.upstream, body })
    : {
        reply: await backend({ method: step.method, path: step.upstream, body, from: request.headers }),
        renewed: null,
        signedOut: false,
      };

  // Tokens in an answer go into cookies and are removed from what the page receives.
  const tokens = answer.reply.status === 200 ? tokensFrom(answer.reply.body) : null;
  if (!tokens) return relay(answer);

  const data = (answer.reply.body as { data: Record<string, unknown> }).data;
  const { tokens: _discarded, ...visible } = data;
  void _discarded;
  const response = NextResponse.json({ data: visible }, { headers: { 'Cache-Control': 'no-store' } });
  setSessionCookies(response, tokens);
  return response;
}

/** Ends the session at the API (best effort: the cookies are cleared either way). */
async function logout(request: NextRequest) {
  try {
    await callAsStaff(request, { method: 'POST', path: '/admin/auth/logout' });
  } catch {
    // The person is signed out of this browser regardless.
  }
  const response = new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  clearSessionCookies(response);
  return response;
}

export const GET = handle;
export const POST = handle;
