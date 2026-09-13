import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo>/, so the base path must match.
// Override with BASE_PATH=/ when hosting at a domain root (Vercel, Netlify, Cloudflare).
const base = process.env.BASE_PATH ?? '/porsche-996-rebuild/';

export default defineConfig({
  base,
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
});
