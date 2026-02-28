/**
 * Auth API Entry Point (Vercel Serverless Function)
 * Routes: /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/me
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleRegister } from "../../api-handlers/auth/register.js";
import { handleLogin } from "../../api-handlers/auth/login.js";
import { handleLogout } from "../../api-handlers/auth/logout.js";
import { handleMe } from "../../api-handlers/auth/me.js";
import { setCorsHeaders, handleOptions } from "../../lib/api-utils.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  setCorsHeaders(res, req);

  // Handle OPTIONS
  if (handleOptions(req, res)) {
    return;
  }

  // Extract route from slug
  const slug = req.query.slug as string[] | undefined;
  const route = slug?.[0] || "";

  try {
    switch (route) {
      case "register":
        await handleRegister(req, res);
        break;
      case "login":
        await handleLogin(req, res);
        break;
      case "logout":
        await handleLogout(req, res);
        break;
      case "me":
        await handleMe(req, res);
        break;
      default:
        res.status(404).json({ error: "Not found" });
    }
  } catch (error) {
    console.error("[auth] Handler error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
