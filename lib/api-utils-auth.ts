/**
 * Authentication utilities for Vercel serverless API functions
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  verifyToken,
  parseCookies,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  generateTokenPair,
  getSetCookieHeaders,
  TokenPayload,
} from "../server/jwt.js";
import { getUserById } from "../server/authDB.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  display_name: string | null;
}

export interface AuthResult {
  user: AuthenticatedUser | null;
  error?: string;
  newTokens?: { accessToken: string; refreshToken: string };
}

/**
 * Authenticate request from cookies
 * Returns user info if authenticated, null otherwise
 * Handles token refresh automatically
 */
export async function authenticateRequest(req: VercelRequest): Promise<AuthResult> {
  const cookieHeader = req.headers.cookie;
  const cookies = parseCookies(cookieHeader as string | undefined);

  const accessToken = cookies[ACCESS_TOKEN_COOKIE];
  const refreshToken = cookies[REFRESH_TOKEN_COOKIE];

  // Try access token first
  if (accessToken) {
    const payload = await verifyToken(accessToken);
    if (payload && payload.type === "access") {
      const user = await getUserById(payload.userId);
      if (user) {
        return {
          user: {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
          },
        };
      }
    }
  }

  // Try refresh token if access token is invalid
  if (refreshToken) {
    const payload = await verifyToken(refreshToken);
    if (payload && payload.type === "refresh") {
      const user = await getUserById(payload.userId);
      if (user) {
        // Generate new token pair
        const newTokens = await generateTokenPair(user.id, user.email);
        return {
          user: {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
          },
          newTokens,
        };
      }
    }
  }

  return { user: null };
}

/**
 * Middleware helper: require authentication
 * Returns 401 if not authenticated
 */
export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthenticatedUser | null> {
  const result = await authenticateRequest(req);

  if (!result.user) {
    res.status(401).json({ error: "Unauthorized", message: "请先登录" });
    return null;
  }

  // Set new tokens if refreshed (array form prevents the last-write-wins overwrite bug)
  if (result.newTokens) {
    res.setHeader(
      "Set-Cookie",
      getSetCookieHeaders(result.newTokens.accessToken, result.newTokens.refreshToken)
    );
  }

  return result.user;
}

/**
 * Get current user without requiring auth
 * Returns null if not authenticated (doesn't return 401)
 */
export async function getCurrentUser(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthenticatedUser | null> {
  const result = await authenticateRequest(req);

  // Set new tokens if refreshed (array form prevents the last-write-wins overwrite bug)
  if (result.newTokens) {
    res.setHeader(
      "Set-Cookie",
      getSetCookieHeaders(result.newTokens.accessToken, result.newTokens.refreshToken)
    );
  }

  return result.user;
}
