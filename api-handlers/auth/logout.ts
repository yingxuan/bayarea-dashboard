/**
 * Logout Handler
 * POST /api/auth/logout
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClearCookieHeaders } from "../../server/jwt.js";

export async function handleLogout(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Clear both cookies at once (array form prevents the last-write-wins overwrite bug)
  res.setHeader("Set-Cookie", getClearCookieHeaders());

  res.status(200).json({ success: true });
}
