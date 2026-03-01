/**
 * Login Handler
 * POST /api/auth/login
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyUser } from "../../server/authDB.js";
import { generateTokenPair, getSetCookieHeaders } from "../../server/jwt.js";

interface LoginBody {
  email: string;
  password: string;
}

export async function handleLogin(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as LoginBody;

  // Validate input
  if (!body.email || typeof body.email !== "string") {
    res.status(400).json({ error: "邮箱不能为空" });
    return;
  }

  if (!body.password || typeof body.password !== "string") {
    res.status(400).json({ error: "密码不能为空" });
    return;
  }

  try {
    const user = await verifyUser(body.email, body.password);

    if (!user) {
      res.status(401).json({ error: "邮箱或密码错误" });
      return;
    }

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokenPair(user.id, user.email);

    // Set both cookies at once (array form prevents the last-write-wins overwrite bug)
    res.setHeader("Set-Cookie", getSetCookieHeaders(accessToken, refreshToken));

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
      },
    });
  } catch (error) {
    console.error("[auth/login] Error:", error);
    res.status(500).json({ error: "登录失败，请稍后重试" });
  }
}
