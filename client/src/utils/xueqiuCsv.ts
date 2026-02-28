/**
 * Parser for Xueqiu (雪球) portfolio export CSV
 * Format: 持仓信息 section with header "名称,代码,现价,涨跌,市值,持仓,摊薄/成本,浮动盈亏,累积盈亏"
 */

const HOLDINGS_HEADER =
  "名称,代码,现价,涨跌,市值,持仓,摊薄/成本,浮动盈亏,累积盈亏";

/** Ticker in col 1, shares in col 5 (持仓) - match a holdings data row */
function isHoldingsDataRow(cols: string[]): boolean {
  if (cols.length < 6) return false;
  const ticker = (cols[1] ?? "").trim().toUpperCase();
  const sharesRaw = (cols[5] ?? "").replace(/,/g, "");
  const shares = parseFloat(sharesRaw);
  return /^[A-Z0-9]{1,6}$/.test(ticker) && Number.isFinite(shares) && shares > 0;
}

export interface XueqiuHolding {
  ticker: string;
  shares: number;
  avgCost?: number;
}

function parseCost(cell: string): number | undefined {
  const s = cell.trim();
  if (!s) return undefined;
  // Format "612.236/613.876" or "74.117/74.117" -> use first number (摊薄)
  const part = s.includes("/") ? s.split("/")[0].trim() : s;
  const n = parseFloat(part.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Parse one Xueqiu CSV file text into holdings (ticker, shares, avgCost).
 * Merges duplicate tickers within the same file by summing shares and weighting avgCost.
 */
export function parseXueqiuCsv(csvText: string): XueqiuHolding[] {
  const normalized = csvText.replace(/^\uFEFF/, "").trim();
  const lines = normalized.split(/\r\n|\r|\n/).map((line) => line.trim());

  let headerIndex = lines.findIndex(
    (line) =>
      line === HOLDINGS_HEADER ||
      (line.includes("代码") && line.includes("持仓") && line.includes("摊薄")) ||
      (line.includes("代码") && line.includes("持仓") && line.includes("成本"))
  );

  if (headerIndex < 0) {
    const dataRowIndex = lines.findIndex((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return isHoldingsDataRow(cols);
    });
    if (dataRowIndex > 0) headerIndex = dataRowIndex - 1;
    else return [];
  }

  const byTicker = new Map<string, { shares: number; costSum: number }>();

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith("交易记录") || line.startsWith("转账记录"))
      break;
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 6) continue;
    const ticker = (cols[1] ?? "").toUpperCase();
    const sharesRaw = (cols[5] ?? "").replace(/,/g, "");
    const shares = parseFloat(sharesRaw);
    if (!ticker || !Number.isFinite(shares) || shares <= 0) continue;
    if (!/^[A-Z0-9]{1,6}$/.test(ticker)) continue;

    const avgCost = parseCost(cols[6] ?? "");
    const existing = byTicker.get(ticker);
    if (existing) {
      const totalShares = existing.shares + shares;
      const totalCostSum =
        existing.costSum + (Number.isFinite(avgCost) && avgCost != null ? avgCost * shares : 0);
      byTicker.set(ticker, {
        shares: totalShares,
        costSum: totalCostSum,
      });
    } else {
      byTicker.set(ticker, {
        shares,
        costSum:
          Number.isFinite(avgCost) && avgCost != null ? avgCost * shares : 0,
      });
    }
  }

  return Array.from(byTicker.entries()).map(([ticker, { shares, costSum }]) => ({
    ticker,
    shares,
    avgCost:
      costSum > 0 && shares > 0 ? Math.round((costSum / shares) * 100) / 100 : undefined,
  }));
}

/**
 * Parse multiple CSV texts and merge holdings by ticker (sum shares, weighted avg cost).
 */
export function parseAndMergeXueqiuCsvFiles(csvTexts: string[]): XueqiuHolding[] {
  const byTicker = new Map<string, { shares: number; costSum: number }>();

  for (const text of csvTexts) {
    const list = parseXueqiuCsv(text);
    for (const h of list) {
      const existing = byTicker.get(h.ticker);
      const costSum = (h.avgCost ?? 0) * h.shares;
      if (existing) {
        existing.shares += h.shares;
        existing.costSum += costSum;
      } else {
        byTicker.set(h.ticker, { shares: h.shares, costSum });
      }
    }
  }

  return Array.from(byTicker.entries()).map(([ticker, { shares, costSum }]) => ({
    ticker,
    shares,
    avgCost:
      costSum > 0 && shares > 0 ? Math.round((costSum / shares) * 100) / 100 : undefined,
  }));
}
