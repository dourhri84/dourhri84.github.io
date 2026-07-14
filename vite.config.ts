import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves project sites under /<repo-name>/, so the base path
// must match the repo name when building in GitHub Actions. Locally (dev
// server) it stays "/".
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: repoName ? `/${repoName}/` : '/',
})
