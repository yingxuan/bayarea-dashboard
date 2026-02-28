/**
 * Forgot Password Handler
 * POST /api/auth/forgot-password
 *
 * Generates a password reset token. In production, this should
 * send an email with the reset link. Currently logs the link to console.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createPasswordResetToken } from "../../server/authDB.js";

interface ForgotPasswordBody {
  email: string;
}

export async function handleForgotPassword(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as ForgotPasswordBody;

  if (!body.email || typeof body.email !== "string") {
    res.status(400).json({ error: "邮箱不能为空" });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    res.status(400).json({ error: "邮箱格式不正确" });
    return;
  }

  try {
    const token = await createPasswordResetToken(body.email);

    // Always return success to prevent email enumeration
    const response: Record<string, unknown> = {
      success: true,
      message: "如果该邮箱已注册，您将收到密码重置链接",
    };

    if (token) {
      const origin = req.headers.origin || req.headers.host || "localhost:3000";
      const protocol = origin.startsWith("localhost") ? "http" : "https";
      const resetUrl = `${protocol}://${origin}/reset-password?token=${token}`;

      // TODO: Send email with resetUrl in production (e.g. Resend, SendGrid)
      console.warn(`[auth/forgot-password] Reset link for ${body.email}: ${resetUrl}`);

      // Expose token in dev for testing
      if (process.env.NODE_ENV !== "production") {
        response.resetUrl = resetUrl;
        response.token = token;
      }
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("[auth/forgot-password] Error:", error);
    res.status(500).json({ error: "操作失败，请稍后重试" });
  }
}
