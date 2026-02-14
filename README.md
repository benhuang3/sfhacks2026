# SmartGrid Home — Android Install Guide

## Prerequisites

- **Node.js** 18+
- **Java Development Kit (JDK) 17** — required by React Native / Gradle
- **Android Studio** with:
  - Android SDK (API 34 or higher)
  - Android SDK Build-Tools
  - Android SDK Platform-Tools
  - Android Emulator (optional, for testing without a phone)
- **An Android phone** with USB debugging enabled (for on-device testing)

## 1. Install system dependencies

### macOS

```bash
brew install node watchman
brew install --cask android-studio
```

JDK 17 (if not bundled with Android Studio):

```bash
brew install --cask zulu@17
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y openjdk-17-jdk watchman
```

Download Android Studio from https://developer.android.com/studio and install it.

### Windows

Install Node.js from https://nodejs.org. Install Android Studio from https://developer.android.com/studio (includes JDK 17).

## 2. Configure Android SDK

1. Open Android Studio → **Settings** → **Languages & Frameworks** → **Android SDK**
2. Under **SDK Platforms**, check **Android 14 (API 34)** or higher
3. Under **SDK Tools**, check:
   - Android SDK Build-Tools
   - Android SDK Command-line Tools
   - Android Emulator
   - Android SDK Platform-Tools
4. Click **Apply** to install

Set environment variables (add to `~/.bashrc`, `~/.zshrc`, or equivalent):

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk   # macOS
# export ANDROID_HOME=$HOME/Android/Sdk         # Linux
# export ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk # Windows

export PATH=$ANDROID_HOME/emulator:$PATH
export PATH=$ANDROID_HOME/platform-tools:$PATH
```

Reload your shell:

```bash
source ~/.zshrc  # or ~/.bashrc
```

## 3. Install project dependencies

```bash
cd app
npm install
```

## 4. Generate the native Android project

This app uses native modules (`react-native-vision-camera`, `react-native-executorch`) that require a dev build — Expo Go will not work.

```bash
npx expo prebuild --platform android
```

This generates the `android/` directory with all native code.

## 5. Run on a physical Android device

### Enable USB Debugging on your phone

1. Go to **Settings** → **About phone**
2. Tap **Build number** 7 times to unlock Developer options
3. Go to **Settings** → **Developer options**
4. Enable **USB debugging**
5. Plug your phone into your computer via USB cable
6. When prompted on the phone, tap **Allow** to authorize your computer

### Verify your device is detected

```bash
adb devices
```

You should see your device listed (e.g., `XXXXXXXX  device`). If it shows `unauthorized`, check the phone for the USB debugging prompt.

### Build and install

```bash
npm run android
```

This compiles the native project with Gradle, installs the APK on your connected device, and starts the Metro bundler. The first build takes several minutes.

## 6. Run on an Android Emulator (alternative)

1. Open Android Studio → **Virtual Device Manager**
2. Create a device (e.g., Pixel 7, API 34)
3. Start the emulator
4. Run:

```bash
npm run android
```

> Note: Camera features won't work properly on the emulator. Use a physical device for testing the scanning pipeline.

## 7. Build with EAS (cloud build, no local Android SDK needed)

If you don't want to install Android Studio locally:

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile development
```

This builds in the cloud and gives you a downloadable `.apk` file. Install it on your phone by:

1. Downloading the APK link from the EAS build page
2. Opening the APK on your phone (you may need to enable **Install from unknown sources** in Settings)

Then start the dev server locally:

```bash
npx expo start --dev-client
```

Scan the QR code shown in the terminal from the app on your phone.

## Troubleshooting

### `JAVA_HOME is not set`

Make sure JDK 17 is installed and set:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)  # macOS
# export JAVA_HOME=/usr/lib/jvm/java-17-openjdk    # Linux
```

### `SDK location not found`

Create `app/android/local.properties`:

```
sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk
```

### `adb devices` shows nothing

- Try a different USB cable (some cables are charge-only)
- Make sure USB debugging is enabled
- Run `adb kill-server && adb start-server`

### Gradle build fails with memory error

Add to `app/android/gradle.properties`:

```
org.gradle.jvmargs=-Xmx4096m
```

### Metro bundler not connecting to device

Make sure your phone and computer are on the same Wi-Fi network, or run:

```bash
adb reverse tcp:8081 tcp:8081
```
