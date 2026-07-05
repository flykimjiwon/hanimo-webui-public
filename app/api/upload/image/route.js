import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { verifyToken } from '@/lib/auth';
import { randomBytes } from 'crypto';

export async function POST(request) {
  try {
    // Validate token (logged-in users only)
    const payload = verifyToken(request);
    if (!payload) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const data = await request.formData();
    const file = data.get('image');

    if (!file) {
      return NextResponse.json({ error: 'Image file is required.' }, { status: 400 });
    }

    // Validate file size (10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size cannot exceed 10MB.' }, { status: 400 });
    }

    // Validate file extension
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type. (Only JPG, PNG, GIF, and WebP are supported)' }, { status: 400 });
    }

    // Generate filename (timestamp + random + extension)
    const timestamp = Date.now();
    const random = randomBytes(8).toString('hex');
    const extension = file.name.split('.').pop();
    const fileName = `${timestamp}_${random}.${extension}`;

    // Create upload directory
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'images');
    try {
      await mkdir(uploadDir, { recursive: true });
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        logger.warn('[upload-image] Failed to create directory:', error);
      }
    }

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filePath = join(uploadDir, fileName);
    
    await writeFile(filePath, buffer);

    // Generate public URL
    const imageUrl = `/uploads/images/${fileName}`;

    return NextResponse.json({
      success: true,
      url: imageUrl,
      filename: fileName,
      size: file.size,
      type: file.type
    });

  } catch (error) {
    logger.error('Image upload failed:', error);
    return NextResponse.json(
      { error: 'Failed to upload image.' },
      { status: 500 }
    );
  }
}

// File-size limit settings
export const runtime = 'nodejs';
export const maxDuration = 30; // 30-second limit
