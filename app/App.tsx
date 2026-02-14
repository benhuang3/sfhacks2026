/**
 * SmartGrid Home — Main App with React Navigation + Auth
 *
 * Navigation structure:
 *   AuthStack (not logged in):
 *     - Login
 *     - Signup
 *     - ForgotPassword
 *
 *   MainTabs (logged in):
 *     - Home       → LandingScreen (CTA)
 *     - Scan       → UploadScanScreen / CameraScanScreen
 *     - Dashboard  → ChartDashboardScreen
 *     - My Home    → HomeManagerScreen → HomeSummary → Actions → 3D
 */

import React, { useEffect, useState, createContext, useContext } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, SafeAreaView,
  Platform, useColorScheme, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView } from 'react-native';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { ScanResultScreen } from './src/screens/ScanResultScreen';
import { CameraScanScreen } from './src/screens/CameraScanScreen';

type Screen = 'home' | 'scanner' | 'camera-scan' | 'results';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');

  if (screen === 'scanner') {
    return (
      <>
        <ScannerScreen />
        <SafeAreaView style={styles.backBar}>
          <TouchableOpacity onPress={() => setScreen('home')} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setScreen('results')} style={styles.resultsButton}>
            <Text style={styles.resultsText}>View Results</Text>
          </TouchableOpacity>
        </SafeAreaView>
        <StatusBar style="light" />
      </>
    );
  }

  if (screen === 'camera-scan') {
    return (
      <>
        <CameraScanScreen onBack={() => setScreen('home')} />
        <StatusBar style="light" />
      </>
    );
  }

  if (screen === 'results') {
    return (
      <>
        <ScanResultScreen onBack={() => setScreen('home')} />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.nav}>
        <Text style={[styles.navLogo, { color: colors.accent }]}>⚡ SmartGrid</Text>
        <View style={styles.navRight}>
          <TouchableOpacity style={styles.themeToggle} onPress={() => setThemeMode(isDark ? 'light' : 'dark')}>
            <Text style={styles.themeToggleText}>{isDark ? '🌙' : '☀️'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout}>
            <Text style={{ color: '#ff4444', fontSize: 13, fontWeight: '600' }}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>SmartGrid Home</Text>
        <Text style={styles.subtitle}>Scan. Monitor. Save.</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.scanButton} onPress={() => setScreen('scanner')}>
          <Text style={styles.scanButtonText}>Scan Room</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cameraScanButton} onPress={() => setScreen('camera-scan')}>
          <Text style={styles.cameraScanButtonText}>📷 Quick Scan</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => setScreen('results')}>
          <Text style={styles.secondaryButtonText}>View Scan Results</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.footnote, { color: isDark ? '#555' : '#999' }]}>
        Power data based on Berkeley Lab and ENERGY STAR research
      </Text>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------
export default function App() {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    AsyncStorage.getItem('themeMode').then((v) => {
      if (v) setThemeMode(v as ThemeMode);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('themeMode', themeMode).catch(() => {});
  }, [themeMode]);

  const isDark = themeMode === 'system' ? systemScheme !== 'light' : themeMode === 'dark';
  const colors = isDark ? darkColors : lightColors;

  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.bg, card: colors.card, border: colors.border, primary: colors.accent, text: colors.text } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.card, border: colors.border, primary: colors.accent, text: colors.text } };

  return (
    <ThemeContext.Provider value={{ isDark, themeMode, setThemeMode, colors }}>
      <AuthProvider>
        <NavigationContainer theme={navTheme}>
          <AppContent />
        </NavigationContainer>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </AuthProvider>
    </ThemeContext.Provider>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a12' }}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={{ color: '#888', marginTop: 16 }}>Loading...</Text>
      </View>
    );
  }

  return isAuthenticated ? <MainTabs /> : <AuthNavigator />;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  navLogo: { fontSize: 20, fontWeight: '800' },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  themeToggle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  themeToggleText: { fontSize: 18 },
  hero: { alignItems: 'center', marginTop: 48, marginBottom: 40 },
  heroIconBox: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  heroIcon: { fontSize: 36 },
  title: { fontSize: 32, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
  stepsContainer: { borderRadius: 16, padding: 20, marginBottom: 32, borderWidth: 1 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  stepNumText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  stepText: { fontSize: 14, flex: 1 },
  stepLine: { width: 2, height: 20, marginLeft: 13, marginVertical: 4 },
  footnote: { fontSize: 11, textAlign: 'center', marginTop: 32 },
});
