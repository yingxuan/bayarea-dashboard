/**
 * Register Handler
 * POST /api/auth/register
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createUser } from "../../server/authDB.js";
import { generateTokenPair, getSetCookieHeaders } from "../../server/jwt.js";

interface RegisterBody {
  email: string;
  password: string;
  displayName?: string;
}

export async function handleRegister(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as RegisterBody;

  // Validate input
  if (!body.email || typeof body.email !== "string") {
    res.status(400).json({ error: "邮箱不能为空" });
    return;
  }

  if (!body.password || typeof body.password !== "string") {
    res.status(400).json({ error: "密码不能为空" });
    return;
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    res.status(400).json({ error: "邮箱格式不正确" });
    return;
  }

  try {
    const user = await createUser(body.email, body.password, body.displayName);

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokenPair(user.id, user.email);

    // Set cookies
    const cookieHeaders = getSetCookieHeaders(accessToken, refreshToken);
    for (const cookie of cookieHeaders) {
      res.setHeader("Set-Cookie", cookie);
    }

    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "注册失败";
    res.status(400).json({ error: message });
  }
}
