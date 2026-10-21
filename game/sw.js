// Service worker: the installed app (PWA) and offline play. Template: the build (vite.config.ts, offlinePlugin)
// writes it to dist/sw.js behind a line `self.__BUILD__ = {core, media, remaster, coreVersion, ...}` with every
// built file (paths relative to this file) and content hashes.
// Core (app shell, data/, about 2 MB) is cached on install. The music and video (about 26 MB) go in their own
// cache, best effort, so a code update doesn't download them again; what's missing streams from the network.
// The remastered graphics (remaster/, about 28 MB) are not downloaded on install: each file goes into its own
// cache when the game first loads it, so classic players never fetch them and remastered ones keep what they
// have seen for offline play. The same goes for the 1997 prototype's data (sly/, 0.5 MB; its page sly.html is core).
// Cache first: an update installs in the background and takes over; main.ts (registerOffline) looks for one on
// every start, when the app comes back to the screen and hourly, and reloads where nothing is lost.

const {
  core, media, remaster = [], sly = [], coreVersion, mediaVersion, remasterVersion = 'none', slyVersion = 'none',
} = self.__BUILD__;
const CORE_CACHE = `dp-core-${coreVersion}`;
const MEDIA_CACHE = `dp-media-${mediaVersion}`;
const REMASTER_CACHE = `dp-remaster-${remasterVersion}`;
const SLY_CACHE = `dp-sly-${slyVersion}`;
const INDEX = new URL('index.html', self.location).href;
/** The pages besides index.html (sly.html); any other navigation in the scope is the game. */
const PAGES = new Set(core.filter((p) => p.endsWith('.html')).map((p) => new URL(p, self.location).href));
const MEDIA_URLS = new Set(media.map((p) => new URL(p, self.location).href));
/** Files cached on first use, by cache name. */
const LAZY = [
  [REMASTER_CACHE, new Set(remaster.map((p) => new URL(p, self.location).href))],
  [SLY_CACHE, new Set(sly.map((p) => new URL(p, self.location).href))],
];
const filling = new Set(); // media and remaster URLs being cached after a miss

/** Bypass the HTTP cache: index.html and data/ have no hash in their names. */
const fresh = (path) => new Request(new URL(path, self.location), { cache: 'reload' });

async function cacheMedia(cache, url) {
  if (filling.has(url) || (await cache.match(url))) return;
  filling.add(url);
  try {
    await cache.add(fresh(url));
  } finally {
    filling.delete(url);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await (await caches.open(CORE_CACHE)).addAll(core.map(fresh));
    const mediaCache = await caches.open(MEDIA_CACHE);
    await Promise.allSettled([...MEDIA_URLS].map((url) => cacheMedia(mediaCache, url)));
    await self.skipWaiting(); // a running game has loaded everything it needs from the old version at boot
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      const keep = [CORE_CACHE, MEDIA_CACHE, REMASTER_CACHE, SLY_CACHE];
      if (name.startsWith('dp-') && !keep.includes(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(respond(event, request));
});

async function respond(event, request) {
  const url = new URL(request.url);
  url.search = '';
  // Every other page in the scope is the game (start_url "./" and index.html).
  const key = request.mode === 'navigate' ? (PAGES.has(url.href) ? url.href : INDEX) : request.url;
  const cached = await caches.match(key, { ignoreSearch: true });
  if (cached) {
    const range = request.headers.get('range');
    return range ? partial(cached, range) : cached;
  }
  const lazy = LAZY.find(([, urls]) => urls.has(url.href));
  if (lazy) {
    // Fetch once and keep a copy (the game asks for each file once per session).
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(lazy[0]).then((cache) => cache.put(url.href, copy)).catch(() => undefined));
    }
    return response;
  }
  if (MEDIA_URLS.has(url.href)) {
    event.waitUntil(caches.open(MEDIA_CACHE).then((cache) => cacheMedia(cache, url.href)).catch(() => undefined));
  }
  return fetch(request);
}

/**
 * <audio> and <video> ask for byte ranges; the cache holds whole files. Safari plays media only from a
 * 206 answer, so cut the range out of the cached file.
 */
async function partial(response, range) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === '' && m[2] === '')) return response;
  const blob = await response.blob();
  const size = blob.size;
  let start, end;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2])); // the last n bytes
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? '',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
