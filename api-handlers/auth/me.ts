/**
 * Me Handler
 * GET /api/auth/me
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCurrentUser } from "../../api/utils-auth.js";

export async function handleMe(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await getCurrentUser(req, res);

  if (!user) {
    res.status(200).json({
      authenticated: false,
      user: null,
    });
    return;
  }

  res.status(200).json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
    },
  });
}
