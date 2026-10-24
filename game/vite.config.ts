import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

/** Large files the service worker caches separately (best effort), so code updates don't download them again. */
const MEDIA = /^(music|video)\//;
/** The remastered graphics: never on install, cached as they are first used (only remastered players need them). */
const REMASTER = /^remaster\//;
/** The 1997 prototype's data (sly.html): cached as it is first used, like the remastered graphics. */
const SLY = /^sly\//;

/** Every file below `dir`, as paths relative to `root` with '/' separators. */
function walk(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), root) : [relative(root, join(dir, e.name)).split('\\').join('/')]);
}

/** Writes dist/sw.js (template: sw.js) with the list of built files and their content hashes. */
function offlinePlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'dark-planet-offline',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = walk(outDir).filter((f) => f !== 'sw.js').sort();
      const version = (list: string[]) => {
        const hash = createHash('sha256');
        for (const f of list) hash.update(f).update(readFileSync(join(outDir, f)));
        return hash.digest('hex').slice(0, 12);
      };
      const core = files.filter((f) => !MEDIA.test(f) && !REMASTER.test(f) && !SLY.test(f));
      const media = files.filter((f) => MEDIA.test(f));
      const remaster = files.filter((f) => REMASTER.test(f));
      const sly = files.filter((f) => SLY.test(f));
      const build = {
        core, media, remaster, sly,
        coreVersion: version(core), mediaVersion: version(media), remasterVersion: version(remaster), slyVersion: version(sly),
      };
      const template = readFileSync(new URL('sw.js', import.meta.url), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), `self.__BUILD__ = ${JSON.stringify(build)};\n${template}`);
    },
  };
}

/** Dev server only: saves the input recordings of the levels played (src/recording.ts) as recordings/<name>.json. */
function recordingsPlugin(): Plugin {
  const dir = fileURLToPath(new URL('../recordings', import.meta.url));
  return {
    name: 'dark-planet-recordings',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__recording', (req, res) => {
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? '';
        if (req.method !== 'POST' || !/^[\w-]+$/.test(name)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${name}.json`), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

/**
 * The desktop build (`vite build --mode desktop`, for desktop/): no service worker, web manifest or link preview
 * image, and not the 1997 prototype (decision 32: it isn't part of the Steam release).
 */
function desktopPlugin(): Plugin {
  let outDir = '';
  return {
    name: 'dark-planet-desktop',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: (html) => html.replace(/\s*<link rel="manifest"[^>]*>/, ''),
    closeBundle() {
      for (const f of ['sly', 'manifest.webmanifest', 'og-image.jpg']) rmSync(join(outDir, f), { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  // tools/headless.mjs runs its own dev server: its own dependency cache, so it can't disturb one already running,
  // and no file watching, so edits in the tree during a long render don't reload its pages
  cacheDir: process.env.DP_HEADLESS ? 'node_modules/.vite-headless' : 'node_modules/.vite',
  server: process.env.DP_HEADLESS ? { hmr: false, watch: null } : undefined,
  plugins: mode === 'desktop' ? [desktopPlugin()] : [offlinePlugin(), recordingsPlugin()],
  // the game, and the 1997 prototype (sly.html, src/sly/); the desktop build goes to desktop/app/
  build: mode === 'desktop'
    ? { outDir: '../desktop/app', emptyOutDir: true }
    : { rollupOptions: { input: { main: 'index.html', sly: 'sly.html' } } },
  test: { environment: 'node' },
}));
