import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this repository from a subpath; Vercel serves it at the domain root.
  base: process.env.GITHUB_ACTIONS ? "/QQ-AI/" : "/",
});