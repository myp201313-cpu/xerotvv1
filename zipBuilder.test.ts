import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAndroidProjectEntries,
  buildTwaManifest,
  createZipArchive,
} from "./zipBuilder";

test("createZipArchive outputs valid PKZIP magic bytes and central directory", () => {
  const buf = createZipArchive([
    { name: "hello.txt", content: "Hello XEROTV" },
    { name: "nested/info.json", content: JSON.stringify({ app: "XEROTV" }) },
  ]);

  // Local file header magic PK\x03\x04
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  // End of Central Directory signature PK\x05\x06 at tail
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50);
  // Entry count = 2
  assert.equal(buf.readUInt16LE(buf.length - 12), 2);
});

test("buildAndroidProjectEntries includes MainActivity.kt, AndroidManifest, and Gradle build files", () => {
  const entries = buildAndroidProjectEntries("https://xerotv.example.com/");
  const names = entries.map((e) => e.name);

  assert.ok(names.includes("xerotv-android/app/src/main/java/tv/xero/app/MainActivity.kt"));
  assert.ok(names.includes("xerotv-android/app/src/main/AndroidManifest.xml"));
  assert.ok(names.includes("xerotv-android/app/build.gradle.kts"));
  assert.ok(names.includes("xerotv-android/twa-manifest.json"));

  const gradleEntry = entries.find((e) => e.name === "xerotv-android/app/build.gradle.kts");
  assert.ok(String(gradleEntry?.content).includes("https://xerotv.example.com"));
});

test("buildTwaManifest derives valid host and icon URLs", () => {
  const manifest = buildTwaManifest("https://stream.xerotv.app/");
  assert.equal(manifest.host, "stream.xerotv.app");
  assert.equal(manifest.packageId, "tv.xero.app");
  assert.equal(manifest.iconUrl, "https://stream.xerotv.app/pwa-512x512.png");
});
