import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyAdminWithResult } from '@/lib/auth';
import { query } from '@/lib/postgres';
import {
  createAuthError,
  createValidationError,
  createServerError,
} from '@/lib/errorHandler';

// Retrieve model server error history
export async function GET(request) {
  try {
    // Check admin privileges
    const adminCheck = verifyAdminWithResult(request);
    if (!adminCheck.valid) {
      return createAuthError(adminCheck.error);
    }

    const { searchParams } = new URL(request.url);
    const endpointUrl = searchParams.get('endpoint');
    const provider = searchParams.get('provider');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const hours = parseInt(searchParams.get('hours') || '24', 10);

    // Build base query
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Time range filter
    const hoursAgo = new Date();
    hoursAgo.setHours(hoursAgo.getHours() - hours);
    whereConditions.push(`checked_at >= $${paramIndex}`);
    params.push(hoursAgo.toISOString());
    paramIndex++;

    // Endpoint filter
    if (endpointUrl) {
      whereConditions.push(`endpoint_url = $${paramIndex}`);
      params.push(endpointUrl);
      paramIndex++;
    }

    // Provider filter
    if (provider) {
      whereConditions.push(`provider = $${paramIndex}`);
      params.push(provider);
      paramIndex++;
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

    // Retrieve error history
    const result = await query(
      `SELECT 
        id,
        endpoint_url,
        endpoint_name,
        provider,
        error_message,
        error_type,
        response_time,
        status,
        checked_at,
        metadata
       FROM model_server_error_history
       ${whereClause}
       ORDER BY checked_at DESC
       LIMIT $${paramIndex}`,
      [...params, limit]
    );

    // Retrieve stats
    const statsResult = await query(
      `SELECT 
        COUNT(*) as total_errors,
        COUNT(DISTINCT endpoint_url) as unique_endpoints,
        COUNT(DISTINCT provider) as unique_providers,
        MIN(checked_at) as first_error,
        MAX(checked_at) as last_error
       FROM model_server_error_history
       ${whereClause}`,
      params
    );

    const stats = statsResult.rows[0] || {
      total_errors: 0,
      unique_endpoints: 0,
      unique_providers: 0,
      first_error: null,
      last_error: null,
    };

    // Stats by endpoint
    const endpointStatsResult = await query(
      `SELECT 
        endpoint_url,
        endpoint_name,
        provider,
        COUNT(*) as error_count,
        MAX(checked_at) as last_error_time
       FROM model_server_error_history
       ${whereClause}
       GROUP BY endpoint_url, endpoint_name, provider
       ORDER BY error_count DESC`,
      params
    );

    return NextResponse.json({
      success: true,
      errors: result.rows.map((row) => ({
        id: row.id,
        endpointUrl: row.endpoint_url,
        endpointName: row.endpoint_name,
        provider: row.provider,
        errorMessage: row.error_message,
        errorType: row.error_type,
        responseTime: row.response_time,
        status: row.status,
        checkedAt: row.checked_at,
        metadata: row.metadata,
      })),
      stats: {
        totalErrors: parseInt(stats.total_errors) || 0,
        uniqueEndpoints: parseInt(stats.unique_endpoints) || 0,
        uniqueProviders: parseInt(stats.unique_providers) || 0,
        firstError: stats.first_error,
        lastError: stats.last_error,
      },
      endpointStats: endpointStatsResult.rows.map((row) => ({
        endpointUrl: row.endpoint_url,
        endpointName: row.endpoint_name,
        provider: row.provider,
        errorCount: parseInt(row.error_count) || 0,
        lastErrorTime: row.last_error_time,
      })),
    });
  } catch (error) {
    logger.error('Failed to retrieve model server error history:', error);
    return createServerError(error, 'Failed to load error history.');
  }
}

// Delete model server error history
export async function DELETE(request) {
  try {
    // Check admin privileges
    const adminCheck = verifyAdminWithResult(request);
    if (!adminCheck.valid) {
      return createAuthError(adminCheck.error);
    }

    const { searchParams } = new URL(request.url);
    const endpointUrl = searchParams.get('endpoint');

    if (!endpointUrl) {
      return createValidationError('The endpoint parameter is required.');
    }

    // Delete all error history for a specific endpoint
    const result = await query(
      `DELETE FROM model_server_error_history 
       WHERE endpoint_url = $1`,
      [endpointUrl]
    );

    return NextResponse.json({
      success: true,
      message: 'Error history deleted successfully.',
      deletedCount: result.rowCount || 0,
    });
  } catch (error) {
    logger.error('Failed to delete model server error history:', error);
    return createServerError(error, 'Failed to delete error history.');
  }
}
