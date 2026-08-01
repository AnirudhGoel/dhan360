import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import App from "./App";
import { DEMO } from "./lib/demo";
import { CLIENT } from "./lib/api";
import "./index.css";

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (err) => console.error("query error:", err) }),
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 10_000, retry: false } },
});

// The static demo can be served from any path (github.io/dhan360, an apex domain, a subfolder),
// so it uses hash routing — no server rewrites or base-path assumptions. Self-host serves from
// root behind FastAPI, so it keeps clean path-based URLs.
// Static-hosted builds (demo + client) can live at any path → hash routing. Self-host serves
// from root behind FastAPI → clean path-based URLs.
const Router = DEMO || CLIENT ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <App />
      </Router>
    </QueryClientProvider>
  </React.StrictMode>
);
