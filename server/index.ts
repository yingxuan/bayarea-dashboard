import "dotenv/config";
import express from "express";
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
  quotesRoute,
  spendTodayRoute,
  leekCommunityRoute,
  gossipCommunityRoute,
  marketNewsRoute,
  portfolioValueSeriesRoute
} from "./local-api-adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable JSON parsing
  app.use(express.json());

  // Enable CORS for development
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
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
  app.get('/api/youtubers', youtubersRoute);
  app.options('/api/youtubers', (_req, res) => res.sendStatus(200));
  app.get('/api/quotes', quotesRoute);
  app.options('/api/quotes', (_req, res) => res.sendStatus(200));
  app.get('/api/spend/today', spendTodayRoute);
  app.options('/api/spend/today', (_req, res) => res.sendStatus(200));
  app.get('/api/community/leeks', leekCommunityRoute);
  app.options('/api/community/leeks', (_req, res) => res.sendStatus(200));
  app.get('/api/community/gossip', gossipCommunityRoute);
  app.options('/api/community/gossip', (_req, res) => res.sendStatus(200));
  app.get('/api/market-news', marketNewsRoute);
  app.options('/api/market-news', (_req, res) => res.sendStatus(200));
  app.get('/api/portfolio/value-series', portfolioValueSeriesRoute);
  app.options('/api/portfolio/value-series', (_req, res) => res.sendStatus(200));
  
  // Mount legacy API routes (if any)
  app.use(apiRouter);

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
