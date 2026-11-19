import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSafeDownloadFilename,
  decryptNxshaPayload,
  encryptNxshaPayload,
  inferFormatAndDirect,
  isAllowedDownloadUrl,
  parseQualityLabel,
  parseSizeLabel,
} from "./downloadResolver";

test("encryptNxshaPayload and decryptNxshaPayload round-trip cleanly via WebCrypto + MD5 EVP_BytesToKey", async () => {
  const sample = { tmdbId: "550", type: "movie", method: "dl" };
  const token = await encryptNxshaPayload(sample);
  assert.ok(token.length > 20);
  assert.equal(token.includes("+"), false);
  assert.equal(token.includes("/"), false);

  const decoded = await decryptNxshaPayload(token);
  assert.ok(decoded);
  assert.equal(decoded.tmdbId, "550");
  assert.equal(decoded.type, "movie");
  assert.equal(decoded.method, "dl");
});

test("buildSafeDownloadFilename formats movie and TV episode filenames safely", () => {
  assert.equal(
    buildSafeDownloadFilename("Fight Club: Special?", "movie", "1080p", "mp4"),
    "Fight-Club-Special-1080p.mp4",
  );
  assert.equal(
    buildSafeDownloadFilename("Breaking Bad", "tv", "720p", "mkv", 1, 5),
    "Breaking-Bad-S01E05-720p.mkv",
  );
});

test("quality, size, and format parsers extract clean metadata", () => {
  assert.equal(parseQualityLabel("HubCloud | 4K | 66.39 GB | BluRay"), "4K");
  assert.equal(parseSizeLabel("HubCloud | 1080p | 2.25 GB | HEVC"), "2.25 GB");
  assert.deepEqual(
    inferFormatAndDirect("https://macdn.hakunaymatata.com/bt/abc.mp4?Expires=123"),
    { format: "MP4", isDirectFile: true },
  );
  assert.deepEqual(inferFormatAndDirect("https://hubcloud.mov/drive/xyz"), {
    format: "Mirror",
    isDirectFile: false,
  });
});

test("isAllowedDownloadUrl permits verified CDN/subtitle hosts and rejects SSRF targets", () => {
  assert.equal(
    isAllowedDownloadUrl("https://macdn.hakunaymatata.com/bt/test.mp4"),
    true,
  );
  assert.equal(
    isAllowedDownloadUrl("https://b6a3a2.r2.cloudflarestorage.com/hub/file.mkv"),
    true,
  );
  assert.equal(
    isAllowedDownloadUrl("https://cache.vdrk.site/v3/movie/550/English.vtt"),
    true,
  );
  assert.equal(isAllowedDownloadUrl("http://127.0.0.1:3000/secret"), false);
  assert.equal(isAllowedDownloadUrl("https://169.254.169.254/latest"), false);
});
