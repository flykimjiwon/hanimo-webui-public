import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyToken } from '@/lib/auth';
import jwt from 'jsonwebtoken';
import { hashApiToken } from '@/lib/apiTokenUtils';
import { JWT_SECRET } from '@/lib/config';
import { isValidUUID } from '@/lib/utils';
import { createAuthError, createValidationError, createNotFoundError, createServerError } from '@/lib/errorHandler';

// Get current user's API token list
export async function GET(request) {
  try {
    const tokenPayload = verifyToken(request);
    if (!tokenPayload) {
      return createAuthError('Authentication required.');
    }

    const userId = tokenPayload.sub || tokenPayload.id;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = Math.min(parseInt(searchParams.get('limit')) || 20, 100);
    const skip = (page - 1) * limit;

    // UUID validation
    if (!isValidUUID(userId)) {
      return createValidationError('Invalid user ID.');
    }

    const tokensResult = await query(
      `SELECT id, user_id, token_hash, name, expires_at, is_active,
              last_used_at, created_by, created_at, updated_at
       FROM api_tokens
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, skip]
    );

    const tokens = tokensResult.rows;

    // Fetch total count
    const totalCountResult = await query(
      `SELECT COUNT(*) as count FROM api_tokens WHERE user_id = $1`,
      [userId]
    );
    const totalCount = parseInt(totalCountResult.rows[0].count);

    // Usage stats (from external_api_logs)
    const tokenHashes = tokens.map((t) => t.token_hash).filter(Boolean);
    let usageStats = [];
    
    if (tokenHashes.length > 0) {
      const placeholders = tokenHashes.map((_, i) => `$${i + 1}`).join(', ');
      const usageStatsResult = await query(
        `SELECT token_hash as _id,
                COUNT(*) as request_count,
                SUM(total_token_count) as total_tokens,
                MAX(timestamp) as last_used
         FROM external_api_logs
         WHERE token_hash IN (${placeholders})
         GROUP BY token_hash`,
        tokenHashes
      );
      usageStats = usageStatsResult.rows;
    }

    const usageMap = {};
    usageStats.forEach((stat) => {
      usageMap[stat._id] = {
        requestCount: parseInt(stat.request_count || 0),
        totalTokens: parseInt(stat.total_tokens || 0),
        lastUsed: stat.last_used,
      };
    });

    const tokensWithUsage = tokens.map((token) => ({
      _id: token.id,
      userId: token.user_id,
      tokenHash: token.token_hash,
      name: token.name,
      expiresAt: token.expires_at,
      isActive: token.is_active,
      lastUsedAt: token.last_used_at,
      createdBy: token.created_by,
      createdAt: token.created_at,
      updatedAt: token.updated_at,
      usage: usageMap[token.token_hash] || {
        requestCount: 0,
        totalTokens: 0,
        lastUsed: null,
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
    logger.error('[User API Tokens GET] Error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
    });
    const errorMessage = error.message || 'An unknown error occurred.';
    const hint = error.hint || (error.code === '42P01' ? 'The api_tokens table does not exist. Please create the schema.' : null);
    return createServerError(error, `Failed to fetch key list: ${errorMessage}${hint ? ` (${hint})` : ''}`);
  }
}

// Issue a new API token (for current user)
export async function POST(request) {
  try {
    const tokenPayload = verifyToken(request);
    if (!tokenPayload) {
      return createAuthError('Authentication required.');
    }

    const userId = tokenPayload.sub || tokenPayload.id;
    const body = await request.json();
    const { name, expiresInDays = 90 } = body;

    // UUID validation
    if (!isValidUUID(userId)) {
      return createValidationError('Invalid user ID.');
    }

    // Fetch user information
    const userResult = await query(
      `SELECT id, email, name, department, cell, role FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return createNotFoundError('User not found.');
    }

    const user = userResult.rows[0];

    // Check for existing active token (limit: 1 per user)
    const existingTokenResult = await query(
      `SELECT COUNT(*) as count FROM api_tokens WHERE user_id = $1 AND is_active = true`,
      [userId]
    );
    if (parseInt(existingTokenResult.rows[0].count) > 0) {
      return createValidationError('An issued key already exists. Delete the existing key before issuing a new one.');
    }

    // Generate JWT token
    const expiresIn = expiresInDays * 24 * 60 * 60; // Convert days to seconds
    const tokenPayloadData = {
      sub: user.id,
      email: user.email,
      name: user.name,
      department: user.department,
      cell: user.cell,
      role: user.role || 'user',
      type: 'api_token', // Indicates this is an API token
    };

    const token = jwt.sign(tokenPayloadData, JWT_SECRET, {
      expiresIn: `${expiresInDays}d`,
    });

    const tokenHash = hashApiToken(token);

    // Save token information
    const tokenName = name || `API Token ${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const insertResult = await query(
      `INSERT INTO api_tokens (user_id, token_hash, name, expires_at, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, user_id, token_hash, name, expires_at, is_active, created_at`,
      [userId, tokenHash, tokenName, expiresAt, true, userId]
    );

    const tokenInfo = insertResult.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        token, // Return token only on initial issuance
        tokenInfo: {
          _id: tokenInfo.id,
          tokenHash: tokenInfo.token_hash,
          name: tokenInfo.name,
          userId: tokenInfo.user_id,
          createdAt: tokenInfo.created_at,
          expiresAt: tokenInfo.expires_at,
          isActive: tokenInfo.is_active,
        },
      },
      message: 'The key was issued successfully. This key is shown only this time.',
    });
  } catch (error) {
    logger.error('[User API Tokens POST] Error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
    });
    return createServerError(error, `Failed to issue key: ${error.message || 'An unknown error occurred.'}`);
  }
}

// Delete token (current user's token only)
export async function DELETE(request) {
  try {
    const tokenPayload = verifyToken(request);
    if (!tokenPayload) {
      return createAuthError('Authentication required.');
    }

    const userId = tokenPayload.sub || tokenPayload.id;
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('id');

    if (!tokenId) {
      return createValidationError('Key ID is required.');
    }

    // UUID validation
    if (!isValidUUID(tokenId) || !isValidUUID(userId)) {
      return createValidationError('Invalid key ID.');
    }

    // Verify ownership, then delete
    const result = await query(
      `DELETE FROM api_tokens WHERE id = $1 AND user_id = $2`,
      [tokenId, userId]
    );

    if (result.rowCount === 0) {
      return createNotFoundError('Key not found or unauthorized to delete.');
    }

    return NextResponse.json({
      success: true,
      message: 'Key deleted.',
    });
  } catch (error) {
    logger.error('[User API Tokens DELETE] Error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
    });
    return createServerError(error, `Failed to delete key: ${error.message || 'An unknown error occurred.'}`);
  }
}

// Activate/deactivate token (current user's token only)
export async function PATCH(request) {
  try {
    const tokenPayload = verifyToken(request);
    if (!tokenPayload) {
      return createAuthError('Authentication required.');
    }

    const userId = tokenPayload.sub || tokenPayload.id;
    const body = await request.json();
    const { id, isActive } = body;

    if (!id || typeof isActive !== 'boolean') {
      return createValidationError('Key ID and isActive status are required.');
    }

    // UUID validation
    if (!isValidUUID(id) || !isValidUUID(userId)) {
      return createValidationError('Invalid key ID.');
    }

    // Verify ownership, then update
    const result = await query(
      `UPDATE api_tokens SET is_active = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
      [isActive, id, userId]
    );

    if (result.rowCount === 0) {
      return createNotFoundError('Key not found or unauthorized to modify.');
    }

    return NextResponse.json({
      success: true,
      message: `Key has been ${isActive ? 'activated' : 'deactivated'}.`,
    });
  } catch (error) {
    logger.error('[User API Tokens PATCH] Error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
    });
    return createServerError(error, `Failed to change key status: ${error.message || 'An unknown error occurred.'}`);
  }
}
