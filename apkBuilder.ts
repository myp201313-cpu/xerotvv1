import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_ANDROID_JAR = "/usr/lib/android-sdk/platforms/android-23/android.jar";
const BUILD_TOOLS_BIN_DIR = "/usr/lib/android-sdk/build-tools/debian";

export interface ApkBuildResult {
  apkPath: string;
  apkBuffer: Buffer;
  origin: string;
  sizeBytes: number;
}

function resolveSdkBinary(name: string, fallbacks: string[]): string {
  const preferred = path.join(BUILD_TOOLS_BIN_DIR, name);
  if (fs.existsSync(preferred)) return preferred;
  for (const candidate of fallbacks) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return name;
}

function resolveJavaBinary(name: string): string {
  const candidates = [
    `/usr/lib/jvm/java-17-openjdk-amd64/bin/${name}`,
    `/usr/lib/jvm/default-java/bin/${name}`,
    `/usr/bin/${name}`,
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return name;
}

function findAndroidJar(): string {
  const candidates = [
    DEFAULT_ANDROID_JAR,
    "/usr/lib/android-sdk/platforms/android-24/android.jar",
    "/usr/lib/android-sdk/platforms/android-34/android.jar",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  const platformsDir = "/usr/lib/android-sdk/platforms";
  if (fs.existsSync(platformsDir)) {
    const dirs = fs.readdirSync(platformsDir);
    for (const d of dirs) {
      const candidate = path.join(platformsDir, d, "android.jar");
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  throw new Error("Android platform android.jar not found on server.");
}

function escapeJavaString(val: string): string {
  return val.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function ensureSigningKeystore(keystorePath: string): void {
  if (fs.existsSync(keystorePath)) return;
  fs.mkdirSync(path.dirname(keystorePath), { recursive: true });
  execFileSync(
    resolveJavaBinary("keytool"),
    [
      "-genkeypair",
      "-v",
      "-keystore",
      keystorePath,
      "-storepass",
      "android",
      "-alias",
      "androiddebugkey",
      "-keypass",
      "android",
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "10000",
      "-dname",
      "CN=XEROTV,O=XEROTV,C=US",
    ],
    { stdio: "pipe" },
  );
}

function renderMainActivityJava(appOrigin: string): string {
  const cleanOrigin = appOrigin.replace(/\/+$/, "");
  const safeOrigin = escapeJavaString(cleanOrigin);
  let rawHost = "";
  try {
    rawHost = new URL(cleanOrigin).hostname.toLowerCase();
  } catch {
    rawHost = "";
  }
  const safeHost = escapeJavaString(rawHost);

  return `package tv.xero.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public class MainActivity extends Activity {
    private static final String APP_ORIGIN = "${safeOrigin}";
    private static final String APP_HOST = "${safeHost}";

    private FrameLayout rootContainer;
    private WebView webView;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Window window = getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.parseColor("#090A0F"));
            window.setNavigationBarColor(Color.parseColor("#090A0F"));
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        rootContainer = new FrameLayout(this);
        rootContainer.setBackgroundColor(Color.parseColor("#090A0F"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#090A0F"));
        rootContainer.addView(
            webView,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        setContentView(rootContainer);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        webView.setWebViewClient(new WebViewClient() {
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null) return false;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && !request.isForMainFrame()) {
                    return false;
                }
                String url = request.getUrl() != null ? request.getUrl().toString() : "";
                return handleNavigationUrl(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigationUrl(url);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                rootContainer.addView(
                    view,
                    new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                );
                webView.setVisibility(View.GONE);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                );
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                rootContainer.removeView(customView);
                customView = null;
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
                webView.setVisibility(View.VISIBLE);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(APP_ORIGIN);
        }
    }

    private boolean handleNavigationUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        if (url.startsWith(APP_ORIGIN)) {
            return false;
        }
        try {
            Uri parsed = Uri.parse(url);
            String host = parsed.getHost() != null ? parsed.getHost().toLowerCase() : "";
            if (!APP_HOST.isEmpty() && host.equals(APP_HOST)) {
                return false;
            }
        } catch (Exception ignored) {
        }
        if (url.startsWith("https://github.com/")) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
            }
            return true;
        }
        return true;
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            webView.setVisibility(View.VISIBLE);
            rootContainer.removeView(customView);
            customView = null;
            if (customViewCallback != null) {
                customViewCallback.onCustomViewHidden();
                customViewCallback = null;
            }
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
`;
}

export function buildSignedXeroTvApk(options: {
  appOrigin: string;
  dataDir: string;
  publicDir: string;
}): ApkBuildResult {
  const cleanOrigin = options.appOrigin.replace(/\/+$/, "");
  const originHash = crypto.createHash("sha256").update(cleanOrigin).digest("hex").slice(0, 12);
  const cacheDir = path.join(options.dataDir, "apk-cache");
  const finalApkPath = path.join(cacheDir, `xerotv-v2-${originHash}.apk`);

  if (fs.existsSync(finalApkPath)) {
    const existing = fs.readFileSync(finalApkPath);
    if (existing.length > 4 && existing.readUInt32LE(0) === 0x04034b50) {
      return {
        apkPath: finalApkPath,
        apkBuffer: existing,
        origin: cleanOrigin,
        sizeBytes: existing.length,
      };
    }
  }

  const androidJar = findAndroidJar();
  const keystorePath = path.join(options.dataDir, "signing.keystore");
  ensureSigningKeystore(keystorePath);

  fs.mkdirSync(cacheDir, { recursive: true });
  const workDir = path.join(cacheDir, `build-${originHash}-${Date.now()}`);
  const genDir = path.join(workDir, "gen");
  const objDir = path.join(workDir, "obj");
  const binDir = path.join(workDir, "bin");
  const srcDir = path.join(workDir, "src", "tv", "xero", "app");
  const resDrawableDir = path.join(workDir, "res", "drawable");
  const resDrawableXxhdpiDir = path.join(workDir, "res", "drawable-xxhdpi");
  const resValuesDir = path.join(workDir, "res", "values");

  try {
    fs.mkdirSync(genDir, { recursive: true });
    fs.mkdirSync(objDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(resDrawableDir, { recursive: true });
    fs.mkdirSync(resDrawableXxhdpiDir, { recursive: true });
    fs.mkdirSync(resValuesDir, { recursive: true });

    const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="tv.xero.app"
    android:versionCode="1"
    android:versionName="1.0.0">

    <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="34" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="true"
        android:icon="@drawable/ic_launcher"
        android:label="@string/app_name"
        android:theme="@android:style/Theme.Black.NoTitleBar">
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:exported="true"
            android:launchMode="singleTop">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;

    const stringsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">XEROTV</string>
</resources>
`;

    fs.writeFileSync(path.join(workDir, "AndroidManifest.xml"), manifestXml, "utf-8");
    fs.writeFileSync(path.join(resValuesDir, "strings.xml"), stringsXml, "utf-8");
    fs.writeFileSync(path.join(srcDir, "MainActivity.java"), renderMainActivityJava(cleanOrigin), "utf-8");

    const iconSrc = path.join(options.publicDir, "pwa-192x192.png");
    if (fs.existsSync(iconSrc)) {
      fs.copyFileSync(iconSrc, path.join(resDrawableDir, "ic_launcher.png"));
      fs.copyFileSync(iconSrc, path.join(resDrawableXxhdpiDir, "ic_launcher.png"));
    }

    const manifestPath = path.join(workDir, "AndroidManifest.xml");
    const resDir = path.join(workDir, "res");

    const aaptBin = resolveSdkBinary("aapt", ["/usr/bin/aapt"]);
    const dxBin = fs.existsSync(path.join(BUILD_TOOLS_BIN_DIR, "dx"))
      ? path.join(BUILD_TOOLS_BIN_DIR, "dx")
      : "/usr/bin/dalvik-exchange";
    const zipalignBin = resolveSdkBinary("zipalign", ["/usr/bin/zipalign"]);
    const apksignerBin = resolveSdkBinary("apksigner", ["/usr/bin/apksigner"]);

    // 1. Generate R.java
    execFileSync(
      aaptBin,
      ["package", "-f", "-m", "-J", genDir, "-M", manifestPath, "-S", resDir, "-I", androidJar],
      { stdio: "pipe" },
    );

    // 2. Compile Java classes
    execFileSync(
      resolveJavaBinary("javac"),
      [
        "-source",
        "1.8",
        "-target",
        "1.8",
        "-bootclasspath",
        androidJar,
        "-d",
        objDir,
        path.join(genDir, "tv", "xero", "app", "R.java"),
        path.join(srcDir, "MainActivity.java"),
      ],
      { stdio: "pipe" },
    );

    // 3. Convert to Dalvik classes.dex
    const dexPath = path.join(binDir, "classes.dex");
    execFileSync(dxBin, ["--dex", `--output=${dexPath}`, objDir], { stdio: "pipe" });

    // 4. Package resources + manifest into unsigned.apk
    const unsignedApk = path.join(binDir, "unsigned.apk");
    execFileSync(
      aaptBin,
      ["package", "-f", "-M", manifestPath, "-S", resDir, "-I", androidJar, "-F", unsignedApk],
      { stdio: "pipe" },
    );

    // 5. Add classes.dex to unsigned.apk
    execFileSync(aaptBin, ["add", "unsigned.apk", "classes.dex"], {
      cwd: binDir,
      stdio: "pipe",
    });

    // 6. Zipalign APK
    const alignedApk = path.join(binDir, "aligned.apk");
    execFileSync(zipalignBin, ["-f", "-p", "4", unsignedApk, alignedApk], { stdio: "pipe" });

    // 7. Sign APK with standard debug signing key (app itself runs cleanly as XEROTV)
    execFileSync(
      apksignerBin,
      [
        "sign",
        "--ks",
        keystorePath,
        "--ks-pass",
        "pass:android",
        "--ks-key-alias",
        "androiddebugkey",
        "--key-pass",
        "pass:android",
        "--out",
        finalApkPath,
        alignedApk,
      ],
      { stdio: "pipe" },
    );

    // 8. Verify APK signature
    execFileSync(apksignerBin, ["verify", finalApkPath], { stdio: "pipe" });

    const apkBuffer = fs.readFileSync(finalApkPath);
    return {
      apkPath: finalApkPath,
      apkBuffer,
      origin: cleanOrigin,
      sizeBytes: apkBuffer.length,
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
