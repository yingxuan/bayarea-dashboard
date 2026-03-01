/**
 * Vercel Serverless Function: /api/portfolio/*
 * Routes to holdings, settings, and value-series handlers
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleHoldings } from "../../api-handlers/portfolio/holdings.js";
import { handleSettings } from "../../api-handlers/portfolio/settings.js";
import { handleValueSeries } from "../../api-handlers/portfolio/value-series.js";
import { setCorsHeaders, handleOptions } from "../../lib/api-utils.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(res, req);
  if (handleOptions(req, res)) return;

  const pathname = (typeof req.url === "string" ? req.url : "").split("?")[0] || "";
  const action = pathname.replace(/^\/api\/portfolio\/?/, "").trim()
    || (Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug)
    || "";

  switch (action) {
    case 'holdings':
      return handleHoldings(req, res);
    case 'settings':
      return handleSettings(req, res);
    case 'value-series':
      return handleValueSeries(req, res);
    default:
      res.status(404).json({ error: 'Not found' });
  }
}
