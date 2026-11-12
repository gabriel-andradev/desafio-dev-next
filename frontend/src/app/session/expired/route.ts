import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/api';

/**
 * Ends a session whose JWT the API no longer accepts (expired, revoked by logout, database reset,
 * or a different JWT_SECRET) and sends the user to the login page.
 *
 * Pages cannot change cookies (only Route Handlers and Server Actions can), so the dashboard
 * redirects here on a 401. Without this step the stale cookie would make /login send the user back
 * to /dashboard, which would send them back to /login, forever (ERR_TOO_MANY_REDIRECTS).
 *
 * The Location header is relative, which stays correct behind Docker/proxies where the server's own URL
 * may differ from the browser's.
 */
export function GET(): NextResponse {
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: '/login' },
  });
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}
