import "dotenv/config";
import express from "express";
import { ensurePlacePhoto } from "../lib/spend/ensurePlacePhoto.js";
import { handleEnrichPlace } from "../lib/spend/enrich-place.js";
import { refreshNewPlacesSnapshot } from "../lib/spend/new-places-job.js";
import { handleNewPlaces } from "../lib/spend/new-places-runtime.js";
import { kv } from "@vercel/kv";
import { PHOTO_VERSION } from "../lib/spend/photo-cache.js";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import apiRouter from "./api.js";
// Use production API functions (Vercel serverless functions) for local dev
import {
  marketRoute,
  dealsRoute,
  showsRoute,
  youtubersRoute,
  moviesRoute,
  quotesRoute,
  spendTodayRoute,
  leekCommunityRoute,
  gossipCommunityRoute,
  marketNewsRoute,
  portfolioValueSeriesRoute,
  portfolioHoldingsRoute,
  portfolioSettingsRoute,
  fortuneRoute,
  fanwanRoute,
  devPlacesClearCacheRoute,
  musthaveRoute,
  authRoute,
} from "./local-api-adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable JSON parsing
  app.use(express.json());

  // Enable CORS for development (with credentials for auth cookies)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    // Allow localhost origins for development
    if (origin && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
    } else {
      res.header("Access-Control-Allow-Origin", "*");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Mount production API routes (Vercel serverless functions)
  app.get('/api/market', marketRoute);
  app.options('/api/market', (_req, res) => res.sendStatus(200));
  app.get('/api/deals', dealsRoute);
  app.options('/api/deals', (_req, res) => res.sendStatus(200));
  app.get('/api/shows', showsRoute);
  app.options('/api/shows', (_req, res) => res.sendStatus(200));
  app.get('/api/movies', moviesRoute);
  app.options('/api/movies', (_req, res) => res.sendStatus(200));
  app.get('/api/youtubers', youtubersRoute);
  app.options('/api/youtubers', (_req, res) => res.sendStatus(200));
  app.get('/api/quotes', quotesRoute);
  app.options('/api/quotes', (_req, res) => res.sendStatus(200));
  app.get('/api/spend/today', spendTodayRoute);
  app.options('/api/spend/today', (_req, res) => res.sendStatus(200));
  app.get('/api/spend/new-places', handleNewPlaces);
  app.options('/api/spend/new-places', (_req, res) => res.sendStatus(200));
  app.get('/api/spend/musthave', musthaveRoute);
  app.options('/api/spend/musthave', (_req, res) => res.sendStatus(200));
  app.get('/api/community/leeks', leekCommunityRoute);
  app.options('/api/community/leeks', (_req, res) => res.sendStatus(200));
  app.get('/api/community/gossip', gossipCommunityRoute);
  app.options('/api/community/gossip', (_req, res) => res.sendStatus(200));
  app.get('/api/market-news', marketNewsRoute);
  app.options('/api/market-news', (_req, res) => res.sendStatus(200));
  app.get('/api/portfolio/value-series', portfolioValueSeriesRoute);
  app.options('/api/portfolio/value-series', (_req, res) => res.sendStatus(200));
  app.get('/api/fortune', fortuneRoute);
  app.options('/api/fortune', (_req, res) => res.sendStatus(200));
  app.get('/api/youtube/fanwan', fanwanRoute);
  app.options('/api/youtube/fanwan', (_req, res) => res.sendStatus(200));
  app.post('/api/dev/places/clear-cache', devPlacesClearCacheRoute);
  app.options('/api/dev/places/clear-cache', (_req, res) => res.sendStatus(200));

  // Auth routes
  app.post('/api/auth/register', authRoute);
  app.post('/api/auth/login', authRoute);
  app.post('/api/auth/logout', authRoute);
  app.get('/api/auth/me', authRoute);
  app.post('/api/auth/forgot-password', authRoute);
  app.post('/api/auth/reset-password', authRoute);
  app.options('/api/auth/*', (_req, res) => res.sendStatus(200));

  // Portfolio routes (protected)
  app.get('/api/portfolio/holdings', portfolioHoldingsRoute);
  app.put('/api/portfolio/holdings', portfolioHoldingsRoute);
  app.options('/api/portfolio/holdings', (_req, res) => res.sendStatus(200));
  app.get('/api/portfolio/settings', portfolioSettingsRoute);
  app.put('/api/portfolio/settings', portfolioSettingsRoute);
  app.options('/api/portfolio/settings', (_req, res) => res.sendStatus(200));


  app.post("/api/spend/enrich-place", handleEnrichPlace);
  app.get("/api/spend/enrich-place", handleEnrichPlace);
  app.options("/api/spend/enrich-place", (_req, res) => res.sendStatus(200));

  app.get("/api/spend/place-photo", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Photo-Version", PHOTO_VERSION);

    const placeId = (req.query.place_id as string | undefined)?.trim();
    const refresh = req.query.refresh === "1" || req.query.refresh === "true";
    res.setHeader("X-Photo-Refresh", refresh ? "1" : "0");
    const photoName = req.query.photoName as string | undefined;

    // If place_id is provided, use the serverless-style handler to resolve/store the photo.
    if (placeId) {
      try {
        const result = await ensurePlacePhoto(placeId, "ondemand", { refresh });
        try {
          const count = (await kv.get<number>(`metrics:google_places_fetch:v1:${placeId}`)) ?? 0;
          res.setHeader("X-Google-Fetch-Count", String(count));
        } catch {
          res.setHeader("X-Google-Fetch-Count", "unknown");
        }
        if (result.debug?.selected) {
          res.setHeader("X-Photo-Selected", result.debug.selected);
        }
        if (refresh) {
          res.setHeader("X-Photo-Cache", "bypass");
        }
        res
          .status(200)
          .json({
            place_id: placeId,
            photo_local_url: result.photo_local_url ?? null,
            status: result.status,
            source: result.source,
            reason: result.reason,
          });
        return;
      } catch (e: any) {
        console.error("[dev place-photo] failed", e);
        return res.status(500).json({ error: "failed", message: e?.message || "unknown" });
      }
    }

    // Legacy direct-photo proxy by photoName (used by clients requesting the raw image).
    const wRaw = (req.query.w as string | undefined) || "480";
    const allowed = new Set(["320", "480", "640"]);
    if (!photoName || !photoName.startsWith("places/")) {
      return res.status(400).json({ error: "photoName required and must start with places/" });
    }
    if (!allowed.has(wRaw)) {
      return res.status(400).json({ error: "w must be 320|480|640" });
    }
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GOOGLE_PLACES_API_KEY" });
  
    const upstreamUrl = `https://places.googleapis.com/v1/${encodeURI(photoName)}/media?maxWidthPx=${wRaw}`;
    try {
      const upstream = await fetch(upstreamUrl, {
        method: "GET",
        headers: { "X-Goog-Api-Key": apiKey },
        redirect: "follow",
      });
      if (!upstream.ok) {
        return res
          .status(502)
          .set("Cache-Control", "public, max-age=3600, s-maxage=3600")
          .json({ error: "Upstream error", status: upstream.status });
      }
      const ct = upstream.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, s-maxage=2592000, max-age=604800, stale-while-revalidate=86400");
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.status(200).send(buf);
    } catch (e: any) {
      return res
        .status(502)
        .set("Cache-Control", "public, max-age=3600, s-maxage=3600")
        .json({ error: "Fetch failed", message: e?.message });
    }
  });
  
  // Mount legacy API routes (if any)
  app.use(apiRouter);

  const refreshSecret = process.env.NEW_PLACES_REFRESH_SECRET;
  if (refreshSecret) {
    app.post("/api/admin/refresh-new-places", async (req, res) => {
      const token = req.header("x-refresh-new-places-token") || req.query.secret;
      if (token !== refreshSecret) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const previousJobMode = process.env.JOB_MODE;
      try {
        process.env.JOB_MODE = '1';
        const snapshot = await refreshNewPlacesSnapshot();
        return res.json({
          success: true,
          generatedAt: snapshot.generatedAt,
          count: snapshot.places.length,
        });
      } catch (error: any) {
        console.error("[admin refresh new places] failed", error);
        return res.status(500).json({ error: "refresh_failed", message: error?.message });
      } finally {
        if (previousJobMode === undefined) {
          delete process.env.JOB_MODE;
        } else {
          process.env.JOB_MODE = previousJobMode;
        }
      }
    });
  }

  // Only serve static files in production mode
  // In development, Vite dev server handles frontend
  if (process.env.NODE_ENV === "production") {
    const staticPath = path.resolve(__dirname, "public");
    
    app.use(express.static(staticPath));

    // Handle client-side routing - serve index.html for all routes
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  } else {
    // In development, just return API info for non-API routes
    app.get("*", (req, res) => {
      if (!req.path.startsWith("/api")) {
        return res.status(200).json({
          message: "Development mode: Frontend is served by Vite dev server on port 3000",
          api_endpoints: [
            "/api/market",
            "/api/deals",
            "/api/shows",
            "/api/youtubers",
            "/api/quotes",
            "/api/spend/today",
            "/api/community/leeks",
            "/api/community/gossip",
            "/api/market-news",
            "/api/portfolio/value-series"
          ]
        });
      }
      // If it's an API route but not matched, return 404
      res.status(404).json({ error: "API endpoint not found" });
    });
  }

  const port = process.env.PORT || 3001;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
