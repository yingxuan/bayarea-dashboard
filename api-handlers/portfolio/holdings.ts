/**
 * Holdings Handler
 * GET /api/portfolio/holdings - Get user holdings
 * PUT /api/portfolio/holdings - Update user holdings (replace all)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../api/utils-auth.js";
import {
  getUserHoldings,
  replaceAllHoldings,
  UserHolding,
} from "../../server/authDB.js";

interface HoldingInput {
  ticker: string;
  shares: number;
  avgCost?: number;
}

interface HoldingsUpdateBody {
  holdings: HoldingInput[];
}

function formatHolding(h: UserHolding) {
  return {
    id: h.id,
    ticker: h.ticker,
    shares: h.shares,
    avgCost: h.avg_cost,
  };
}

export async function handleGetHoldings(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const holdings = getUserHoldings(user.id);
    res.status(200).json({
      success: true,
      holdings: holdings.map(formatHolding),
    });
  } catch (error) {
    console.error("[portfolio/holdings] GET error:", error);
    res.status(500).json({ error: "获取持仓失败" });
  }
}

export async function handleUpdateHoldings(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const user = await requireAuth(req, res);
  if (!user) return;

  const body = req.body as HoldingsUpdateBody;

  // Validate input
  if (!body.holdings || !Array.isArray(body.holdings)) {
    res.status(400).json({ error: "holdings 必须是数组" });
    return;
  }

  // Validate each holding
  for (const h of body.holdings) {
    if (!h.ticker || typeof h.ticker !== "string") {
      res.status(400).json({ error: "每个持仓必须有有效的 ticker" });
      return;
    }
    if (typeof h.shares !== "number" || h.shares < 0) {
      res.status(400).json({ error: `${h.ticker}: shares 必须是非负数` });
      return;
    }
    if (
      h.avgCost != null &&
      (typeof h.avgCost !== "number" || h.avgCost < 0)
    ) {
      res.status(400).json({ error: `${h.ticker}: avgCost 必须是非负数` });
      return;
    }
  }

  try {
    const holdings = replaceAllHoldings(user.id, body.holdings);
    res.status(200).json({
      success: true,
      holdings: holdings.map(formatHolding),
    });
  } catch (error) {
    console.error("[portfolio/holdings] PUT error:", error);
    res.status(500).json({ error: "更新持仓失败" });
  }
}

export async function handleHoldings(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  switch (req.method) {
    case "GET":
      await handleGetHoldings(req, res);
      break;
    case "PUT":
      await handleUpdateHoldings(req, res);
      break;
    default:
      res.status(405).json({ error: "Method not allowed" });
  }
}
