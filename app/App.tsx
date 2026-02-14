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
    <SafeAreaView style={styles.container}>
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

      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#4CAF50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#aaa',
  },
  actions: {
    gap: 16,
  },
  scanButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  cameraScanButton: {
    backgroundColor: '#1a6b3a',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  cameraScanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#2a2a3e',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  secondaryButtonText: {
    color: '#ccc',
    fontSize: 18,
    fontWeight: '600',
  },
  backBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  backText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsButton: {
    backgroundColor: 'rgba(76,175,80,0.8)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  resultsText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
