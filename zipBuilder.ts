import zlib from "node:zlib";

export interface ZipFileEntry {
  name: string;
  content: string | Buffer;
}

/**
 * Builds a standard PKZIP archive buffer in memory using DEFLATE compression
 * and Node 22 built-in CRC32 so the server needs zero extra zip binaries.
 */
export function createZipArchive(entries: ZipFileEntry[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const cleanName = entry.name.replace(/^\/+/, "");
    const nameBuf = Buffer.from(cleanName, "utf-8");
    const rawBuf =
      typeof entry.content === "string"
        ? Buffer.from(entry.content, "utf-8")
        : entry.content;

    const crc = zlib.crc32(rawBuf) >>> 0;
    const compressedBuf = zlib.deflateRawSync(rawBuf, { level: 6 });

    // Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(8, 8); // Compression method: 8 = DEFLATE
    localHeader.writeUInt16LE(0, 10); // Mod time
    localHeader.writeUInt16LE(0x5421, 12); // Mod date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(compressedBuf.length, 18); // Compressed size
    localHeader.writeUInt32LE(rawBuf.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28); // Extra field length

    localChunks.push(localHeader, nameBuf, compressedBuf);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10); // DEFLATE
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5421, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedBuf.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header

    centralChunks.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressedBuf.length;
  }

  const centralDirBuffer = Buffer.concat(centralChunks);

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // Disk number
  eocd.writeUInt16LE(0, 6); // Start disk
  eocd.writeUInt16LE(entries.length, 8); // Entries on disk
  eocd.writeUInt16LE(entries.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirBuffer.length, 12); // Central directory size
  eocd.writeUInt32LE(offset, 16); // Central directory offset
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localChunks, centralDirBuffer, eocd]);
}

export function buildTwaManifest(appOrigin: string) {
  let host = "xerotv.app";
  try {
    host = new URL(appOrigin).host;
  } catch {
    host = "xerotv.app";
  }

  return {
    packageId: "tv.xero.app",
    host,
    name: "XEROTV",
    launcherName: "XEROTV",
    display: "standalone",
    themeColor: "#090A0F",
    themeColorDark: "#090A0F",
    navigationColor: "#090A0F",
    navigationColorDark: "#090A0F",
    navigationDividerColor: "#141621",
    navigationDividerColorDark: "#141621",
    backgroundColor: "#090A0F",
    enableNotifications: false,
    startUrl: "/",
    iconUrl: `${appOrigin.replace(/\/+$/, "")}/pwa-512x512.png`,
    maskableIconUrl: `${appOrigin.replace(/\/+$/, "")}/pwa-maskable-512x512.png`,
    monochromeIconUrl: "",
    splashScreenFadeOutDuration: 300,
    signingKey: {
      path: "./android.keystore",
      alias: "xerotv",
    },
    appVersionName: "1.0.0",
    appVersionCode: 1,
    shortcuts: [
      { name: "Movies", shortName: "Movies", url: "/movies" },
      { name: "TV Shows", shortName: "TV", url: "/tv-shows" },
      { name: "Sync Hub", shortName: "Sync", url: "/sync" },
    ],
    generatorApp: "XEROTV-Builder",
    webManifestUrl: `${appOrigin.replace(/\/+$/, "")}/manifest.webmanifest`,
    fallbackType: "customtabs",
    enableSiteSettingsShortcut: true,
    isChromeOSOnly: false,
    orientation: "default",
    minSdkVersion: 24,
  };
}

export function buildWindowsShortcut(appOrigin: string): string {
  const cleanOrigin = appOrigin.replace(/\/+$/, "");
  return `[InternetShortcut]\r\nURL=${cleanOrigin}/\r\nIconIndex=0\r\n`;
}

export function buildAndroidProjectEntries(appOrigin: string): ZipFileEntry[] {
  const cleanOrigin = appOrigin.replace(/\/+$/, "");
  const twaJson = JSON.stringify(buildTwaManifest(cleanOrigin), null, 2);

  return [
    {
      name: "xerotv-android/README.md",
      content: `# XEROTV Android APK Project

This Gradle Android project wraps **XEROTV** (${cleanOrigin}) as a native Android WebView application with fullscreen video playback, landscape rotation support, dark cinema theming (#090A0F), and hardware back navigation.

## Build APK Locally (Android Studio or CLI)

### Option A: Android Studio
1. Open the \`xerotv-android/\` folder in Android Studio.
2. Wait for Gradle Sync to finish.
3. Click **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
4. Output APK: \`app/build/outputs/apk/debug/app-debug.apk\`.

### Option B: Command Line (JDK 17 + Android SDK)
\`\`\`bash
cd xerotv-android
gradle assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
\`\`\`

### Option C: Bubblewrap Trusted Web Activity (Play Store Ready)
\`\`\`bash
npx @bubblewrap/cli init --manifest="${cleanOrigin}/manifest.webmanifest"
npx @bubblewrap/cli build
\`\`\`
`,
    },
    {
      name: "xerotv-android/twa-manifest.json",
      content: twaJson,
    },
    {
      name: "xerotv-android/settings.gradle.kts",
      content: `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "XEROTV"
include(":app")
`,
    },
    {
      name: "xerotv-android/build.gradle.kts",
      content: `plugins {
    id("com.android.application") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
`,
    },
    {
      name: "xerotv-android/gradle.properties",
      content: `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`,
    },
    {
      name: "xerotv-android/app/build.gradle.kts",
      content: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "tv.xero.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "tv.xero.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "XEROTV_ORIGIN", "\\"${cleanOrigin}\\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
`,
    },
    {
      name: "xerotv-android/app/proguard-rules.pro",
      content: `-keepclassmembers class tv.xero.app.MainActivity { *; }
`,
    },
    {
      name: "xerotv-android/app/src/main/AndroidManifest.xml",
      content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:hardwareAccelerated="true"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.XeroTV"
        android:usesCleartextTraffic="false">
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden|smallestScreenSize|screenLayout"
            android:exported="true"
            android:launchMode="singleTop">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`,
    },
    {
      name: "xerotv-android/app/src/main/res/values/strings.xml",
      content: `<resources>
    <string name="app_name">XEROTV</string>
</resources>
`,
    },
    {
      name: "xerotv-android/app/src/main/res/values/styles.xml",
      content: `<resources>
    <style name="Theme.XeroTV" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">@android:color/black</item>
        <item name="android:statusBarColor">#090A0F</item>
        <item name="android:navigationBarColor">#090A0F</item>
    </style>
</resources>
`,
    },
    {
      name: "xerotv-android/app/src/main/java/tv/xero/app/MainActivity.kt",
      content: `package tv.xero.app

import android.annotation.SuppressLint
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var rootContainer: FrameLayout
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = Color.parseColor("#090A0F")
        window.navigationBarColor = Color.parseColor("#090A0F")
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        rootContainer = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#090A0F"))
        }
        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#090A0F"))
        }
        rootContainer.addView(webView)
        setContentView(rootContainer)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportMultipleWindows(false)
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                // Block malicious external popups while keeping XEROTV navigation inside WebView
                return !url.startsWith(BuildConfig.XEROTV_ORIGIN)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (customView != null) {
                    callback?.onCustomViewHidden()
                    return
                }
                customView = view
                customViewCallback = callback
                rootContainer.addView(view)
                webView.visibility = View.GONE
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                WindowInsetsControllerCompat(window, rootContainer).hide(
                    WindowInsetsCompat.Type.systemBars()
                )
            }

            override fun onHideCustomView() {
                customView?.let { rootContainer.removeView(it) }
                customView = null
                customViewCallback?.onCustomViewHidden()
                customViewCallback = null
                webView.visibility = View.VISIBLE
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                WindowInsetsControllerCompat(window, rootContainer).show(
                    WindowInsetsCompat.Type.systemBars()
                )
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (customView != null) {
                    webView.webChromeClient?.onHideCustomView()
                } else if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(BuildConfig.XEROTV_ORIGIN)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
`,
    },
  ];
}
