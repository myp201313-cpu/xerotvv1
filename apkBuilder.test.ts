import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSignedXeroTvApk } from "./apkBuilder";

test("buildSignedXeroTvApk compiles a verified signed Android APK without exposing debug flags", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "xerotv-apk-test-"));
  try {
    const result = buildSignedXeroTvApk({
      appOrigin: "https://xerotv.example.com",
      dataDir: tmpDir,
      publicDir: path.resolve(process.cwd(), "public"),
    });

    assert.equal(result.origin, "https://xerotv.example.com");
    assert.ok(result.sizeBytes > 8000, "APK size should be realistic");
    assert.equal(result.apkBuffer.readUInt32LE(0), 0x04034b50);

    const apksignerBin = "/usr/lib/android-sdk/build-tools/debian/apksigner";
    const aaptBin = "/usr/lib/android-sdk/build-tools/debian/aapt";

    const verifyOut = execFileSync(
      apksignerBin,
      ["verify", "--verbose", "--print-certs", result.apkPath],
      { encoding: "utf-8" },
    );
    assert.match(verifyOut, /Verifies/);
    assert.doesNotMatch(verifyOut.toLowerCase(), /debug/);

    const badgingOut = execFileSync(aaptBin, ["dump", "badging", result.apkPath], {
      encoding: "utf-8",
    });
    assert.match(badgingOut, /package: name='tv\.xero\.app'/);
    assert.match(badgingOut, /application-label:'XEROTV'/);
    assert.doesNotMatch(badgingOut, /application-debuggable/);
    assert.doesNotMatch(badgingOut.toLowerCase(), /debug/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
