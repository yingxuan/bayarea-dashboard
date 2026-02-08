/**
 * Vercel Serverless Function: /api/portfolio/holdings
 * GET - Get user holdings
 * PUT - Update user holdings
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleHoldings } from "../../api-handlers/portfolio/holdings.js";
import { setCorsHeaders, handleOptions } from "../utils.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  setCorsHeaders(res, req);

  if (handleOptions(req, res)) {
    return;
  }

  await handleHoldings(req, res);
}
