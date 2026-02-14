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
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
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
import { HomeViewerScreen } from './src/screens/HomeViewerScreen';
import { ChartDashboardScreen } from './src/screens/ChartDashboardScreen';
import { ScanConfirmScreen } from './src/screens/ScanConfirmScreen';

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
// Landing Screen (Home tab)
// ---------------------------------------------------------------------------
function LandingScreen() {
  const { colors, isDark, setThemeMode } = useTheme();
  const { user, logout } = useAuth();

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
        <View style={[styles.heroIconBox, { backgroundColor: isDark ? 'rgba(76,175,80,0.15)' : 'rgba(46,125,50,0.1)' }]}>
          <Text style={styles.heroIcon}>⚡</Text>
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Know Your Power</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {user ? `Welcome, ${user.name || user.email.split('@')[0]}!` : 'Scan appliances to see real energy costs.'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, marginTop: 4 }]}>
          Scan appliances. Track energy. Save money.
        </Text>
      </View>

      <View style={[styles.stepsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[
          { num: '1', text: 'Scan or upload a photo of your appliance' },
          { num: '2', text: 'AI identifies the device & estimates power usage' },
          { num: '3', text: 'See cost, ghost energy & optimization tips' },
        ].map((step, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={[styles.stepLine, { backgroundColor: colors.border }]} />}
            <View style={styles.step}>
              <View style={[styles.stepNum, { backgroundColor: colors.accent }]}>
                <Text style={styles.stepNumText}>{step.num}</Text>
              </View>
              <Text style={[styles.stepText, { color: isDark ? '#ccc' : '#555' }]}>{step.text}</Text>
            </View>
          </React.Fragment>
        ))}
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
