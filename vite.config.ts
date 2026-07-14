import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves project sites under /<repo-name>/, but a repo named
// "<user>.github.io" is a *user* site served at the domain root instead.
// Locally (dev server, no GITHUB_REPOSITORY env var) base stays "/".
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const isUserSite = repoName?.toLowerCase().endsWith('.github.io')
const base = !repoName || isUserSite ? '/' : `/${repoName}/`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base,
})
