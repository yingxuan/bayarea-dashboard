/**
 * Reset Password Handler
 * POST /api/auth/reset-password
 *
 * Verifies the reset token and updates the user's password.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resetPasswordWithToken } from "../../server/authDB.js";

interface ResetPasswordBody {
  token: string;
  password: string;
}

export async function handleResetPassword(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as ResetPasswordBody;

  if (!body.token || typeof body.token !== "string") {
    res.status(400).json({ error: "重置令牌不能为空" });
    return;
  }

  if (!body.password || typeof body.password !== "string") {
    res.status(400).json({ error: "新密码不能为空" });
    return;
  }

  try {
    const result = await resetPasswordWithToken(body.token, body.password);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      message: "密码已重置，请使用新密码登录",
    });
  } catch (error) {
    console.error("[auth/reset-password] Error:", error);
    res.status(500).json({ error: "密码重置失败，请稍后重试" });
  }
}
