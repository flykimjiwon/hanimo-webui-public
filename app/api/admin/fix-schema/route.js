import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';

export async function GET(request) {
    try {
        const authResult = verifyAdminWithResult(request);
        if (!authResult.valid) {
            return NextResponse.json(
                { error: authResult.error || 'Admin privileges required.' },
                { status: 403 }
            );
        }

        const columnsToAdd = [
            "ADD COLUMN IF NOT EXISTS auth_type VARCHAR(50) DEFAULT 'local'",
            "ADD COLUMN IF NOT EXISTS employee_no VARCHAR(50)",
            "ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50)",
            "ADD COLUMN IF NOT EXISTS sso_user_id VARCHAR(100)",
            "ADD COLUMN IF NOT EXISTS company_code VARCHAR(20)",
            "ADD COLUMN IF NOT EXISTS company_name VARCHAR(100)",
            "ADD COLUMN IF NOT EXISTS company_id VARCHAR(50)",
            "ADD COLUMN IF NOT EXISTS department_id VARCHAR(50)",
            "ADD COLUMN IF NOT EXISTS department_no VARCHAR(50)",
            "ADD COLUMN IF NOT EXISTS department_location VARCHAR(100)",
            "ADD COLUMN IF NOT EXISTS employee_position_name VARCHAR(50)",
            "ADD COLUMN IF NOT EXISTS employee_class VARCHAR(50)",
            "ADD COLUMN IF NOT EXISTS employee_security_level VARCHAR(20)",
            "ADD COLUMN IF NOT EXISTS lang VARCHAR(10) DEFAULT 'ko'",
            "ADD COLUMN IF NOT EXISTS login_deny_yn CHAR(1) DEFAULT 'N'",
            "ADD COLUMN IF NOT EXISTS auth_result VARCHAR(10)",
            "ADD COLUMN IF NOT EXISTS auth_result_message TEXT",
            "ADD COLUMN IF NOT EXISTS auth_event_id VARCHAR(100)",
            "ADD COLUMN IF NOT EXISTS sso_result_code VARCHAR(10)",
            "ADD COLUMN IF NOT EXISTS sso_response_datetime TIMESTAMP",
            "ADD COLUMN IF NOT EXISTS sso_transaction_id VARCHAR(100)"
        ];

        for (const columnDef of columnsToAdd) {
            await query(`ALTER TABLE users ${columnDef}`);
        }

        // Create indexes (auth_type, employee_no)
        await query(`CREATE INDEX IF NOT EXISTS idx_users_auth_type ON users(auth_type)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_users_employee_no ON users(employee_no)`);

        return NextResponse.json({ success: true, message: 'Schema updated successfully' });
    } catch (error) {
        logger.error('Schema update failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
