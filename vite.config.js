import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deployed at a dedicated subdomain (e.g. https://asms.yourdomain.com/)
// on Hostinger, so the app is served from the document root -- base
// stays "/". If this ever moves to a subdirectory of another domain
// instead, change this back to "/<subdirectory>/".
export default defineConfig({
  plugins: [react()],
  base: "/",
  test: {
    environment: "node",
    globals: true,
  },
});
