import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

/**
 * Token validation API
 */
export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Authentication token is required." }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    
    if (!token) {
      return NextResponse.json({ error: "Token was not provided." }, { status: 401 });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      
      // Return user info if token is valid
      return NextResponse.json({
        success: true,
        user: {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          role: payload.role || 'user',
          department: payload.department,
          cell: payload.cell
        },
        tokenInfo: {
          iat: payload.iat,
          exp: payload.exp,
          expiresIn: payload.exp - Math.floor(Date.now() / 1000)
        }
      });

    } catch (jwtError) {
      logger.info('[Auth Validate] JWT verification failed:', jwtError.message);
      
      // Specific response based on JWT error type
      if (jwtError.name === 'TokenExpiredError') {
        return NextResponse.json({ 
          error: "Token has expired.", 
          errorType: "expired" 
        }, { status: 401 });
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        return NextResponse.json({ 
          error: "Invalid token.", 
          errorType: "invalid" 
        }, { status: 401 });
      }
      
      return NextResponse.json({ 
        error: "Token validation failed.", 
        errorType: "validation_failed" 
      }, { status: 401 });
    }

  } catch (error) {
    logger.error('[Auth Validate] Error during token validation:', error);
    return NextResponse.json({ 
      error: "Server error occurred.",
      errorType: "server_error" 
    }, { status: 500 });
  }
}