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

  // Validate JWT config before touching the DB — prevents orphaned user records
  try {
    await generateTokenPair("__validate__", "__validate__@__validate__");
  } catch {
    res.status(500).json({ error: "服务器配置错误：JWT_SECRET 未正确设置，请联系管理员" });
    return;
  }

  try {
    const user = await createUser(body.email, body.password, body.displayName);

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokenPair(user.id, user.email);

    // Set both cookies at once (array form prevents the last-write-wins overwrite bug)
    res.setHeader("Set-Cookie", getSetCookieHeaders(accessToken, refreshToken));

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
