import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Where GitHub Pages serves the manifest (README: https://aimfeld.github.io/dark-planet/).
const MANIFEST_URL = 'https://aimfeld.github.io/dark-planet/manifest.webmanifest';
const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'manifest.webmanifest'), 'utf8'));

describe('web manifest', () => {
  // The W3C manifest spec resolves `id` against the ORIGIN of start_url, not its path, so "./" or "/" would be
  // https://aimfeld.github.io/, the id of every PWA on the origin (Wunioid was taken for Dark Planet on Android).
  it('has an id of its own, not the origin', () => {
    const startUrl = new URL(manifest.start_url, MANIFEST_URL);
    const id = new URL(manifest.id, startUrl.origin);
    expect(id.href).not.toBe(`${startUrl.origin}/`);
    expect(id.href).toBe('https://aimfeld.github.io/dark-planet/');
  });

  it('keeps start_url and scope inside the app path', () => {
    expect(new URL(manifest.start_url, MANIFEST_URL).href).toBe('https://aimfeld.github.io/dark-planet/');
    expect(new URL(manifest.scope, MANIFEST_URL).href).toBe('https://aimfeld.github.io/dark-planet/');
  });
});
