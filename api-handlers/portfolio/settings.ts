/**
 * Settings Handler
 * GET /api/portfolio/settings - Get user settings
 * PUT /api/portfolio/settings - Update user settings
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../lib/api-utils-auth.js";
import { getUserSettings, updateUserSettings } from "../../server/authDB.js";

interface SettingsUpdateBody {
  ytdBaseline?: number | null;
}

export async function handleGetSettings(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const settings = getUserSettings(user.id);
    res.status(200).json({
      success: true,
      settings: {
        ytdBaseline: settings?.ytd_baseline ?? null,
      },
    });
  } catch (error) {
    console.error("[portfolio/settings] GET error:", error);
    res.status(500).json({ error: "获取设置失败" });
  }
}

export async function handleUpdateSettings(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const user = await requireAuth(req, res);
  if (!user) return;

  const body = req.body as SettingsUpdateBody;

  // Validate ytdBaseline if provided
  if (body.ytdBaseline !== undefined && body.ytdBaseline !== null) {
    if (typeof body.ytdBaseline !== "number" || body.ytdBaseline < 0) {
      res.status(400).json({ error: "ytdBaseline 必须是非负数" });
      return;
    }
  }

  try {
    const settings = updateUserSettings(user.id, {
      ytdBaseline: body.ytdBaseline,
    });
    res.status(200).json({
      success: true,
      settings: {
        ytdBaseline: settings.ytd_baseline ?? null,
      },
    });
  } catch (error) {
    console.error("[portfolio/settings] PUT error:", error);
    res.status(500).json({ error: "更新设置失败" });
  }
}

export async function handleSettings(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  switch (req.method) {
    case "GET":
      await handleGetSettings(req, res);
      break;
    case "PUT":
      await handleUpdateSettings(req, res);
      break;
    default:
      res.status(405).json({ error: "Method not allowed" });
  }
}
