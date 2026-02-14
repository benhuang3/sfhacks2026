# SmartGrid Home

Scan your home appliances with on-device AI to monitor energy usage and detect ghost energy drain.

## Quick Start

```bash
cd app
npm install
```

Then pick how you want to run it:

| Platform | Command | Requirements |
|----------|---------|-------------|
| **Web** | `npx expo start --web` | Just Node.js |
| **Android** | `npx expo prebuild --platform android && npm run android` | Android Studio + JDK 17 |
| **iOS** | `npx expo prebuild --platform ios && npx expo run:ios --device` | Xcode |

---

## Run on Web (fastest)

No native SDK needed — runs in your browser:

```bash
cd app
npm install
npx expo start --web
```

Opens at `http://localhost:8081`. Camera uses your webcam. On-device AI detection is shimmed on web (returns empty results), but the Quick Scan flow (capture + upload to backend) works fully.

---

## Run on Android

### Prerequisites

- **Node.js** 18+
- **JDK 17**
- **Android Studio** with Android SDK (API 34+), Build-Tools, Platform-Tools

### Environment setup

Add to `~/.zshrc` or `~/.bashrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk   # macOS
# export ANDROID_HOME=$HOME/Android/Sdk         # Linux
export PATH=$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH
```

### Build and install on your phone

1. Enable USB Debugging: **Settings > About phone > tap Build number 7x > Developer options > USB debugging**
2. Plug in phone via USB, tap **Allow** when prompted

```bash
cd app
npm install
npx expo prebuild --platform android
npm run android
```

First build takes several minutes. After that, JS changes hot-reload instantly.

### Alternative: EAS cloud build (no local Android SDK)

```bash
npx eas build --platform android --profile development
```

Download the APK from the EAS build page, install on phone, then:

```bash
cd app && npx expo start --dev-client
```

Scan the QR code from the dev client app.

---

## Run on iOS

### Prerequisites

- **Xcode** (from Mac App Store)
- Xcode version must support your iPhone's iOS version

### Build and install on your phone

```bash
cd app
npm install
npx expo prebuild --platform ios
npx expo run:ios --device
```

Set a signing team in Xcode when prompted (your personal Apple ID works for free development).

### Alternative: EAS cloud build (requires paid $99/yr Apple Developer account)

```bash
npx eas build --platform ios --profile development
```

---

## After the first native build

Once the dev client is on your phone, you only need to rebuild when adding/removing native dependencies. For JS changes, just:

```bash
cd app && npx expo start --dev-client
```

Scan the QR code from the dev client app on your phone. Hot reload handles all JS/TS changes.

---

## Run the Backend

```bash
cd be
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The mobile app connects to your machine's IP on port 8000. Update the IP in `app/src/services/apiService.ts` if needed.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Blank page on web | Open browser console (F12) for errors. Try `npx expo start --web --clear` |
| `JAVA_HOME is not set` | `export JAVA_HOME=$(/usr/libexec/java_home -v 17)` |
| `SDK location not found` | Create `app/android/local.properties` with `sdk.dir=/path/to/Android/sdk` |
| `adb devices` empty | Try different USB cable, run `adb kill-server && adb start-server` |
| Metro not connecting to phone | `adb reverse tcp:8081 tcp:8081` |
| Gradle out of memory | Add `org.gradle.jvmargs=-Xmx4096m` to `app/android/gradle.properties` |
| Xcode "needs iOS 17.x" | Update Xcode to match your phone's iOS, or build for Android/web instead |
