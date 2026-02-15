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

import React, { useEffect, useState, useCallback, createContext, useContext } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Image,
  Platform, useColorScheme, ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

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
import { MultiAngleReviewScreen } from './src/screens/MultiAngleReviewScreen';
import { ChatScreen } from './src/screens/ChatScreen';

// 3D Scene Component
import { Scene3D } from './src/components/Scene3D';
import { House3DViewer } from './src/components/House3DViewer';
import { Appliance3DModel } from './src/components/Appliance3DModel';
import { HomeScene, listHomes, getScene, listDevices, Device, Home, RoomModel } from './src/services/apiClient';

// ---------------------------------------------------------------------------
// Theme (extracted to src/context/ThemeContext.tsx to avoid require cycles)
// ---------------------------------------------------------------------------
import {
  ThemeContext, useTheme,
  darkColors, lightColors,
  type ThemeMode,
} from './src/context/ThemeContext';

// Re-export so existing imports from '../../App' still work during migration
export { ThemeContext, useTheme };

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
            onMultiAngleComplete={(scanData: any, imageUris: string[], primaryUri: string) => {
              navigation.navigate('MultiAngleReview' as never, { scanData, imageUris, primaryUri } as never);
            }}
          />
        )}
      </ScanStackNav.Screen>
      <ScanStackNav.Screen name="MultiAngleReview">
        {({ navigation, route }) => (
          <MultiAngleReviewScreen
            scanData={(route.params as any)?.scanData}
            imageUris={(route.params as any)?.imageUris ?? []}
            onContinue={(updatedScanData: any) => {
              const params = route.params as any;
              navigation.navigate('ScanConfirm' as never, {
                scanData: updatedScanData,
                imageUri: params?.primaryUri,
                angleUris: params?.imageUris,
              } as never);
            }}
            onRetake={() => navigation.goBack()}
          />
        )}
      </ScanStackNav.Screen>
      <ScanStackNav.Screen name="CameraCapture">
        {({ navigation }) => (
          <CameraScanScreen
            onBack={() => navigation.goBack()}
            onScanComplete={(scanData: ScanResultData, imageUri?: string) => {
              navigation.navigate('ScanConfirm' as never, { scanData, imageUri } as never);
            }}
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

  // Reload from AsyncStorage every time the tab gains focus
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('scannedDevices').then((d) => {
        if (d) {
          try {
            setScannedDevices(JSON.parse(d));
          } catch (err) {
            console.warn('[App] Failed to parse scannedDevices from AsyncStorage, clearing corrupt value', err);
            AsyncStorage.removeItem('scannedDevices').catch(() => {});
            setScannedDevices([]);
          }
        }
      }).catch(() => {});
    }, [])
  );

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
        options={{
          tabBarIcon: ({ color, size }) => (
            <Image source={require('./assets/home.png')} style={{ width: size, height: size, tintColor: color }} />
          ),
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanNavigator}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="scan" size={size} color={color} />, tabBarLabel: 'Scan' }}
      />
      <Tab.Screen
        name="Dashboard"
        component={DashboardWrapper}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />, tabBarLabel: 'Dashboard' }}
      />
      <Tab.Screen
        name="MyHome"
        component={HomeNavigator}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />, tabBarLabel: 'My Home' }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Image source={require('./assets/gemini.png')} style={{ width: size, height: size, tintColor: color }} />
          ),
          tabBarLabel: 'AI Chat',
        }}
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
  const [devices, setDevices] = React.useState<Device[]>([]);
  const [homes, setHomes] = React.useState<Home[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tappedDevice, setTappedDevice] = React.useState<{ label: string; category: string; roomId?: string; roomName?: string } | null>(null);

  const loadHomeData = React.useCallback(async () => {
    try {
      setLoading(true);
      let homeId = user?.homeId;
      const allHomes = await listHomes(user?.id ?? '');
      setHomes(allHomes);
      if (!homeId && allHomes.length > 0) {
        homeId = allHomes[0].id;
      }
      if (homeId) {
        const { getHomeSummary } = await import('./src/services/apiClient');
        const [summary, sceneData, devs] = await Promise.all([
          getHomeSummary(homeId),
          getScene(homeId).catch(() => null),
          listDevices(homeId).catch(() => [] as Device[]),
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
        setDevices(devs);
      }
    } catch {
      // No data yet — that's fine
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    React.useCallback(() => {
      loadHomeData();
    }, [loadHomeData])
  );

  const fmt = (n: number, d = 1) => (n ?? 0).toFixed(d);

  // Derive rooms from homes
  const rooms: RoomModel[] = React.useMemo(() => {
    if (homes.length > 0 && homes[0].rooms?.length > 0) {
      return homes[0].rooms as RoomModel[];
    }
    const fromDevices = [...new Set(devices.map(d => d.roomId))].filter(Boolean);
    return fromDevices.map(rid => ({
      roomId: rid,
      name: rid.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    }));
  }, [homes, devices]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Top Navigation */}
      <View style={styles.nav}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image source={require('./assets/image.png')} style={{ width: 28, height: 28, marginRight: 8, tintColor: colors.accent }} />
          <Text style={[styles.navLogo, { color: colors.accent }]}>SmartGrid</Text>
        </View>
        <View style={styles.navRight}>
          <TouchableOpacity
            style={[styles.themeToggle, { backgroundColor: 'transparent' }]}
            onPress={() => setThemeMode(isDark ? 'light' : 'dark')}
          >
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={22} color={isDark ? '#FFD54F' : '#FF9800'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={logout}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 68, 68, 0.1)',
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: 'rgba(255, 68, 68, 0.25)',
              gap: 6,
            }}
          >
            <Ionicons name="log-out-outline" size={16} color="#ff4444" />
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

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Quick Stats Bar */}
            <View style={{
              flexDirection: 'row',
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
              marginBottom: 16,
              justifyContent: 'space-around',
            }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '800' }}>
                  {stats?.deviceCount ?? 0}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>Devices</Text>
              </View>
              <View style={{ width: 1, backgroundColor: colors.border }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#FF9800', fontSize: 22, fontWeight: '800' }}>
                  {stats ? `$${fmt(stats.monthlyCost, 2)}` : '–'}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>Monthly</Text>
              </View>
              <View style={{ width: 1, backgroundColor: colors.border }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#F44336', fontSize: 22, fontWeight: '800' }}>
                  {stats ? `${fmt(stats.annualCo2, 0)}kg` : '–'}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>CO₂/yr</Text>
              </View>
            </View>

            {/* Energy Stats Cards - 2x3 Grid */}
            <View style={{
              flexDirection: 'row', flexWrap: 'wrap',
              justifyContent: 'space-between', marginBottom: 20,
            }}>
              {[
                { asset: 'devices.png', icon: 'hardware-chip-outline' as const, label: 'Devices', value: stats ? `${stats.deviceCount}` : '–', sub: 'tracked', color: colors.accent },
                { icon: 'flash-outline' as const, label: 'Annual kWh', value: stats ? `${fmt(stats.annualKwh, 0)}` : '–', sub: 'kilowatt-hours', color: '#FFB300' },
                { icon: 'wallet-outline' as const, label: 'Monthly Cost', value: stats ? `$${fmt(stats.monthlyCost, 2)}` : '–', sub: 'estimated', color: '#FF9800' },
                { icon: 'leaf-outline' as const, label: 'CO₂ / year', value: stats ? `${fmt(stats.annualCo2, 1)} kg` : '–', sub: 'carbon footprint', color: '#66BB6A' },
                { icon: 'eye-off-outline' as const, label: 'Standby Waste', value: stats ? `$${fmt(stats.standbyWaste, 2)}/yr` : '–', sub: 'ghost energy cost', color: '#AB47BC' },
                { icon: 'bar-chart-outline' as const, label: 'Annual Cost', value: stats ? `$${fmt(stats.annualCost, 2)}` : '–', sub: 'total estimate', color: '#42A5F5' },
              ].map((c, i) => (
                <View
                  key={i}
                  style={{
                    width: '48%',
                    backgroundColor: colors.card,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 16,
                    marginBottom: 12,
                  }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.color + '18', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                    {c.asset ? (
                      <Image source={require('./assets/devices.png')} style={{ width: 22, height: 22, tintColor: c.color }} />
                    ) : (
                      <Ionicons name={c.icon} size={22} color={c.color} />
                    )}
                  </View>
                  <Text style={{ color: c.color, fontSize: 22, fontWeight: '800' }}>{c.value}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4, fontWeight: '600' }}>{c.label}</Text>
                  <Text style={{ color: isDark ? '#444' : '#aaa', fontSize: 10, marginTop: 2 }}>{c.sub}</Text>
                </View>
              ))}
            </View>

            {/* 3D Home Section — matches your 2D floor plan (Bedroom, Kitchen, Bathroom, Living, Dining) */}
            <View style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
                  <Ionicons name="home-outline" size={18} color={colors.accent} /> Your Home
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {devices.length} device{devices.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 8 }}>
                Drag to rotate · Pinch to zoom · Tap a device for power & environmental impact
              </Text>

              <House3DViewer
                devices={devices.map(d => ({
                  category: d.category,
                  label: d.label,
                  roomId: d.roomId,
                }))}
                rooms={rooms.map(r => ({ roomId: r.roomId, name: r.name }))}
                height={devices.length > 0 ? 420 : 340}
                isDark={isDark}
                onDevicePress={(dev) => {
                  const matched = devices.find(d => d.label === dev.label || d.category === dev.category);
                  if (matched) {
                    setTappedDevice({ label: matched.label, category: matched.category, roomId: matched.roomId, roomName: dev.roomName });
                  } else {
                    setTappedDevice(dev);
                  }
                }}
              />
            </View>

            {/* My Devices with 3D Models */}
            {devices.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>
                  <Ionicons name="flash-outline" size={18} color={colors.accent} /> My Devices
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {devices.map(device => (
                    <View
                      key={device.id}
                      style={{
                        backgroundColor: colors.card,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: colors.border,
                        padding: 14,
                        marginRight: 12,
                        alignItems: 'center',
                        width: 120,
                      }}
                    >
                      <Appliance3DModel
                        category={device.category}
                        size={80}
                        showLabel={false}
                      />
                      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'center' }} numberOfLines={1}>
                        {device.label || device.category}
                      </Text>
                      <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '600', marginTop: 3 }}>
                        {device.power?.active_watts_typical ?? '?'}W
                      </Text>
                      {device.power?.standby_watts_typical > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                          <Image source={require('./assets/ghost.png')} style={{ width: 10, height: 10, tintColor: '#FF9800' }} resizeMode="contain" />
                          <Text style={{ color: '#FF9800', fontSize: 9, marginLeft: 3 }}>
                            {device.power.standby_watts_typical}W standby
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Quick Tips */}
            <View style={{
              backgroundColor: isDark ? 'rgba(76,175,80,0.08)' : '#E8F5E9',
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(76,175,80,0.2)' : '#C8E6C9',
              marginBottom: 16,
            }}>
              <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700', marginBottom: 8 }}>
                <Ionicons name="bulb-outline" size={14} color={colors.accent} /> Energy Tip
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                {stats && stats.standbyWaste > 3
                  ? `Your appliances waste $${fmt(stats.standbyWaste, 2)}/yr in standby. Unplug devices when not in use or use smart power strips!`
                  : 'Scan more appliances to get personalized energy-saving tips.'}
              </Text>
            </View>
          </>
        )}

        <Text style={[styles.footnote, { color: isDark ? '#444' : '#bbb' }]}>
          Power data based on Berkeley Lab and ENERGY STAR research
        </Text>
      </ScrollView>

      {/* Device Detail Modal */}
      <Modal
        visible={tappedDevice !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setTappedDevice(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setTappedDevice(null)}
        >
          <View style={{
            backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 40,
          }}>
            <View style={{ width: 40, height: 4, backgroundColor: isDark ? '#444' : '#ddd', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            {tappedDevice && (() => {
              const matchedDev = devices.find(d => d.label === tappedDevice.label || d.category === tappedDevice.category);
              const power = matchedDev?.power;

              return (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                    <Appliance3DModel category={tappedDevice.category} size={48} showLabel={false} />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{tappedDevice.label || tappedDevice.category}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>{tappedDevice.roomName || tappedDevice.roomId || 'Unknown room'}</Text>
                    </View>
                  </View>

                  {power && (
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                      <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(76,175,80,0.1)' : '#E8F5E9', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                        <Text style={{ color: colors.accent, fontSize: 24, fontWeight: '800' }}>{power.active_watts_typical}W</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>Active</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(255,152,0,0.1)' : '#FFF3E0', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                        <Text style={{ color: '#FF9800', fontSize: 24, fontWeight: '800' }}>{power.standby_watts_typical}W</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>Standby</Text>
                      </View>
                    </View>
                  )}

                  {power && (
                    <View style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f5f5f5', borderRadius: 12, padding: 14 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Monthly cost</Text>
                        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>${((power.active_watts_typical * 4 + power.standby_watts_typical * 20) * 30 * 0.30 / 1000).toFixed(2)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Annual cost</Text>
                        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>${((power.active_watts_typical * 4 + power.standby_watts_typical * 20) * 365 * 0.30 / 1000).toFixed(2)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Standby waste/yr</Text>
                        <Text style={{ color: '#FF9800', fontSize: 12, fontWeight: '600' }}>${(power.standby_watts_typical * 24 * 365 * 0.30 / 1000).toFixed(2)}</Text>
                      </View>
                    </View>
                  )}

                  <TouchableOpacity
                    style={{ backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 }}
                    onPress={() => setTappedDevice(null)}
                  >
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Close</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Modal>
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
  hero: { alignItems: 'center', marginTop: 16, marginBottom: 20 },
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
