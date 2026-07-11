/**
 * 전역 인증 미들웨어 (Edge runtime).
 *
 * 동작:
 * 1. PUBLIC_PATHS / 정적 자산 — 통과
 * 2. /api/admin/* — admin role 필수, 401/403 응답
 * 3. /api/* (PUBLIC 외) — 토큰 필수, 401 응답
 * 4. /admin/* — 토큰+admin role. 누락 시 /login 리다이렉트
 * 5. 토큰 검증 후 payload를 x-user-id / x-user-role 헤더에 실어 다음 라우트로 전달
 *
 * 기존 lib/auth.js의 verifyToken/verifyAdmin은 그대로 두고 두 단계 보호 layer로 운영.
 * 점진적으로 API route 안의 중복 verify를 제거 가능.
 */

import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose/jwt/verify';
import { areLabsEnabled, isLabsPath } from '@/lib/release-surface.mjs';
import { isSameOriginRequest, isUnsafeMethod } from '@/lib/security/request-origin.mjs';

function getJwtSecretError() {
  const secret = process.env.JWT_SECRET;
  if (!secret) return 'JWT_SECRET is required for protected routes.';
  if (secret.length < 32) return 'JWT_SECRET must be at least 32 characters.';
  return null;
}

const JWT_SECRET_ERROR = getJwtSecretError();
const SECRET = JWT_SECRET_ERROR
  ? null
  : new TextEncoder().encode(process.env.JWT_SECRET);

// 인증 없이 접근 가능
const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/sso',
  '/setup',
  '/error',
  '/_next',
  '/api/auth',
  '/api/public',
  '/api/notice',
  '/api/menus/list',
  '/api/screens/share',
  '/api/logs/client-error',
  '/icon.svg',
  '/favicon.ico',
];

// admin role만 접근 가능 (페이지 + API 양쪽)
const ADMIN_PREFIXES = ['/api/admin', '/admin'];

// /api 통과 + 토큰 필수
const API_PREFIX = '/api';
const CSRF_SENSITIVE_AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/create-first-admin',
]);

function isPublic(pathname) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isAdmin(pathname) {
  return ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function getToken(request) {
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const cookieToken = request.cookies.get('token')?.value;
  if (cookieToken) return cookieToken;
  return null;
}

function requiresOriginCheck(request, pathname) {
  if (!isUnsafeMethod(request.method)) return false;
  const hasSessionCookie = Boolean(
    request.cookies.get('token')?.value || request.cookies.get('refresh_token')?.value
  );
  return hasSessionCookie || CSRF_SENSITIVE_AUTH_PATHS.has(pathname);
}

async function verifyJwt(token) {
  if (!token || !SECRET) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // 정적 자산 통과 (확장자 + _next)
  if (
    pathname.startsWith('/_next/') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|ico|webp|woff2?|css|js|map)$/i)
  ) {
    return NextResponse.next();
  }

  if (!areLabsEnabled() && isLabsPath(pathname)) {
    if (pathname.startsWith(API_PREFIX)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return new NextResponse('Not found', { status: 404 });
  }

  if (requiresOriginCheck(request, pathname) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-site request rejected.' }, { status: 403 });
  }

  // PUBLIC 경로 통과
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  if (JWT_SECRET_ERROR && (pathname.startsWith(API_PREFIX) || isAdmin(pathname))) {
    if (pathname.startsWith(API_PREFIX)) {
      return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 });
    }
    return new NextResponse('Authentication is not configured.', { status: 503 });
  }

  const token = getToken(request);
  const payload = await verifyJwt(token);

  // ─── /api/* 처리 ───
  if (pathname.startsWith(API_PREFIX)) {
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (isAdmin(pathname) && payload.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }
    // payload를 다음 라우트에 전달
    const headers = new Headers(request.headers);
    if (payload.sub) headers.set('x-user-id', String(payload.sub));
    if (payload.role) headers.set('x-user-role', String(payload.role));
    if (payload.email) headers.set('x-user-email', String(payload.email));
    return NextResponse.next({ request: { headers } });
  }

  // ─── 페이지 라우트 처리 ───
  // /admin/* 는 admin 전용 페이지. 토큰 없거나 admin 아니면 로그인으로
  if (isAdmin(pathname)) {
    if (!payload || payload.role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
  }

  // 그 외 페이지는 통과 (대부분의 페이지가 client-side에서 자체 token 검사)
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
