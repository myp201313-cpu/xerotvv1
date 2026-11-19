import type {
  MediaDownloadResponse,
  MediaType,
  RealDownloadItem,
  SubtitleDownloadItem,
} from "../types/media";

const NXSHA_DL_BASE = "https://web.nxsha.app";
const NXSHA_DL_PASSPHRASE =
  "38c8cd65d781936f4b9fe1fd985234fd7335699855051abf76ea3493bcfc0120";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

const ALLOWED_DOWNLOAD_HOST_SUFFIXES = [
  "hakunaymatata.com",
  "111477.xyz",
  "workers.dev",
  "r2.cloudflarestorage.com",
  "r2.dev",
  "b-cdn.net",
  "hubcloud.mov",
  "hubdrive.blog",
  "vdrk.site",
  "rezesubs.com",
  "vidzee.wtf",
  "pixeldrain.dev",
  "pixeldrain.com",
  "fsl-lover.buzz",
  "fsl-cdn-1.buzz",
  "googleusercontent.com",
];

export function isAllowedDownloadUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_DOWNLOAD_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

export function buildSafeDownloadFilename(
  title: string,
  mediaType: MediaType,
  quality: string,
  ext: string,
  season?: number,
  episode?: number,
): string {
  const slug = (title || "XEROTV-Media")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "XEROTV-Media";
  const epTag =
    mediaType === "tv" && season && episode
      ? `-S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`
      : "";
  const qualTag = quality
    ? `-${quality.replace(/[^a-zA-Z0-9]/g, "")}`
    : "";
  const cleanExt = ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "mp4";
  return `${slug}${epTag}${qualTag}.${cleanExt}`;
}

export function parseQualityLabel(raw: string): string {
  const text = raw || "";
  if (/\b(2160p|4k|uhd)\b/i.test(text)) return "4K";
  const match = text.match(/\b(1080p|720p|480p|360p|240p)\b/i);
  if (match) return match[1].toLowerCase();
  if (/1080/i.test(text)) return "1080p";
  if (/720/i.test(text)) return "720p";
  if (/480/i.test(text)) return "480p";
  if (/360/i.test(text)) return "360p";
  return "HD";
}

export function parseSizeLabel(raw: string): string | undefined {
  const match = (raw || "").match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i);
  return match ? match[1].toUpperCase() : undefined;
}

export function inferFormatAndDirect(url: string, label = ""): {
  format: string;
  isDirectFile: boolean;
} {
  const lowerUrl = url.toLowerCase();
  const lowerLabel = label.toLowerCase();
  if (lowerUrl.includes(".mp4")) return { format: "MP4", isDirectFile: true };
  if (lowerUrl.includes(".mkv")) return { format: "MKV", isDirectFile: true };
  if (lowerUrl.includes(".webm")) return { format: "WEBM", isDirectFile: true };
  if (
    lowerUrl.includes("hakunaymatata.com") ||
    lowerUrl.includes("111477.xyz") ||
    lowerUrl.includes("workers.dev") ||
    lowerUrl.includes("r2.cloudflarestorage.com") ||
    lowerUrl.includes(".r2.dev") ||
    lowerUrl.includes("pixeldrain.")
  ) {
    return {
      format: lowerLabel.includes("x265") || lowerUrl.includes("mkv") ? "MKV" : "MP4",
      isDirectFile: true,
    };
  }
  return { format: "Mirror", isDirectFile: false };
}

// Compact RFC 1321 MD5 for isomorphic OpenSSL EVP_BytesToKey across Node & Cloudflare Workers
function md5Bytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const K = new Uint32Array([
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
    0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
    0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ]);
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
  ];
  const bitLen = input.length * 8;
  const padLen = ((56 - ((input.length + 1) % 64)) + 64) % 64;
  const buf = new Uint8Array(input.length + 1 + padLen + 8);
  buf.set(input, 0);
  buf[input.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(buf.length - 8, bitLen >>> 0, true);
  view.setUint32(buf.length - 4, Math.floor(bitLen / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let i = 0; i < buf.length; i += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) M[j] = view.getUint32(i + j * 4, true);
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let j = 0; j < 64; j++) {
      let F = 0;
      let g = 0;
      if (j < 16) {
        F = (B & C) | (~B & D);
        g = j;
      } else if (j < 32) {
        F = (D & B) | (~D & C);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        F = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * j) % 16;
      }
      const dTemp = D;
      D = C;
      C = B;
      const sum = (A + F + K[j] + M[g]) >>> 0;
      const rot = (sum << S[j]) | (sum >>> (32 - S[j]));
      B = (B + rot) >>> 0;
      A = dTemp;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(new ArrayBuffer(16));
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return out;
}

function evpBytesToKey(password: string, salt: Uint8Array): {
  key: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
} {
  const passBytes = new TextEncoder().encode(password);
  const chunks: Uint8Array[] = [];
  let prev: Uint8Array = new Uint8Array(0);
  let total = 0;
  while (total < 48) {
    const block = new Uint8Array(prev.length + passBytes.length + salt.length);
    block.set(prev, 0);
    block.set(passBytes, prev.length);
    block.set(salt, prev.length + passBytes.length);
    prev = md5Bytes(block);
    chunks.push(prev);
    total += prev.length;
  }
  const combined = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.length;
  }
  return {
    key: new Uint8Array(combined.buffer.slice(0, 32)),
    iv: new Uint8Array(combined.buffer.slice(32, 48)),
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64Url(b64u: string): Uint8Array {
  let s = b64u.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptNxshaPayload(
  payload: Record<string, unknown>,
): Promise<string> {
  const salt = new Uint8Array(8);
  globalThis.crypto.getRandomValues(salt);
  const { key, iv } = evpBytesToKey(NXSHA_DL_PASSPHRASE, salt);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  const body = JSON.stringify({
    ...payload,
    _req_ts: Date.now(),
    _req_salt: Math.random().toString(36).slice(2, 12),
  });
  const encrypted = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      cryptoKey,
      new TextEncoder().encode(body).buffer as ArrayBuffer,
    ),
  );
  const header = new TextEncoder().encode("Salted__");
  const out = new Uint8Array(header.length + salt.length + encrypted.length);
  out.set(header, 0);
  out.set(salt, header.length);
  out.set(encrypted, header.length + salt.length);
  return toBase64Url(out);
}

export async function decryptNxshaPayload(
  token: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = fromBase64Url(token);
    if (raw.length < 17) return null;
    const salt = raw.slice(8, 16);
    const ct = new Uint8Array(new ArrayBuffer(raw.length - 16));
    ct.set(raw.slice(16));
    const { key, iv } = evpBytesToKey(NXSHA_DL_PASSPHRASE, salt);
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      "raw",
      key,
      { name: "AES-CBC" },
      false,
      ["decrypt"],
    );
    const plain = new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { name: "AES-CBC", iv },
        cryptoKey,
        ct,
      ),
    );
    const text = new TextDecoder().decode(plain);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    delete parsed._req_ts;
    delete parsed._req_salt;
    return parsed;
  } catch {
    return null;
  }
}

interface RawNxshaServer {
  id: number | string;
  name?: string;
  scraper?: string;
  enabled?: boolean;
  disabled?: boolean;
}

interface RawNxshaSource {
  url?: string;
  label?: string;
  quality?: string;
  language?: string;
}

async function fetchNxshaDownloads(
  mediaType: MediaType,
  tmdbId: string,
  imdbId: string,
  season: number,
  episode: number,
): Promise<RealDownloadItem[]> {
  try {
    const qServers = await encryptNxshaPayload({
      tmdbId,
      type: mediaType,
      imdb_id: imdbId,
      season: String(season),
      episode: String(episode),
      method: "dl",
    });

    const srvRes = await fetch(
      `${NXSHA_DL_BASE}/api/servers?q=${encodeURIComponent(qServers)}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Referer: `${NXSHA_DL_BASE}/dl/${mediaType}/${tmdbId}`,
        },
        signal: AbortSignal.timeout(5500),
      },
    );
    if (!srvRes.ok) return [];
    const srvJson = (await srvRes.json()) as { _hash?: string };
    if (!srvJson._hash) return [];
    const decoded = (await decryptNxshaPayload(srvJson._hash)) as {
      servers?: RawNxshaServer[];
    } | null;

    const allServers = (decoded?.servers || []).filter(
      (s) => s && s.enabled !== false && s.disabled !== true,
    );
    // Prioritize fast direct-file extractors first
    const priorityOrder = [
      "mahalala",
      "movone",
      "k4khdhub",
      "k4khdhub-direct",
    ];
    const targetServers = [
      ...allServers.filter((s) =>
        priorityOrder.includes(String(s.scraper || s.id)),
      ),
      ...allServers.filter(
        (s) => !priorityOrder.includes(String(s.scraper || s.id)),
      ),
    ].slice(0, 5);

    const results = await Promise.allSettled(
      targetServers.map(async (srv) => {
        const qSrc = await encryptNxshaPayload({
          provider: srv.scraper || srv.id,
          tmdbId,
          imdb_id: imdbId,
          type: mediaType,
          season: String(season),
          episode: String(episode),
          method: "dl",
        });
        const res = await fetch(
          `${NXSHA_DL_BASE}/api/sources?q=${encodeURIComponent(qSrc)}`,
          {
            headers: {
              "User-Agent": USER_AGENT,
              Referer: `${NXSHA_DL_BASE}/dl/${mediaType}/${tmdbId}`,
            },
            signal: AbortSignal.timeout(6500),
          },
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { _hash?: string };
        if (!json._hash) return [];
        const dec = (await decryptNxshaPayload(json._hash)) as {
          sources?: RawNxshaSource[];
        } | null;
        return (dec?.sources || []).map((src) => ({ srv, src }));
      }),
    );

    const seen = new Set<string>();
    const items: RealDownloadItem[] = [];

    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const { srv, src } of r.value) {
        if (!src?.url || !src.url.startsWith("https://")) continue;
        if (seen.has(src.url)) continue;
        seen.add(src.url);

        const rawLabel = String(src.label || src.quality || srv.name || "Download");
        const { format, isDirectFile } = inferFormatAndDirect(src.url, rawLabel);
        const quality = parseQualityLabel(`${src.quality || ""} ${rawLabel}`);
        const sizeLabel = parseSizeLabel(rawLabel);

        let language = "Original";
        if (/hindi/i.test(rawLabel)) language = "Hindi";
        else if (/english/i.test(rawLabel)) language = "English";
        else if (/french/i.test(rawLabel)) language = "French";
        else if (/russian/i.test(rawLabel)) language = "Russian";
        else if (/arabic/i.test(rawLabel)) language = "Arabic";
        else if (/multi/i.test(rawLabel)) language = "Multi-Audio";

        items.push({
          id: `dl-${items.length + 1}`,
          provider: srv.name || String(srv.scraper || srv.id),
          label: rawLabel.replace(/\s*-\s*\[NX\]$/i, "").trim(),
          quality,
          format,
          sizeLabel,
          language,
          url: src.url,
          isDirectFile,
        });
      }
    }

    // Sort direct MP4/MKV files first, then higher resolution first
    const qualityScore = (q: string) =>
      q === "4K"
        ? 5
        : q === "1080p"
          ? 4
          : q === "720p"
            ? 3
            : q === "480p"
              ? 2
              : 1;

    items.sort((a, b) => {
      if (a.isDirectFile !== b.isDirectFile) return a.isDirectFile ? -1 : 1;
      return qualityScore(b.quality) - qualityScore(a.quality);
    });

    return items.slice(0, 24);
  } catch {
    return [];
  }
}

async function fetchRealSubtitles(
  mediaType: MediaType,
  tmdbId: string,
  season: number,
  episode: number,
): Promise<SubtitleDownloadItem[]> {
  const endpoints =
    mediaType === "tv"
      ? [
          `https://sub.vdrk.site/v2/tv/${tmdbId}/${season}/${episode}`,
          `https://core.vidzee.wtf/subs/tv/${tmdbId}/${season}/${episode}`,
        ]
      : [
          `https://sub.vdrk.site/v2/movie/${tmdbId}`,
          `https://core.vidzee.wtf/subs/movie/${tmdbId}`,
        ];

  const results = await Promise.allSettled(
    endpoints.map(async (url) => {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as Array<{ label?: string; file?: string }>;
      return Array.isArray(data) ? data : [];
    }),
  );

  const seenLang = new Set<string>();
  const subs: SubtitleDownloadItem[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      if (!item?.file || !item.file.startsWith("https://")) continue;
      const lang = (item.label || "English").replace(/\s*\d+\s*$/g, "").replace(/\d+/g, "").trim() || "English";
      const key = lang.toLowerCase();
      if (seenLang.has(key)) continue;
      seenLang.add(key);
      const format = item.file.toLowerCase().includes(".srt") ? "SRT" : "VTT";
      subs.push({
        id: `sub-${subs.length + 1}`,
        language: lang,
        format,
        url: item.file,
      });
    }
  }
  subs.sort((a, b) => {
    if (a.language.toLowerCase() === "english") return -1;
    if (b.language.toLowerCase() === "english") return 1;
    return a.language.localeCompare(b.language);
  });
  return subs.slice(0, 20);
}

export async function resolveRealMediaDownloads(params: {
  mediaType: MediaType;
  tmdbId: string;
  imdbId?: string;
  season?: number;
  episode?: number;
}): Promise<MediaDownloadResponse> {
  const {
    mediaType,
    tmdbId,
    imdbId = "",
    season = 1,
    episode = 1,
  } = params;

  const [downloads, subtitles] = await Promise.all([
    fetchNxshaDownloads(mediaType, tmdbId, imdbId, season, episode),
    fetchRealSubtitles(mediaType, tmdbId, season, episode),
  ]);

  return {
    mediaType,
    tmdbId,
    season: mediaType === "tv" ? season : undefined,
    episode: mediaType === "tv" ? episode : undefined,
    downloads,
    subtitles,
    checkedAt: Date.now(),
  };
}
