/**
 * Forgot Password Handler
 * POST /api/auth/forgot-password
 *
 * Generates a password reset token and sends the reset link by email.
 * Supports two backends (no public domain required):
 *
 * 1) SMTP (e.g. Gmail / Outlook) – 推荐，无需公开域名
 *    SMTP_HOST, SMTP_PORT (optional, default 587), SMTP_SECURE (optional, default false),
 *    SMTP_USER, SMTP_PASS, SMTP_FROM (e.g. "湾区仪表盘 <your@gmail.com>")
 *
 * 2) Resend (optional) – 可用默认发件人 onboarding@resend.dev，无需验证域名
 *    RESEND_API_KEY, RESEND_FROM_EMAIL (optional)
 *
 * Also: FRONTEND_URL for the reset link base URL.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { createPasswordResetToken } from "../../server/authDB.js";

interface ForgotPasswordBody {
  email: string;
}

function getResetLinkOrigin(req: VercelRequest): string {
  const fromEnv = process.env.FRONTEND_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const origin = req.headers.origin || req.headers["x-forwarded-host"] || req.headers.host;
  const host = typeof origin === "string" ? origin : Array.isArray(origin) ? origin[0] : "";
  if (!host) return "https://bayarea-dashboard.vercel.app";
  // origin may already be a full URL (e.g. https://bayarea-dashboard.vercel.app)
  if (host.startsWith("http://") || host.startsWith("https://")) {
    return host.replace(/\/$/, "");
  }
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
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
      const baseUrl = getResetLinkOrigin(req);
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      const html = `
        <p>您请求了重置密码。</p>
        <p>请点击下方链接设置新密码（30分钟内有效）：</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>如非本人操作，请忽略此邮件。</p>
      `;
      const subject = "重置密码 - 湾区仪表盘";
      let sent = false;

      // 1) Prefer SMTP (Gmail/Outlook/any SMTP) – no public domain needed
      const smtpHost = process.env.SMTP_HOST?.trim();
      const smtpUser = process.env.SMTP_USER?.trim();
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM?.trim() || "湾区仪表盘 <noreply@localhost>";

      if (smtpHost && smtpUser && smtpPass) {
        try {
          const port = Number(process.env.SMTP_PORT) || 587;
          const secure = process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1";
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port,
            secure,
            auth: { user: smtpUser, pass: smtpPass },
          });
          await transporter.sendMail({
            from: smtpFrom,
            to: body.email,
            subject,
            html,
          });
          sent = true;
          console.info("[auth/forgot-password] SMTP send ok for", body.email);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[auth/forgot-password] SMTP send failed:", msg);
        }
      } else if (!sent) {
        if (!smtpHost || !smtpUser || !smtpPass) {
          console.warn("[auth/forgot-password] SMTP not configured (need SMTP_HOST, SMTP_USER, SMTP_PASS)");
        }
      }

      // 2) Fallback to Resend (can use onboarding@resend.dev without verifying domain)
      if (!sent && process.env.RESEND_API_KEY) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const fromEmail =
            process.env.RESEND_FROM_EMAIL?.trim() || "湾区仪表盘 <onboarding@resend.dev>";
          const { error } = await resend.emails.send({
            from: fromEmail,
            to: [body.email],
            subject,
            html,
          });
          if (!error) sent = true;
          else console.error("[auth/forgot-password] Resend error:", error);
        } catch (err) {
          console.error("[auth/forgot-password] Resend send failed:", err);
        }
      }

      if (!sent) {
        console.warn(
          "[auth/forgot-password] No SMTP or Resend configured; reset link not emailed."
        );
        console.warn(`[auth/forgot-password] Reset link for ${body.email}: ${resetUrl}`);
      }

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
