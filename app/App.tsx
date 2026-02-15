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
import { NavigationContainer, DefaultTheme, DarkTheme, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Auth
import { AuthProvider, useAuth } from './src/context/AuthContext';

// Auth Screens
import { LoginScreen } from './src/screens/LoginScreen';
import { SignupScreen } from './src/screens/SignupScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';

// App Screens
import { UploadScanScreen, ScanResultData } from './src/screens/UploadScanScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { HomeManagerScreen } from './src/screens/HomeManagerScreen';
import { HomeSummaryScreen } from './src/screens/HomeSummaryScreen';
import { ActionsScreen } from './src/screens/ActionsScreen';
import { CameraScanScreen } from './src/screens/CameraScanScreen';
import { LiveScanScreen } from './src/screens/LiveScanScreen';
import { HomeViewerScreen } from './src/screens/HomeViewerScreen';
import { ChartDashboardScreen } from './src/screens/ChartDashboardScreen';
import { ScanConfirmScreen } from './src/screens/ScanConfirmScreen';

// 3D Scene Component
import { Scene3D } from './src/components/Scene3D';
import { HomeScene, listHomes, getScene } from './src/services/apiClient';

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
type ThemeMode = 'dark' | 'light' | 'system';

const darkColors = {
  bg: '#0a0a12', card: '#12121a', border: '#1f1f2e',
  text: '#ffffff', textSecondary: '#888888', accent: '#4CAF50',
};
const lightColors = {
  bg: '#f5f5f5', card: '#ffffff', border: '#e0e0e0',
  text: '#1a1a1a', textSecondary: '#666666', accent: '#2E7D32',
};

interface ThemeContextType {
  isDark: boolean; themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;
  colors: typeof darkColors;
}

export const ThemeContext = createContext<ThemeContextType>({
  isDark: true, themeMode: 'dark', setThemeMode: () => {}, colors: darkColors,
});
export const useTheme = () => useContext(ThemeContext);

// ---------------------------------------------------------------------------
// Navigators
// ---------------------------------------------------------------------------
const AuthStackNav = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const ScanStackNav = createNativeStackNavigator();
const HomeStackNav = createNativeStackNavigator();

// ---------------------------------------------------------------------------
// Auth Navigator
// ---------------------------------------------------------------------------
function AuthNavigator() {
  return (
    <AuthStackNav.Navigator screenOptions={{ headerShown: false }}>
      <AuthStackNav.Screen name="Login">
        {({ navigation }) => (
          <LoginScreen
            onGoSignup={() => navigation.navigate('Signup' as never)}
            onGoForgot={() => navigation.navigate('ForgotPassword' as never)}
          />
        )}
      </AuthStackNav.Screen>
      <AuthStackNav.Screen name="Signup">
        {({ navigation }) => (
          <SignupScreen onGoLogin={() => navigation.navigate('Login' as never)} />
        )}
      </AuthStackNav.Screen>
      <AuthStackNav.Screen name="ForgotPassword">
        {({ navigation }) => (
          <ForgotPasswordScreen onGoLogin={() => navigation.navigate('Login' as never)} />
        )}
      </AuthStackNav.Screen>
    </AuthStackNav.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Scan Navigator
// ---------------------------------------------------------------------------
function ScanNavigator() {
  return (
    <ScanStackNav.Navigator screenOptions={{ headerShown: false }}>
      <ScanStackNav.Screen name="ScanHome">
        {({ navigation }) => (
          <UploadScanScreen
            onBack={() => navigation.goBack()}
            onScanComplete={(scanData: ScanResultData, imageUri?: string) => {
              // Navigate to confirm screen with scan data
              navigation.navigate('ScanConfirm' as never, { scanData, imageUri } as never);
            }}
            onViewDashboard={() => {
              const parent = navigation.getParent();
              if (parent) parent.navigate('Dashboard' as never);
            }}
            onOpenCamera={() => navigation.navigate('LiveScan' as never)}
          />
        )}
      </ScanStackNav.Screen>
      <ScanStackNav.Screen name="ScanConfirm">
        {({ navigation, route }) => (
          <ScanConfirmScreen
            scanData={(route.params as any)?.scanData}
            imageUri={(route.params as any)?.imageUri}
            onBack={() => navigation.goBack()}
            onDeviceAdded={() => {
              // Go back to scan home after adding device
              navigation.navigate('ScanHome' as never);
            }}
          />
        )}
      </ScanStackNav.Screen>
      <ScanStackNav.Screen name="LiveScan">
        {({ navigation }) => (
          <LiveScanScreen
            onBack={() => navigation.goBack()}
            onCapture={(scanData: any, imageUri: string) => {
              navigation.navigate('ScanConfirm' as never, { scanData, imageUri } as never);
            }}
          />
        )}
      </ScanStackNav.Screen>
      <ScanStackNav.Screen name="CameraCapture">
        {({ navigation }) => (
          <CameraScanScreen
            onBack={() => navigation.goBack()}
            onResult={() => navigation.goBack()}
          />
        )}
      </ScanStackNav.Screen>
    </ScanStackNav.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Home Manager Navigator
// ---------------------------------------------------------------------------
function HomeNavigator() {
  const { user } = useAuth();
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="HomeManager">
        {({ navigation }) => (
          <HomeManagerScreen
            onBack={() => navigation.goBack()}
            onViewSummary={(homeId: string) => navigation.navigate('HomeSummary' as never, { homeId } as never)}
            onViewActions={(homeId: string) => navigation.navigate('HomeActions' as never, { homeId } as never)}
            userId={user?.id}
          />
        )}
      </HomeStackNav.Screen>
      <HomeStackNav.Screen name="HomeSummary">
        {({ navigation, route }) => (
          <HomeSummaryScreen
            homeId={(route.params as any).homeId}
            onBack={() => navigation.goBack()}
            onViewActions={(homeId: string) => navigation.navigate('HomeActions' as never, { homeId } as never)}
          />
        )}
      </HomeStackNav.Screen>
      <HomeStackNav.Screen name="Home3DView">
        {({ navigation, route }) => (
          <HomeViewerScreen
            homeId={(route.params as any).homeId}
            onBack={() => navigation.goBack()}
          />
        )}
      </HomeStackNav.Screen>
      <HomeStackNav.Screen name="HomeActions">
        {({ navigation, route }) => (
          <ActionsScreen
            homeId={(route.params as any).homeId}
            onBack={() => navigation.goBack()}
          />
        )}
      </HomeStackNav.Screen>
    </HomeStackNav.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Screen wrapper
// ---------------------------------------------------------------------------
function DashboardWrapper() {
  const [scannedDevices, setScannedDevices] = useState<ScanResultData[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('scannedDevices').then((d) => {
      if (d) setScannedDevices(JSON.parse(d));
    }).catch(() => {});
  }, []);

  return (
    <ChartDashboardScreen
      scannedDevices={scannedDevices}
    />
  );
}

// ---------------------------------------------------------------------------
// Main Tabs
// ---------------------------------------------------------------------------
function MainTabs() {
  const { colors, isDark } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? '#0a0a12' : '#fff',
          borderTopColor: colors.border,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={LandingScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🏠</Text>, tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanNavigator}
        options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📷</Text>, tabBarLabel: 'Scan' }}
      />
      <Tab.Screen
        name="Dashboard"
        component={DashboardWrapper}
        options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📊</Text>, tabBarLabel: 'Dashboard' }}
      />
      <Tab.Screen
        name="MyHome"
        component={HomeNavigator}
        options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>⚡</Text>, tabBarLabel: 'My Home' }}
      />
    </Tab.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Landing Screen → Smart Dashboard (Home tab)
// ---------------------------------------------------------------------------
function LandingScreen() {
  const { colors, isDark, setThemeMode } = useTheme();
  const { user, logout } = useAuth();

  const [stats, setStats] = React.useState<{
    deviceCount: number;
    annualKwh: number;
    annualCost: number;
    annualCo2: number;
    monthlyCost: number;
    standbyWaste: number;
  } | null>(null);
  const [scene, setScene] = React.useState<HomeScene | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadHomeData = React.useCallback(async () => {
    try {
      setLoading(true);
      let homeId = user?.homeId;
      if (!homeId) {
        // Try finding the first home for this user
        const homes = await listHomes(user?.id ?? '');
        if (homes.length > 0) {
          homeId = homes[0].id;
        }
      }
      if (homeId) {
        const { getHomeSummary } = await import('./src/services/apiClient');
        const [summary, sceneData] = await Promise.all([
          getHomeSummary(homeId),
          getScene(homeId).catch(() => null),
        ]);
        setStats({
          deviceCount: summary.totals.device_count,
          annualKwh: summary.totals.annual_kwh,
          annualCost: summary.totals.annual_cost,
          annualCo2: summary.totals.annual_co2_kg,
          monthlyCost: summary.totals.monthly_cost,
          standbyWaste: summary.totals.standby_annual_cost,
        });
        if (sceneData) setScene(sceneData);
      }
    } catch {
      // No data yet — that's fine
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Refetch when screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      loadHomeData();
    }, [loadHomeData])
  );

  const fmt = (n: number, d = 1) => (n ?? 0).toFixed(d);

  const cards = [
    { icon: '🔌', label: 'Devices', value: stats ? `${stats.deviceCount}` : '–', sub: 'tracked' },
    { icon: '⚡', label: 'Annual kWh', value: stats ? `${fmt(stats.annualKwh, 0)}` : '–', sub: 'kilowatt-hours' },
    { icon: '💰', label: 'Monthly Cost', value: stats ? `$${fmt(stats.monthlyCost, 2)}` : '–', sub: 'estimated' },
    { icon: '🌱', label: 'CO₂ / year', value: stats ? `${fmt(stats.annualCo2, 1)} kg` : '–', sub: 'carbon footprint' },
    { icon: '👻', label: 'Standby Waste', value: stats ? `$${fmt(stats.standbyWaste, 2)}/yr` : '–', sub: 'ghost energy cost' },
    { icon: '📊', label: 'Annual Cost', value: stats ? `$${fmt(stats.annualCost, 2)}` : '–', sub: 'total estimate' },
  ];

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
        <Text style={[styles.title, { color: colors.text, fontSize: 26 }]}>
          {user ? `Welcome, ${user.name || user.email.split('@')[0]}` : 'Know Your Power'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {stats && stats.deviceCount > 0
            ? 'Here\'s your energy snapshot.'
            : 'Scan appliances to start tracking energy.'}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <View style={{
          flexDirection: 'row', flexWrap: 'wrap',
          justifyContent: 'space-between', marginTop: 8,
        }}>
          {cards.map((c, i) => (
            <View
              key={i}
              style={{
                width: '48%',
                backgroundColor: colors.card,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 24, marginBottom: 4 }}>{c.icon}</Text>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{c.value}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{c.label}</Text>
              <Text style={{ color: isDark ? '#555' : '#999', fontSize: 10, marginTop: 1 }}>{c.sub}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 3D Home Preview */}
      {scene && scene.objects && scene.objects.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>
            🏠 Your Home
          </Text>
          <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
            <Scene3D scene={scene} height={180} />
          </View>
        </View>
      )}

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
