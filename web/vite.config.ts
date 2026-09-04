import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dashboard talks to the FitFlow API over plain fetch (see
// src/api/client.ts) using VITE_API_BASE_URL — no dev-server proxy
// needed. The API's CORS_ALLOWED_ORIGINS env var must include this
// dev server's origin (http://localhost:5173 by default) and whatever
// origin a real deployment serves the built dashboard from — see
// src/lib/cors.ts on the API side.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
