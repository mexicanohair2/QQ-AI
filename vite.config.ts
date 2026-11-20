import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { qqQuantumIntegration } from "./scripts/qq-quantum-vite-plugin.mjs";

export default defineConfig({
  plugins: [qqQuantumIntegration(), react()],
  // GitHub Pages serves this repository from a subpath; Vercel serves it at the domain root.
  base: process.env.GITHUB_ACTIONS ? "/QQ-AI/" : "/",
});
