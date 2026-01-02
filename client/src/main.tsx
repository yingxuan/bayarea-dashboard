import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Load analytics script if configured
if (import.meta.env.VITE_ANALYTICS_ENDPOINT && import.meta.env.VITE_ANALYTICS_WEBSITE_ID) {
  const script = document.createElement('script');
  script.defer = true;
  script.src = `${import.meta.env.VITE_ANALYTICS_ENDPOINT}/umami`;
  script.setAttribute('data-website-id', import.meta.env.VITE_ANALYTICS_WEBSITE_ID);
  document.head.appendChild(script);
}

createRoot(document.getElementById("root")!).render(<App />);
