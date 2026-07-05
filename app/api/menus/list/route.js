import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { createServerError } from '@/lib/errorHandler';
import { verifyTokenWithResult } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: 공개 메뉴 목록 (로그인 사용자용, 보이는 메뉴만)
export async function GET(request) {
  try {
    const authResult = verifyTokenWithResult(request);
    if (!authResult.valid) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // 테이블이 없으면 빈 배열 반환
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'site_menus'
      ) AS exists
    `);

    if (!tableCheck.rows[0].exists) {
      return NextResponse.json({ menus: [] });
    }

    const result = await query(`
      SELECT id, parent_id, depth, label, description, link, link_target, icon, display_order
      FROM site_menus
      WHERE is_visible = true
      ORDER BY depth ASC, display_order ASC, created_at ASC
    `);

    const rows = result.rows;

    // 트리 구조로 변환
    const rootMenus = rows.filter((r) => !r.parent_id);
    const tree = rootMenus.map((root) => {
      const children = rows
        .filter((r) => r.parent_id === root.id)
        .map((child) => ({
          id: child.id,
          label: child.label,
          description: child.description,
          link: child.link,
          linkTarget: child.link_target,
          icon: child.icon,
          depth: child.depth,
        }));
      return {
        id: root.id,
        label: root.label,
        description: root.description,
        link: root.link,
        linkTarget: root.link_target,
        icon: root.icon,
        depth: root.depth,
        children,
      };
    });

    return NextResponse.json({ menus: tree });
  } catch (error) {
    return createServerError(error);
  }
}
