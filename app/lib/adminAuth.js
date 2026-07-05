import logger from '@/lib/logger';
import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';

/**
 * Admin authorization verification middleware
 */
export function verifyAdmin(request) {
  const authHeader = request.headers.get("authorization");
  
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const token = authHeader.split(" ")[1];
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check admin privileges
    if (payload.role !== 'admin') {
      return NextResponse.json({ error: "Admin privileges required." }, { status: 403 });
    }
    
    return { 
      success: true, 
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role
      }
    };
  } catch (error) {
    logger.info('[Admin Auth] JWT token verification failed:', error.message, 'Token length:', token?.length || 0);
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }
}

/**
 * Admin or Manager authorization verification
 * Managers can access admin pages in read-only mode
 */
export function verifyAdminOrManager(request) {
  const authHeader = request.headers.get("authorization");
  
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const token = authHeader.split(" ")[1];
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!['admin', 'manager'].includes(payload.role)) {
      return NextResponse.json({ error: "Admin or manager privileges required." }, { status: 403 });
    }
    
    return { 
      success: true, 
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role
      }
    };
  } catch (error) {
    logger.info('[Admin Auth] JWT token verification failed:', error.message, 'Token length:', token?.length || 0);
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }
}

/**
 * Admin or regular user authorization verification (when admin views user data)
 */
export function verifyUser(request) {
  const authHeader = request.headers.get("authorization");
  
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const token = authHeader.split(" ")[1];
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    return { 
      success: true, 
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role || 'user',
        department: payload.department,
        cell: payload.cell
      }
    };
  } catch (error) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }
}