import { Router } from "express";

const router = Router();

/**
 * Legacy API router - kept for backward compatibility
 * Most endpoints have been replaced by Vercel serverless functions in /api/
 * 
 * Only health check endpoint remains active.
 */

// Health check endpoint
router.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    cache: "sqlite",
  });
});

export default router;
