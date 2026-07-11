import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';
import { generateApiToken, hashApiToken } from '@/lib/apiTokenUtils';
import { isValidUUID } from '@/lib/utils';
import { createAuthError, createValidationError, createNotFoundError, createServerError } from '@/lib/errorHandler';

// Helper function to convert dates to ISO strings
function toISOString(dateValue) {
  if (!dateValue) return null;
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue.toISOString();
  }
  if (typeof dateValue === 'string') {
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof dateValue === 'number') {
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

// Get API token list by user
export async function GET(request) {
  try {
    const authResult = verifyAdminWithResult(request);
    if (!authResult.valid) {
      return createAuthError(authResult.error);
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = Math.min(parseInt(searchParams.get('limit')) || 50, 100);
    const skip = (page - 1) * limit;

    // Build filters
    let sql = 'SELECT * FROM api_tokens';
    const params = [];
    let paramIndex = 1;

    if (userId) {
      sql += ` WHERE user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, skip);

    // Fetch token list
    const tokensResult = await query(sql, params);
    const tokens = tokensResult.rows.map((row) => ({
      _id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      name: row.name,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      isActive: row.is_active,
      lastUsedAt: row.last_used_at,
      createdBy: row.created_by,
    }));

    // Join user information
    const userIds = [...new Set(tokens.map((t) => t.userId).filter(Boolean))];
    let usersResult;
    if (userIds.length > 0) {
      const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');
      usersResult = await query(
        `SELECT id, email, name, department, cell, role FROM users WHERE id IN (${placeholders})`,
        userIds
      );
    } else {
      usersResult = { rows: [] };
    }
    const users = usersResult.rows.map((row) => ({
      _id: row.id,
      id: row.id,
      email: row.email,
      name: row.name,
      department: row.department,
      cell: row.cell,
      role: row.role,
    }));

    const userMap = {};
    users.forEach((user) => {
      // PostgreSQL compatibility: use id or _id
      const userId = user._id || user.id;
      if (!userId) {
        logger.warn('[API Tokens GET] Found user without a user ID:', user);
        return;
      }
      const userIdStr = userId.toString();
      userMap[userIdStr] = {
        _id: userIdStr,
        email: user.email,
        name: user.name,
        department: user.department,
        cell: user.cell,
        role: user.role,
      };
    });

    // Add user information
    const tokensWithUsers = tokens.map((token) => {
      // PostgreSQL compatibility: use id or _id
      const tokenId = token._id || token.id;
      return {
        ...token,
        _id: tokenId ? tokenId.toString() : null,
        userId: token.userId,
        user: userMap[token.userId] || null,
        // Convert date fields to ISO strings
        createdAt: toISOString(token.createdAt),
        expiresAt: toISOString(token.expiresAt),
        lastUsedAt: toISOString(token.lastUsedAt),
      };
    });

    // Fetch stats
    let countSql = 'SELECT COUNT(*) as count FROM api_tokens';
    const countParams = [];
    if (userId) {
      countSql += ' WHERE user_id = $1';
      countParams.push(userId);
    }
    const countResult = await query(countSql, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Usage stats (queried from PostgreSQL external_api_logs)
    const tokenHashes = tokens.map((t) => t.tokenHash).filter(Boolean);
    let usageMap = {};
    
    if (tokenHashes.length > 0) {
      try {
        const placeholders = tokenHashes.map((_, i) => `$${i + 1}`).join(', ');
        const usageStatsResult = await query(
          `SELECT token_hash as _id,
                  COUNT(*)::INTEGER as request_count,
                  COALESCE(SUM(total_token_count), 0)::INTEGER as total_tokens,
                  MAX(timestamp) as last_used
           FROM external_api_logs
           WHERE token_hash IN (${placeholders})
           GROUP BY token_hash`,
          tokenHashes
        );
        
        usageStatsResult.rows.forEach((stat) => {
          usageMap[stat._id] = {
            requestCount: parseInt(stat.request_count || 0),
            totalTokens: parseInt(stat.total_tokens || 0),
            lastUsed: stat.last_used,
          };
        });
      } catch (usageError) {
        logger.error('[API Tokens GET] Failed to fetch usage stats:', usageError);
        // Return token list even if usage lookup fails
      }
    }

    const tokensWithUsage = tokensWithUsers.map((token) => ({
      ...token,
      usage: {
        requestCount: usageMap[token.tokenHash]?.requestCount || 0,
        totalTokens: usageMap[token.tokenHash]?.totalTokens || 0,
        lastUsed: toISOString(usageMap[token.tokenHash]?.lastUsed),
      },
    }));

    return NextResponse.json({
      success: true,
      data: {
        tokens: tokensWithUsage,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    logger.error('[API Tokens GET] Error:', error);
    return createServerError(error, 'Failed to fetch key list');
  }
}

// Issue a new API token
export async function POST(request) {
  try {
    const authResult = verifyAdminWithResult(request);
    if (!authResult.valid) {
      return createAuthError(authResult.error);
    }

    const body = await request.json();
    const { userId, name, expiresInDays = 90 } = body;

    if (!userId) {
      return createValidationError('User ID is required.');
    }

    // UUID validation
    if (!isValidUUID(userId)) {
      return createValidationError('Invalid user ID.');
    }

    // Fetch user information
    const userResult = await query(
      'SELECT id, email, name, department, cell, role FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return createNotFoundError('User not found.');
    }
    
    const user = userResult.rows[0];
    const userDbIdStr = user.id.toString();

    const expiresIn = expiresInDays * 24 * 60 * 60; // Convert days to seconds
    const token = generateApiToken();
    const tokenHash = hashApiToken(token);

    // Save token information
    const tokenDoc = {
      userId: userDbIdStr,
      tokenHash,
      name: name || `API Token ${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      isActive: true,
      lastUsedAt: null,
      createdBy: authResult.user.id || authResult.user.sub,
    };

    const insertResult = await query(
      `INSERT INTO api_tokens (user_id, token_hash, name, created_at, expires_at, is_active, last_used_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tokenDoc.userId,
        tokenDoc.tokenHash,
        tokenDoc.name,
        tokenDoc.createdAt,
        tokenDoc.expiresAt,
        tokenDoc.isActive,
        tokenDoc.lastUsedAt,
        tokenDoc.createdBy,
      ]
    );

    const insertedToken = insertResult.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        token, // Return the token only on initial issuance
        tokenInfo: {
          _id: insertedToken.id.toString(),
          tokenHash,
          name: tokenDoc.name,
          userId: tokenDoc.userId,
          user: {
            email: user.email,
            name: user.name,
            department: user.department,
          },
          createdAt: toISOString(tokenDoc.createdAt),
          expiresAt: toISOString(tokenDoc.expiresAt),
          isActive: tokenDoc.isActive,
        },
      },
      message: 'The key was issued successfully. This key is shown only this time.',
    });
  } catch (error) {
    logger.error('[API Tokens POST] Error:', error);
    return createServerError(error, 'Failed to issue key');
  }
}

// Delete or deactivate token
export async function DELETE(request) {
  try {
    const authResult = verifyAdminWithResult(request);
    if (!authResult.valid) {
      return createAuthError(authResult.error);
    }

    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('id');

    if (!tokenId) {
      return createValidationError('Key ID is required.');
    }

    // UUID validation
    if (!isValidUUID(tokenId)) {
      return createValidationError('Invalid key ID.');
    }

    // Delete token
    const result = await query(
      'DELETE FROM api_tokens WHERE id = $1',
      [tokenId]
    );

    if (result.rowCount === 0) {
      return createNotFoundError('Key not found.');
    }

    return NextResponse.json({
      success: true,
      message: 'Key deleted.',
    });
  } catch (error) {
    logger.error('[API Tokens DELETE] Error:', error);
    return createServerError(error, 'Failed to delete key');
  }
}

// Activate/deactivate token
export async function PATCH(request) {
  try {
    const authResult = verifyAdminWithResult(request);
    if (!authResult.valid) {
      return createAuthError(authResult.error);
    }

    const body = await request.json();
    const { id, isActive } = body;

    if (!id || typeof isActive !== 'boolean') {
      return createValidationError('Key ID and isActive status are required.');
    }

    // UUID validation
    if (!isValidUUID(id)) {
      return createValidationError('Invalid key ID.');
    }

    const result = await query(
      'UPDATE api_tokens SET is_active = $1, updated_at = $2 WHERE id = $3',
      [isActive, new Date(), id]
    );

    if (result.rowCount === 0) {
      return createNotFoundError('Key not found.');
    }

    return NextResponse.json({
      success: true,
      message: `Key has been ${isActive ? 'activated' : 'deactivated'}.`,
    });
  } catch (error) {
    logger.error('[API Tokens PATCH] Error:', error);
    return createServerError(error, 'Failed to change key status');
  }
}
