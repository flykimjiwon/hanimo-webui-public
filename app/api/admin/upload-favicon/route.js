import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/adminAuth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request) {
  try {
    // Check admin privileges
    const adminCheck = verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck;
    }

    const formData = await request.formData();
    const file = formData.get('favicon');

    if (!file) {
      return NextResponse.json(
        { error: 'Favicon file is required.' },
        { status: 400 }
      );
    }

    // Validate file
    const allowedTypes = ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Favicon supports only .ico, .png, and .svg files.' },
        { status: 400 }
      );
    }

    // File size limit (1MB)
    if (file.size > 1024 * 1024) {
      return NextResponse.json(
        { error: 'Favicon file size must be 1MB or less.' },
        { status: 400 }
      );
    }

    // Check/create upload directory
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    try {
      await mkdir(uploadDir, { recursive: true });
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        logger.warn('[upload-favicon] Failed to create directory:', error);
      }
    }

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Check file extension
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const fileName = `favicon.${fileExtension}`;
    const filePath = path.join(uploadDir, fileName);
    
    await writeFile(filePath, buffer);

    // Return web path
    const webPath = `/uploads/${fileName}`;

    return NextResponse.json({
      success: true,
      message: 'Favicon uploaded.',
      faviconUrl: webPath
    });

  } catch (error) {
    logger.error('Favicon upload failed:', error);
    return NextResponse.json(
      { error: 'Failed to upload favicon.' },
      { status: 500 }
    );
  }
}
