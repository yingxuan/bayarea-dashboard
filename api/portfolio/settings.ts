/**
 * Vercel Serverless Function: /api/portfolio/settings
 * GET - Get user settings
 * PUT - Update user settings
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleSettings } from "../../api-handlers/portfolio/settings.js";
import { setCorsHeaders, handleOptions } from "../utils.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  setCorsHeaders(res, req);

  if (handleOptions(req, res)) {
    return;
  }

  await handleSettings(req, res);
}
