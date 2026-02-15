/**
 * Centralized API host config — auto-detects the dev server IP so you
 * don't have to update a hardcoded IP every time your Mac's LAN address changes.
 *
 * How it works:
 *   When running via `npx expo start --dev-client`, the Expo manifest includes
 *   the debugger host (e.g. "10.142.8.249:8081"). We extract the IP portion
 *   and reuse it for backend API calls, since the FastAPI server runs on the
 *   same machine.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

function getDevHost(): string {
  // Web: always localhost
  if (Platform.OS === 'web') return 'localhost';

  // Android emulator: special alias that maps to host loopback
  if (Platform.OS === 'android' && !Constants.isDevice) return '10.0.2.2';

  // Try to extract the IP from Expo's debugger host (works in dev client & Expo Go)
  const debuggerHost =
    Constants.expoGoConfig?.debuggerHost ??
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost ??
    (Constants.manifest as any)?.debuggerHost;

  if (debuggerHost) {
    // debuggerHost looks like "10.142.8.249:8081" — strip the port
    const host = debuggerHost.split(':')[0];
    // Skip tunnel/proxy domains (e.g. "xxx.exp.direct") — they won't reach our local backend
    if (host && !host.includes('.exp.direct') && !host.includes('.ngrok')) {
      return host;
    }
  }

  // Fallback — use LAN IP for physical device testing
  // Update this if your network IP changes
  return '130.212.147.238';
}

/** The dev server's IP/hostname, auto-detected from Expo's manifest. */
export const DEV_HOST = getDevHost();

/** Backend API base URL (FastAPI on port 8001). */
export const API_BASE_URL = __DEV__
  ? `http://${DEV_HOST}:8001`
  : 'https://chips-copied-badly-applied.trycloudflare.com';

/** Backend API v1 base URL. */
export const API_V1_URL = `${API_BASE_URL}/api/v1`;
