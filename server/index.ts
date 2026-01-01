import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import apiRouter from "./api.js";
// Use production API functions (Vercel serverless functions) for local dev
import { 
  marketRoute, 
  aiNewsRoute, 
  gossipRoute, 
  dealsRoute, 
  restaurantsRoute, 
  showsRoute 
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
  app.get('/api/ai-news', aiNewsRoute);
  app.options('/api/ai-news', (_req, res) => res.sendStatus(200));
  app.get('/api/gossip', gossipRoute);
  app.options('/api/gossip', (_req, res) => res.sendStatus(200));
  app.get('/api/deals', dealsRoute);
  app.options('/api/deals', (_req, res) => res.sendStatus(200));
  app.get('/api/restaurants', restaurantsRoute);
  app.options('/api/restaurants', (_req, res) => res.sendStatus(200));
  app.get('/api/shows', showsRoute);
  app.options('/api/shows', (_req, res) => res.sendStatus(200));
  
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
        res.status(200).json({
          message: "Development mode: Frontend is served by Vite dev server on port 3000",
          api_endpoints: [
            "/api/market",
            "/api/ai-news",
            "/api/gossip",
            "/api/deals",
            "/api/restaurants",
            "/api/shows"
          ]
        });
      }
    });
  }

  const port = process.env.PORT || 3001;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
