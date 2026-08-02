import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function parseBasicCredentials(
  header: string | null,
): { username: string; password: string } | null {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function unauthorized() {
  return new NextResponse('Admin authentication required.', {
    status: 401,
    headers: {
      'Cache-Control': 'no-store',
      'WWW-Authenticate': 'Basic realm="Startup Graveyard Admin", charset="UTF-8"',
    },
  });
}

export function proxy(request: NextRequest) {
  const username = process.env.ADMIN_UI_USERNAME?.trim() ?? '';
  const password = process.env.ADMIN_UI_PASSWORD ?? '';
  if (!username || !password) {
    return new NextResponse('Admin UI is not configured.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const provided = parseBasicCredentials(request.headers.get('authorization'));
  if (
    !provided ||
    !safeEqual(provided.username, username) ||
    !safeEqual(provided.password, password)
  ) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
