/**
 * JWT Utilities
 * Using jose library for edge-compatible JWT handling
 */

import { SignJWT, jwtVerify, JWTPayload } from "jose";

// JWT configuration
const ACCESS_TOKEN_EXPIRY = "15m"; // 15 minutes
const REFRESH_TOKEN_EXPIRY = "7d"; // 7 days

export interface TokenPayload extends JWTPayload {
  userId: string;
  email: string;
  type: "access" | "refresh";
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Generate an access token
 */
export async function generateAccessToken(userId: string, email: string): Promise<string> {
  const secret = getJwtSecret();

  const token = await new SignJWT({ userId, email, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(secret);

  return token;
}

/**
 * Generate a refresh token
 */
export async function generateRefreshToken(userId: string, email: string): Promise<string> {
  const secret = getJwtSecret();

  const token = await new SignJWT({ userId, email, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(secret);

  return token;
}

/**
 * Verify and decode a token
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);

    // Validate payload structure
    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      (payload.type !== "access" && payload.type !== "refresh")
    ) {
      return null;
    }

    return payload as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Generate both access and refresh tokens
 */
export async function generateTokenPair(
  userId: string,
  email: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken(userId, email),
    generateRefreshToken(userId, email),
  ]);

  return { accessToken, refreshToken };
}

/**
 * Cookie options for tokens
 */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export const ACCESS_TOKEN_COOKIE = "auth_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

/**
 * Get cookie header string for setting tokens
 */
export function getSetCookieHeaders(
  accessToken: string,
  refreshToken: string
): string[] {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  // Access token: 15 minutes max-age
  const accessCookie = `${ACCESS_TOKEN_COOKIE}=${accessToken}; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=900`;

  // Refresh token: 7 days max-age
  const refreshCookie = `${REFRESH_TOKEN_COOKIE}=${refreshToken}; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=604800`;

  return [accessCookie, refreshCookie];
}

/**
 * Get cookie header string for clearing tokens
 */
export function getClearCookieHeaders(): string[] {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  return [
    `${ACCESS_TOKEN_COOKIE}=; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=0`,
    `${REFRESH_TOKEN_COOKIE}=; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=0`,
  ];
}

/**
 * Parse cookies from cookie header string
 */
export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};

  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(";");

  for (const pair of pairs) {
    const [key, ...valueParts] = pair.trim().split("=");
    if (key) {
      cookies[key.trim()] = valueParts.join("=").trim();
    }
  }

  return cookies;
}
