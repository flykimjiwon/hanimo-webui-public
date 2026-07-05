import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyTokenWithResult } from '@/lib/auth';
import { redactScreenForShare } from '@/lib/screen-security.mjs';
import bcryptjs from 'bcryptjs';

// GET: 공유 링크로 화면 조회
export async function GET(request, { params }) {
  const { shareId } = await params;

  const result = await query(
    `SELECT id, name, description, definition, access_type, access_password_hash, status, view_count
     FROM screens WHERE share_id = $1 AND status = 'published'`,
    [shareId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: '화면을 찾을 수 없습니다.' }, { status: 404 });
  }

  const screen = result.rows[0];

  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';

  // public: 인증 없이 접근 허용
  if (screen.access_type === 'public') {
    await query(
      `UPDATE screens SET view_count = view_count + 1, last_accessed_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [screen.id]
    );
    await query(
      `INSERT INTO screen_access_logs (screen_id, user_id, client_ip, action) VALUES ($1, $2, $3, 'view')`,
      [screen.id, null, clientIp]
    ).catch(() => {});
    return NextResponse.json({ screen: redactScreenForShare(screen) });
  }

  // password: 메타 정보만 반환 (비밀번호 인증은 POST로)
  if (screen.access_type === 'password') {
    return NextResponse.json({
      screen: { id: screen.id, name: screen.name, description: screen.description, access_type: 'password' },
      requirePassword: true,
    });
  }

  // authenticated / restricted: 로그인 필요
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '로그인이 필요합니다.', requireAuth: true }, { status: 401 });
  }

  if (screen.access_type === 'restricted') {
    // allowed_users 확인은 별도 쿼리
    const allowedResult = await query(
      `SELECT allowed_users FROM screens WHERE id = $1`,
      [screen.id]
    );
    const allowedUsers = allowedResult.rows[0]?.allowed_users || [];
    if (!allowedUsers.includes(auth.user.email) && auth.user.role !== 'admin') {
      return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
    }
  }

  // 조회수 증가 + 접근 로그
  await query(
    `UPDATE screens SET view_count = view_count + 1, last_accessed_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [screen.id]
  );
  await query(
    `INSERT INTO screen_access_logs (screen_id, user_id, client_ip, action) VALUES ($1, $2, $3, 'view')`,
    [screen.id, auth.user.id, clientIp]
  ).catch(() => {});

  return NextResponse.json({ screen: redactScreenForShare(screen) });
}

// POST: 비밀번호 인증
export async function POST(request, { params }) {
  const { shareId } = await params;
  const { password } = await request.json();

  const result = await query(
    `SELECT id, name, description, definition, access_type, access_password_hash, status
     FROM screens WHERE share_id = $1 AND status = 'published'`,
    [shareId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: '화면을 찾을 수 없습니다.' }, { status: 404 });
  }

  const screen = result.rows[0];

  if (screen.access_type !== 'password') {
    return NextResponse.json({ error: '비밀번호 보호 화면이 아닙니다.' }, { status: 400 });
  }

  if (!screen.access_password_hash) {
    return NextResponse.json({ error: '비밀번호가 설정되지 않았습니다.' }, { status: 400 });
  }

  const isMatch = await bcryptjs.compare(password, screen.access_password_hash);
  if (!isMatch) {
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 403 });
  }

  // 조회수 증가
  await query(
    `UPDATE screens SET view_count = view_count + 1, last_accessed_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [screen.id]
  );

  return NextResponse.json({ screen: redactScreenForShare(screen) });
}
