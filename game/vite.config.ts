import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/** Large files the service worker caches separately (best effort), so code updates don't download them again. */
const MEDIA = /^(music|video)\//;
/** The remastered graphics: never on install, cached as they are first used (only remastered players need them). */
const REMASTER = /^remaster\//;

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
      const core = files.filter((f) => !MEDIA.test(f) && !REMASTER.test(f));
      const media = files.filter((f) => MEDIA.test(f));
      const remaster = files.filter((f) => REMASTER.test(f));
      const build = {
        core, media, remaster,
        coreVersion: version(core), mediaVersion: version(media), remasterVersion: version(remaster),
      };
      const template = readFileSync(new URL('sw.js', import.meta.url), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), `self.__BUILD__ = ${JSON.stringify(build)};\n${template}`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [offlinePlugin()],
  test: { environment: 'node' },
});
