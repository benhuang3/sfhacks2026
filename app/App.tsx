/**
 * SmartGrid Home — Energy monitoring app
 */

import { StatusBar } from 'expo-status-bar';
import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UploadScanScreen, ScanResultData } from './src/screens/UploadScanScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';

type Screen = 'home' | 'upload' | 'dashboard';
type ThemeMode = 'dark' | 'light' | 'system';

// Theme Context
interface ThemeContextType {
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  colors: typeof darkColors;
}

const darkColors = {
  bg: '#0a0a12',
  card: '#12121a',
  border: '#1f1f2e',
  text: '#ffffff',
  textSecondary: '#888888',
  accent: '#4CAF50',
};

const lightColors = {
  bg: '#f5f5f5',
  card: '#ffffff',
  border: '#e0e0e0',
  text: '#1a1a1a',
  textSecondary: '#666666',
  accent: '#2E7D32',
};

export const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  themeMode: 'dark',
  setThemeMode: () => {},
  colors: darkColors,
});

export const useTheme = () => useContext(ThemeContext);

export default function App() {
  const systemScheme = useColorScheme();
  const [screen, setScreen] = useState<Screen>('home');
  const [scannedDevices, setScannedDevices] = useState<ScanResultData[]>([]);
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [isLoaded, setIsLoaded] = useState(false);

  // Compute actual dark mode
  const isDark = themeMode === 'system' ? systemScheme !== 'light' : themeMode === 'dark';
  const colors = isDark ? darkColors : lightColors;

  // Load persisted data on mount
  useEffect(() => {
    (async () => {
      try {
        const [savedDevices, savedTheme] = await Promise.all([
          AsyncStorage.getItem('scannedDevices'),
          AsyncStorage.getItem('themeMode'),
        ]);
        if (savedDevices) setScannedDevices(JSON.parse(savedDevices));
        if (savedTheme) setThemeMode(savedTheme as ThemeMode);
      } catch (e) {
        console.log('Load error:', e);
      }
      setIsLoaded(true);
    })();
  }, []);

  // Persist scanned devices
  useEffect(() => {
    if (isLoaded && scannedDevices.length > 0) {
      AsyncStorage.setItem('scannedDevices', JSON.stringify(scannedDevices)).catch(console.log);
    }
  }, [scannedDevices, isLoaded]);

  // Persist theme
  useEffect(() => {
    if (isLoaded) {
      AsyncStorage.setItem('themeMode', themeMode).catch(console.log);
    }
  }, [themeMode, isLoaded]);

  const handleThemeChange = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
  }, []);

  const handleScanComplete = useCallback((result: ScanResultData) => {
    setScannedDevices(prev => [...prev, result]);
  }, []);

  const handleClearHistory = useCallback(() => {
    setScannedDevices([]);
    AsyncStorage.removeItem('scannedDevices').catch(console.log);
  }, []);

  const themeValue = { isDark, themeMode, setThemeMode: handleThemeChange, colors };

  if (screen === 'upload') {
    return (
      <ThemeContext.Provider value={themeValue}>
        <UploadScanScreen
          onBack={() => setScreen('home')}
          onScanComplete={handleScanComplete}
          onViewDashboard={() => setScreen('dashboard')}
        />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ThemeContext.Provider>
    );
  }

  if (screen === 'dashboard') {
    return (
      <ThemeContext.Provider value={themeValue}>
        <DashboardScreen
          onBack={() => setScreen('home')}
          onScan={() => setScreen('upload')}
          scannedDevices={scannedDevices}
          onClearHistory={handleClearHistory}
        />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ThemeContext.Provider>
    );
  }

  // Dynamic styles based on theme
  const dynamicStyles = StyleSheet.create({
    container: { ...styles.container, backgroundColor: colors.bg },
    nav: { ...styles.nav },
    navLogo: { ...styles.navLogo, color: colors.accent },
    title: { ...styles.title, color: colors.text },
    subtitle: { ...styles.subtitle, color: colors.textSecondary },
    stepsContainer: { ...styles.stepsContainer, backgroundColor: colors.card, borderColor: colors.border },
    stepText: { ...styles.stepText, color: isDark ? '#ccc' : '#555' },
  });

  return (
    <ThemeContext.Provider value={themeValue}>
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Simple Nav */}
      <View style={styles.nav}>
        <Text style={[styles.navLogo, { color: colors.accent }]}>⚡ SmartGrid</Text>
        <View style={styles.navRight}>
          {/* Theme Toggle */}
          <TouchableOpacity 
            style={styles.themeToggle} 
            onPress={() => setThemeMode(isDark ? 'light' : 'dark')}
          >
            <Text style={styles.themeToggleText}>{isDark ? '🌙' : '☀️'}</Text>
          </TouchableOpacity>
          {scannedDevices.length > 0 && (
            <TouchableOpacity onPress={() => setScreen('dashboard')}>
              <Text style={styles.navBadge}>{scannedDevices.length} devices</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <View style={[styles.heroIconBox, { backgroundColor: isDark ? 'rgba(76, 175, 80, 0.15)' : 'rgba(46, 125, 50, 0.1)' }]}>
          <Text style={styles.heroIcon}>⚡</Text>
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Know Your Power</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Scan appliances to see real energy costs.{'\n'}Make smarter choices.
        </Text>
      </View>

      {/* Stats Banner (if has devices) */}
      {scannedDevices.length > 0 && (
        <View style={[styles.statsBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statsItem}>
            <Text style={[styles.statsValue, { color: colors.accent }]}>{scannedDevices.length}</Text>
            <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>Scanned</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsItem}>
            <Text style={[styles.statsValue, { color: colors.text }]}>
              {scannedDevices.reduce((sum, d) => sum + (d.power_profile?.profile?.active_watts_typical || 0), 0).toFixed(0)}W
            </Text>
            <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>Total Active</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsItem}>
            <Text style={[styles.statsValue, { color: '#FF9800' }]}>
              {scannedDevices.reduce((sum, d) => sum + (d.power_profile?.profile?.standby_watts_typical || 0), 0).toFixed(1)}W
            </Text>
            <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>Standby</Text>
          </View>
        </View>
      )}

      {/* How it works */}
      <View style={[styles.stepsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.step}>
          <View style={[styles.stepNum, { backgroundColor: colors.accent }]}><Text style={styles.stepNumText}>1</Text></View>
          <Text style={[styles.stepText, { color: isDark ? '#ccc' : '#555' }]}>Upload a photo of your appliance</Text>
        </View>
        <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
        <View style={styles.step}>
          <View style={[styles.stepNum, { backgroundColor: colors.accent }]}><Text style={styles.stepNumText}>2</Text></View>
          <Text style={[styles.stepText, { color: isDark ? '#ccc' : '#555' }]}>AI identifies the device type</Text>
        </View>
        <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
        <View style={styles.step}>
          <View style={[styles.stepNum, { backgroundColor: colors.accent }]}><Text style={styles.stepNumText}>3</Text></View>
          <Text style={[styles.stepText, { color: isDark ? '#ccc' : '#555' }]}>See power usage & cost estimates</Text>
        </View>
      </View>

      {/* CTA Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.accent }]} onPress={() => setScreen('upload')}>
          <Text style={styles.primaryBtnText}>📷 Scan Appliance</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: isDark ? '#1f1f2e' : '#e8e8e8' }]} onPress={() => setScreen('dashboard')}>
          <Text style={[styles.secondaryBtnText, { color: isDark ? '#aaa' : '#555' }]}>📊 View Dashboard</Text>
        </TouchableOpacity>
      </View>

      {/* Data source note */}
      <Text style={[styles.footnote, { color: isDark ? '#555' : '#999' }]}>
        Power data based on Berkeley Lab and ENERGY STAR research
      </Text>

      <StatusBar style={isDark ? 'light' : 'dark'} />
    </SafeAreaView>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a12',
    paddingHorizontal: 24,
  },

  // Nav
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  navLogo: {
    color: '#4CAF50',
    fontSize: 20,
    fontWeight: '800',
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  themeToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeToggleText: {
    fontSize: 18,
  },
  navBadge: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
  },

  // Stats Banner
  statsBanner: {
    flexDirection: 'row',
    backgroundColor: '#12121a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1f1f2e',
  },
  statsItem: {
    flex: 1,
    alignItems: 'center',
  },
  statsValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statsLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  statsDivider: {
    width: 1,
    backgroundColor: '#2a2a3e',
    marginVertical: 4,
  },

  // Hero
  hero: {
    alignItems: 'center',
    marginTop: 48,
    marginBottom: 40,
  },
  heroIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  heroIcon: {
    fontSize: 36,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 24,
  },

  // Steps
  stepsContainer: {
    backgroundColor: '#12121a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#1f1f2e',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  stepText: {
    color: '#ccc',
    fontSize: 14,
    flex: 1,
  },
  stepLine: {
    width: 2,
    height: 20,
    backgroundColor: '#2a2a3e',
    marginLeft: 13,
    marginVertical: 4,
  },

  // Actions
  actions: {
    gap: 12,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  primaryBtn: {
    backgroundColor: '#4CAF50',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#1f1f2e',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '600',
  },

  // Footnote
  footnote: {
    color: '#555',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 32,
  },
});
