import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// If you deploy to https://<username>.github.io/<repo-name>/ (a normal
// "project" GitHub Pages site), set base to "/<repo-name>/" below.
// If you deploy to a custom domain or to https://<username>.github.io/
// (a "user/organization" site), leave base as "/".
export default defineConfig({
  plugins: [react()],
  base: "/asms/",
});
