# WattVision — Install & Run Guide

## Prerequisites

- **Node.js** 18+
- **npm** (comes with Node.js)

## Quick Start (Web)

The fastest way to run the app — no native SDK needed:

```bash
cd app
npm install
npx expo start --web
```

This opens the app in your browser at `http://localhost:8081`. The camera uses your webcam via the browser's `getUserMedia` API.

> Note: On-device AI detection (ExecuTorch) is shimmed on web and returns empty results. The Quick Scan flow (capture photo → upload to backend) works fully.

## Android

### Prerequisites

- **JDK 17**
- **Android Studio** with Android SDK (API 34+), Build-Tools, Platform-Tools
- **An Android phone** with USB debugging enabled (or use the emulator)

### Environment setup

Add to `~/.zshrc` or `~/.bashrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk   # macOS
# export ANDROID_HOME=$HOME/Android/Sdk         # Linux

export PATH=$ANDROID_HOME/emulator:$PATH
export PATH=$ANDROID_HOME/platform-tools:$PATH
```

### Build & run on device

```bash
cd app
npm install
npx expo prebuild --platform android
npm run android
```

The first build takes several minutes. Subsequent JS changes hot-reload instantly.

### Enable USB Debugging on your phone

1. **Settings** > **About phone** > tap **Build number** 7 times
2. **Settings** > **Developer options** > enable **USB debugging**
3. Plug in via USB, tap **Allow** on the phone prompt
4. Verify: `adb devices` should list your device

### Using EAS cloud build (no local SDK needed)

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile development
```

Download the APK from the EAS build page and install on your phone. Then:

```bash
cd app
npx expo start --dev-client
```

Scan the QR code from the dev client app on your phone.

## iOS

### Prerequisites

- **Xcode** (from Mac App Store)
- Your Xcode version must support your iPhone's iOS version

### Build & run on device

```bash
cd app
npm install
npx expo prebuild --platform ios
npx expo run:ios --device
```

You may need to set a signing team in Xcode (your personal Apple ID works for free).

### Using EAS cloud build (requires paid $99/yr Apple Developer account)

```bash
eas build --platform ios --profile development
```

## After installing a dev build

Once the dev client is on your phone, you don't need to rebuild for JS changes. Just start the dev server:

```bash
cd app
npx expo start --dev-client
```

Scan the QR code from the dev client app. Hot reload works for all JS/TS changes. You only need to rebuild when adding or removing native dependencies.

## Troubleshooting

### Blank page on web

Open browser dev tools (F12 > Console) and check for errors. Common fixes:
- Run `npm install` to ensure all deps are installed
- Clear metro cache: `npx expo start --web --clear`

### `JAVA_HOME is not set`

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)  # macOS
```

### `SDK location not found`

Create `app/android/local.properties`:

```
sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk
```

### `adb devices` shows nothing

- Try a different USB cable (some are charge-only)
- Run `adb kill-server && adb start-server`

### Metro bundler not connecting to phone

```bash
adb reverse tcp:8081 tcp:8081
```

### Gradle build out of memory

Add to `app/android/gradle.properties`:

```
org.gradle.jvmargs=-Xmx4096m
```
