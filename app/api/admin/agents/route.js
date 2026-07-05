import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';
import { createServerError } from '@/lib/errorHandler';

// Define agent list
const AGENTS = [
  { id: '1', name: 'Virtual Meeting', description: 'Simulate multi-persona meetings with AI-driven discussions and summaries' },
  { id: '7', name: 'PPT Maker', description: 'Enter a topic and format, and AI generates a presentation' },
  { id: '10', name: 'Chart Maker', description: 'Select chart type, color theme, and enter data to generate charts with AI' },
];

// GET: Retrieve agent list and permissions
export async function GET(request) {
  try {
    const authResult = await verifyAdminWithResult(request);
    if (!authResult.valid) {
      const status = authResult.error?.includes('Admin') ? 403 : 401;
      return NextResponse.json({ error: authResult.error }, { status });
    }

    // Retrieve all permission settings
    const permissionsResult = await query(`
      SELECT
        ap.*,
        u.email as created_by_email,
        u.name as created_by_name
      FROM agent_permissions ap
      LEFT JOIN users u ON ap.created_by = u.id
      ORDER BY ap.agent_id, ap.permission_type
    `);

    // Retrieve user list (for permission settings)
    const usersResult = await query(`
      SELECT id, email, name, department, cell, role
      FROM users
      ORDER BY name, email
    `);

    // Retrieve department list
    const departmentsResult = await query(`
      SELECT DISTINCT department
      FROM users
      WHERE department IS NOT NULL AND department != ''
      ORDER BY department
    `);

    // Organize permissions by agent
    const agentsWithPermissions = AGENTS.map(agent => {
      const agentPermissions = permissionsResult.rows.filter(p => p.agent_id === agent.id);
      return {
        ...agent,
        permissions: agentPermissions,
      };
    });

    return NextResponse.json({
      agents: agentsWithPermissions,
      users: usersResult.rows,
      departments: departmentsResult.rows.map(d => d.department),
    });
  } catch (error) {
    logger.error('[GET /api/admin/agents] error:', error);
    return createServerError(error);
  }
}

// POST: Set agent permissions
export async function POST(request) {
  try {
    const authResult = await verifyAdminWithResult(request);
    if (!authResult.valid) {
      const status = authResult.error?.includes('Admin') ? 403 : 401;
      return NextResponse.json({ error: authResult.error }, { status });
    }

    const body = await request.json();
    const { agentId, permissionType, permissionValue, isAllowed } = body;

    if (!agentId || !permissionType) {
      return NextResponse.json({ error: 'agentId and permissionType are required' }, { status: 400 });
    }

    // Validate agent ID
    if (!AGENTS.find(a => a.id === agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 });
    }

    // Validate permission type
    const validTypes = ['all', 'role', 'department', 'user'];
    if (!validTypes.includes(permissionType)) {
      return NextResponse.json({ error: 'Invalid permission type' }, { status: 400 });
    }

    // Validate value based on permission type
    if (permissionType !== 'all' && !permissionValue) {
      return NextResponse.json({ error: `A value is required for ${permissionType} type` }, { status: 400 });
    }

    // UPSERT (update if exists, insert if not)
    const result = await query(`
      INSERT INTO agent_permissions (agent_id, permission_type, permission_value, is_allowed, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (agent_id, permission_type, permission_value)
      DO UPDATE SET is_allowed = $4, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [agentId, permissionType, permissionValue || null, isAllowed !== false, authResult.user.id]);

    return NextResponse.json({
      message: 'Permission has been set',
      permission: result.rows[0]
    });
  } catch (error) {
    logger.error('[POST /api/admin/agents] error:', error);
    return createServerError(error);
  }
}

// DELETE: Remove agent permission
export async function DELETE(request) {
  try {
    const authResult = await verifyAdminWithResult(request);
    if (!authResult.valid) {
      const status = authResult.error?.includes('Admin') ? 403 : 401;
      return NextResponse.json({ error: authResult.error }, { status });
    }

    const { searchParams } = new URL(request.url);
    const permissionId = searchParams.get('id');

    if (!permissionId) {
      return NextResponse.json({ error: 'Permission ID is required' }, { status: 400 });
    }

    await query('DELETE FROM agent_permissions WHERE id = $1', [permissionId]);

    return NextResponse.json({ message: 'Permission deleted' });
  } catch (error) {
    logger.error('[DELETE /api/admin/agents] error:', error);
    return createServerError(error);
  }
}

export async function PATCH(request) {
  try {
    const authResult = await verifyAdminWithResult(request);
    if (!authResult.valid) {
      const status = authResult.error?.includes('Admin') ? 403 : 401;
      return NextResponse.json({ error: authResult.error }, { status });
    }

    const body = await request.json();
    const { agentId, isVisible } = body;

    if (!agentId) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 });
    }

    await query(`
      CREATE TABLE IF NOT EXISTS agent_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        agent_id VARCHAR(50) NOT NULL UNIQUE,
        is_visible BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await query(`
      INSERT INTO agent_settings (agent_id, is_visible)
      VALUES ($1, $2)
      ON CONFLICT (agent_id)
      DO UPDATE SET is_visible = $2, updated_at = CURRENT_TIMESTAMP
    `, [agentId, isVisible !== false]);

    return NextResponse.json({
      message: `Agent visibility updated.`,
      agentId,
      isVisible: isVisible !== false,
    });
  } catch (error) {
    logger.error('[PATCH /api/admin/agents] error:', error);
    return createServerError(error);
  }
}
