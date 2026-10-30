import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

function foodWisePwa() {
  return {
    name: 'foodwise-offline-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((fileName) => fileName !== 'sw.js')
        .map((fileName) => `/${fileName}`)
      const precache = [...new Set([
        '/',
        '/index.html',
        '/offline.html',
        '/manifest.webmanifest',
        '/icons/foodwise.svg',
        ...assets,
      ])]
      const cacheVersion = createHash('sha256')
        .update(precache.join('\n'))
        .digest('hex')
        .slice(0, 12)
      const worker = readFileSync(new URL('./src/pwa/service-worker.js', import.meta.url), 'utf8')
        .replace('__PRECACHE_URLS__', JSON.stringify(precache))
        .replaceAll('__CACHE_VERSION__', cacheVersion)

      this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const localApiProxy = {
    '/api': {
      target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8002',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  }
  return {
    plugins: [react(), foodWisePwa()],
    server: { proxy: localApiProxy },
    preview: { proxy: localApiProxy },
  }
})
