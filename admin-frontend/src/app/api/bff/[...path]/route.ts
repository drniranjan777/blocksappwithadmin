import type { NextRequest } from 'next/server';
import { crossSiteProblem } from '@/lib/server/csrf';
import { problem, relay } from '@/lib/server/relay';
import { callAsStaff } from '@/lib/server/session';

/**
 * The console's way to the staff API. The browser asks for `/api/bff/users?q=x`; this forwards it to
 * `/api/v1/admin/users?q=x` with the person's own token (which the page itself never sees), after
 * checking the request really came from this app's pages.
 *
 * It is a plain pipe on purpose: all decisions about who may do what are the API's. A path that could
 * climb out of `/admin/` is refused here, and sign-in itself has its own route (`/api/auth`).
 */
const MAX_BODY_BYTES = 1_000_000;
const SEGMENT = /^[A-Za-z0-9._~:@-]{1,128}$/;

async function handle(request: NextRequest, ctx: RouteContext<'/api/bff/[...path]'>) {
  const refused = crossSiteProblem(request);
  if (refused) return problem(403, 'FORBIDDEN', 'This request was not made from the console.');

  const { path } = await ctx.params;
  if (path.length === 0 || path.some((s) => s === '.' || s === '..' || !SEGMENT.test(s))) {
    return problem(404, 'NOT_FOUND', 'Not found.');
  }
  if (path[0] === 'auth') return problem(404, 'NOT_FOUND', 'Not found.');

  let body: string | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_BODY_BYTES) return problem(413, 'PAYLOAD_TOO_LARGE', 'That request is too large.');
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return problem(413, 'PAYLOAD_TOO_LARGE', 'That request is too large.');
    body = text || undefined;
  }

  const upstream = `/admin/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  return relay(await callAsStaff(request, { method: request.method, path: upstream, body }));
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
