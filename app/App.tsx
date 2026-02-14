import { StatusBar } from 'expo-status-bar';
import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { UploadScanScreen, ScanResultData } from './src/screens/UploadScanScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { CameraScanScreen } from './src/screens/CameraScanScreen';

type Screen = 'home' | 'upload' | 'camera-scan' | 'dashboard';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [scannedDevices, setScannedDevices] = useState<ScanResultData[]>([]);

  const handleScanComplete = useCallback((result: ScanResultData) => {
    setScannedDevices(prev => [...prev, result]);
  }, []);

  if (screen === 'upload') {
    return (
      <>
        <UploadScanScreen
          onBack={() => setScreen('home')}
          onScanComplete={handleScanComplete}
        />
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

  if (screen === 'dashboard') {
    return (
      <>
        <DashboardScreen
          onBack={() => setScreen('home')}
          onScan={() => setScreen('upload')}
          scannedDevices={scannedDevices}
        />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Nav bar */}
      <View style={styles.nav}>
        <Text style={styles.navLogo}>⚡ SmartGrid</Text>
        {scannedDevices.length > 0 && (
          <TouchableOpacity onPress={() => setScreen('dashboard')}>
            <Text style={styles.navLink}>Dashboard ({scannedDevices.length})</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.badge}>SF Hacks 2026</Text>
        <Text style={styles.title}>SmartGrid Home</Text>
        <Text style={styles.subtitle}>
          Scan your appliances. Know your power.{'\n'}Save energy & money.
        </Text>
      </View>

      {/* Feature Cards */}
      <View style={styles.features}>
        <View style={styles.featureCard}>
          <Text style={styles.featureIcon}>🔍</Text>
          <Text style={styles.featureTitle}>AI Detection</Text>
          <Text style={styles.featureDesc}>
            MobileNet V3 identifies appliances from photos
          </Text>
        </View>
        <View style={styles.featureCard}>
          <Text style={styles.featureIcon}>⚡</Text>
          <Text style={styles.featureTitle}>Power Analysis</Text>
          <Text style={styles.featureDesc}>
            Gemini estimates real wattage & monthly costs
          </Text>
        </View>
        <View style={styles.featureCard}>
          <Text style={styles.featureIcon}>📊</Text>
          <Text style={styles.featureTitle}>Dashboard</Text>
          <Text style={styles.featureDesc}>
            Track all your devices & total energy usage
          </Text>
        </View>
      </View>

      {/* CTA Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setScreen('upload')}>
          <Text style={styles.primaryBtnText}>📷 Upload & Scan</Text>
        </TouchableOpacity>

        {Platform.OS !== 'web' && (
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setScreen('camera-scan')}>
            <Text style={styles.secondaryBtnText}>📸 Live Camera Scan</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.outlineBtn} onPress={() => setScreen('dashboard')}>
          <Text style={styles.outlineBtnText}>📊 View Dashboard</Text>
        </TouchableOpacity>
      </View>

      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
    paddingHorizontal: 24,
  },

  // Nav
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  navLogo: {
    color: '#4CAF50',
    fontSize: 20,
    fontWeight: '800',
  },
  navLink: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },

  // Hero
  hero: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 32,
  },
  badge: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
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

  // Features
  features: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  featureCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    minWidth: 140,
    flex: 1,
    maxWidth: 200,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  featureIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  featureTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  featureDesc: {
    color: '#888',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
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
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#1a6b3a',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  secondaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  outlineBtn: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  outlineBtnText: {
    color: '#ccc',
    fontSize: 16,
    fontWeight: '600',
  },
});
