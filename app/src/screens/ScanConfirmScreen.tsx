/**
 * ScanConfirmScreen — User confirms detected appliance category
 *
 * Shows top-3 AI guesses. User taps the correct one (or searches).
 * On confirm → adds device to selected home with the matching 3D model.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView,
  TextInput, Image, ActivityIndicator, Dimensions, Animated,
  Platform,
} from 'react-native';
import { useTheme } from '../../App';
import {
  addDevice, listHomes, Home, listCategories, CategoryInfo, RoomModel,
} from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { Appliance3DModel } from '../components/Appliance3DModel';

const { width: SCREEN_W } = Dimensions.get('window');

// Device icons
const CATEGORY_ICONS: Record<string, string> = {
  'Television': '📺', 'TV': '📺', 'Laptop': '💻', 'Monitor': '🖥️',
  'Microwave': '🍿', 'Oven': '🍳', 'Toaster': '🍞',
  'Refrigerator': '🧊', 'Fridge': '🧊', 'Hair Dryer': '💨',
  'Phone Charger': '🔌', 'Clock': '⏰', 'Computer Peripheral': '🖱️',
  'Washing Machine': '🫧', 'Dryer': '👕', 'Air Conditioner': '❄️',
  'Space Heater': '🔥', 'Light Bulb': '💡', 'Lamp': '💡',
  'Dishwasher': '🍽️', 'Gaming Console': '🎮', 'Router': '📡',
  'Fan': '🌀', 'Water Heater': '🚿', 'Remote / Standby Device': '🔘',
};

interface Candidate {
  category: string;
  confidence: number;
  modelAsset: string;
}

interface ScanData {
  candidates: Candidate[];
  bbox?: number[] | null;
  detected_appliance: {
    brand: string;
    model: string;
    name: string;
    category: string;
    confidence: number;
  };
  power_profile: any;
  ocr_texts: string[];
  filename: string;
  all_categories?: string[];
}

interface Props {
  scanData: ScanData;
  imageUri?: string | null;
  onBack: () => void;
  onDeviceAdded: (homeId: string) => void;
}

export function ScanConfirmScreen({ scanData, imageUri, onBack, onDeviceAdded }: Props) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [allCategories, setAllCategories] = useState<CategoryInfo[]>([]);
  const [homes, setHomes] = useState<Home[]>([]);
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState('r1');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  // Load homes
  useEffect(() => {
    if (user?.id) {
      listHomes(user.id).then(setHomes).catch(() => {});
    }
  }, [user?.id]);

  // Load all categories for search
  useEffect(() => {
    listCategories()
      .then(setAllCategories)
      .catch(() => {
        // Fallback
        const fallback = scanData.all_categories || [
          'Television', 'Laptop', 'Monitor', 'Microwave', 'Oven',
          'Toaster', 'Refrigerator', 'Hair Dryer', 'Phone Charger',
          'Washing Machine', 'Dryer', 'Light Bulb', 'Lamp',
          'Air Conditioner', 'Space Heater', 'Gaming Console',
          'Router', 'Fan', 'Water Heater', 'Dishwasher',
        ];
        setAllCategories(fallback.map(c => ({ category: c, modelAsset: `models/${c.toLowerCase().replace(/ /g, '_')}.glb` })));
      });
  }, []);

  // Auto-select first candidate
  useEffect(() => {
    if (scanData.candidates.length > 0 && !selectedCategory) {
      setSelectedCategory(scanData.candidates[0].category);
      setDeviceLabel(scanData.candidates[0].category);
    }
  }, [scanData.candidates]);

  // Update device label when category changes
  useEffect(() => {
    if (selectedCategory) {
      const brand = scanData.detected_appliance?.brand;
      setDeviceLabel(
        brand && brand !== 'Unknown'
          ? `${brand} ${selectedCategory}`
          : selectedCategory
      );
    }
  }, [selectedCategory]);

  // Auto-select first home
  useEffect(() => {
    if (homes.length > 0 && !selectedHomeId) {
      setSelectedHomeId(homes[0].id);
    }
  }, [homes]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return allCategories;
    const q = searchQuery.toLowerCase();
    return allCategories.filter(c => c.category.toLowerCase().includes(q));
  }, [searchQuery, allCategories]);

  const handleConfirm = async () => {
    if (!selectedCategory || !selectedHomeId) return;
    setAdding(true);
    setError(null);

    try {
      const pp = scanData.power_profile?.profile;
      await addDevice(selectedHomeId, {
        roomId: selectedRoom,
        label: deviceLabel || selectedCategory,
        brand: scanData.detected_appliance?.brand || 'Unknown',
        model: scanData.detected_appliance?.model || 'Unknown',
        category: selectedCategory,
        power: pp ? {
          standby_watts_typical: pp.standby_watts_typical,
          standby_watts_range: pp.standby_watts_range,
          active_watts_typical: pp.active_watts_typical,
          active_watts_range: pp.active_watts_range,
          source: pp.source || 'category_estimate',
          confidence: pp.confidence || 0.5,
        } : undefined,
      });
      setAdded(true);
      setTimeout(() => onDeviceAdded(selectedHomeId), 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add device');
    } finally {
      setAdding(false);
    }
  };

  // Rooms from the selected home (structured RoomModel objects)
  const rooms: RoomModel[] = useMemo(() => {
    const h = homes.find(h => h.id === selectedHomeId);
    if (h?.rooms && h.rooms.length > 0) {
      return h.rooms as RoomModel[];
    }
    // Fallback
    return [
      { roomId: 'r1', name: 'Living Room' },
      { roomId: 'r2', name: 'Bedroom' },
      { roomId: 'r3', name: 'Kitchen' },
      { roomId: 'r4', name: 'Bathroom' },
      { roomId: 'r5', name: 'Office' },
    ];
  }, [homes, selectedHomeId]);

  if (added) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.successContainer}>
          <Appliance3DModel category={selectedCategory || ''} size={80} showLabel={false} />
          <Text style={[styles.successText, { color: colors.text, marginTop: 12 }]}>
            {selectedCategory} added to your home!
          </Text>
          <Text style={[styles.successSub, { color: colors.textSecondary }]}>
            Opening 3D home view...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.bg, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={{ color: colors.accent, fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Confirm Appliance</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Image preview */}
        {imageUri && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageUri }}
              style={styles.previewImage}
              resizeMode="cover"
            />
            {scanData.bbox && (
              <View style={[styles.bboxOverlay, {
                left: `${scanData.bbox[0] * 100}%`,
                top: `${scanData.bbox[1] * 100}%`,
                width: `${(scanData.bbox[2] - scanData.bbox[0]) * 100}%`,
                height: `${(scanData.bbox[3] - scanData.bbox[1]) * 100}%`,
              } as any]} />
            )}
          </View>
        )}

        {/* OCR detected text */}
        {scanData.ocr_texts.length > 0 && (
          <View style={[styles.ocrBanner, { backgroundColor: isDark ? '#1a1a2e' : '#e8e8f4' }]}>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
              📝 Text detected: {scanData.ocr_texts.slice(0, 3).join(', ')}
            </Text>
          </View>
        )}

        {/* Top-3 Candidates */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          We detected:
        </Text>

        <View style={styles.candidatesRow}>
          {scanData.candidates.map((c, i) => (
            <TouchableOpacity
              key={c.category}
              style={[
                styles.candidateCard,
                {
                  backgroundColor: selectedCategory === c.category
                    ? (isDark ? '#1a3a1a' : '#e6f7e6')
                    : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'),
                  borderColor: selectedCategory === c.category
                    ? colors.accent : (isDark ? '#333' : '#ddd'),
                  borderWidth: selectedCategory === c.category ? 2 : 1,
                },
              ]}
              onPress={() => setSelectedCategory(c.category)}
            >
              <View style={styles.candidateIcon}>
                <Appliance3DModel category={c.category} size={42} showLabel={false} />
              </View>
              <Text style={[styles.candidateName, { color: colors.text }]} numberOfLines={1}>
                {c.category}
              </Text>
              <View style={[styles.confBadge, {
                backgroundColor: c.confidence > 0.5 ? '#4CAF50' : c.confidence > 0.2 ? '#FF9800' : '#666',
              }]}>
                <Text style={styles.confText}>
                  {Math.round(c.confidence * 100)}%
                </Text>
              </View>
              {selectedCategory === c.category && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Search for other categories */}
        <TouchableOpacity
          style={[styles.searchToggle, { borderColor: colors.border }]}
          onPress={() => setShowSearch(!showSearch)}
        >
          <Text style={{ color: colors.accent, fontWeight: '600' }}>
            {showSearch ? '▲ Hide search' : '🔍 Not in the list? Search...'}
          </Text>
        </TouchableOpacity>

        {showSearch && (
          <View style={styles.searchSection}>
            <TextInput
              style={[styles.searchInput, {
                backgroundColor: isDark ? '#1a1a2a' : '#f0f0f0',
                color: colors.text,
                borderColor: colors.border,
              }]}
              placeholder="Search appliance type..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            <ScrollView style={styles.searchResults} nestedScrollEnabled>
              {filteredCategories.map(c => (
                <TouchableOpacity
                  key={c.category}
                  style={[styles.searchItem, {
                    backgroundColor: selectedCategory === c.category
                      ? (isDark ? '#1a3a1a' : '#e6f7e6') : 'transparent',
                  }]}
                  onPress={() => {
                    setSelectedCategory(c.category);
                    setShowSearch(false);
                    setSearchQuery('');
                  }}
                >
                  <View style={{ marginRight: 8 }}>
                    <Appliance3DModel category={c.category} size={28} showLabel={false} />
                  </View>
                  <Text style={[styles.searchItemText, { color: colors.text }]}>
                    {c.category}
                  </Text>
                  {selectedCategory === c.category && (
                    <Text style={{ color: colors.accent, marginLeft: 'auto' }}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Device label input */}
        {selectedCategory && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>
              Device Label
            </Text>
            <TextInput
              style={[styles.labelInput, {
                backgroundColor: isDark ? '#1a1a2a' : '#f0f0f0',
                color: colors.text,
                borderColor: colors.border,
              }]}
              value={deviceLabel}
              onChangeText={setDeviceLabel}
              placeholder="e.g., Living Room TV"
              placeholderTextColor={colors.textSecondary}
            />
          </>
        )}

        {/* Home & Room selection */}
        {selectedCategory && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>
              Add to Home
            </Text>

            {homes.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 12 }}>
                No homes yet. One will be created automatically.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.homePicker}>
                {homes.map(h => (
                  <TouchableOpacity
                    key={h.id}
                    style={[styles.homeChip, {
                      backgroundColor: selectedHomeId === h.id
                        ? colors.accent : (isDark ? '#222' : '#eee'),
                    }]}
                    onPress={() => setSelectedHomeId(h.id)}
                  >
                    <Text style={{
                      color: selectedHomeId === h.id ? '#fff' : colors.text,
                      fontWeight: '600', fontSize: 13,
                    }}>
                      🏠 {h.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 12 }]}>
              Room
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roomPicker}>
              {rooms.map(r => (
                <TouchableOpacity
                  key={r.roomId}
                  style={[styles.roomChip, {
                    backgroundColor: selectedRoom === r.roomId
                      ? colors.accent : (isDark ? '#222' : '#eee'),
                  }]}
                  onPress={() => setSelectedRoom(r.roomId)}
                >
                  <Text style={{
                    color: selectedRoom === r.roomId ? '#fff' : colors.text,
                    fontWeight: '600', fontSize: 12,
                  }}>
                    {r.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Power profile preview */}
        {selectedCategory && scanData.power_profile?.profile && (
          <View style={[styles.powerPreview, { backgroundColor: isDark ? '#111122' : '#f0f4ff' }]}>
            <Text style={[styles.powerTitle, { color: colors.text }]}>⚡ Power Estimate</Text>
            <View style={styles.powerRow}>
              <View style={styles.powerStat}>
                <Text style={[styles.powerValue, { color: colors.accent }]}>
                  {scanData.power_profile.profile.active_watts_typical}W
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Active</Text>
              </View>
              <View style={styles.powerStat}>
                <Text style={[styles.powerValue, { color: '#FF9800' }]}>
                  {scanData.power_profile.profile.standby_watts_typical}W
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Standby</Text>
              </View>
              <View style={styles.powerStat}>
                <Text style={[styles.powerValue, { color: colors.textSecondary }]}>
                  {Math.round(scanData.power_profile.profile.confidence * 100)}%
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Confidence</Text>
              </View>
            </View>
          </View>
        )}

        {error && (
          <Text style={[styles.errorText, { color: '#f44336' }]}>{error}</Text>
        )}

        {/* Spacer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Confirm Button (sticky bottom) */}
      {selectedCategory && (
        <View style={[styles.bottomBar, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: colors.accent, opacity: adding ? 0.6 : 1 }]}
            onPress={handleConfirm}
            disabled={adding}
          >
            {adding ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmText}>
                ✓ Add {selectedCategory} to Home
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'web' ? 16 : 50,
    paddingBottom: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 60 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  content: { flex: 1 },
  scrollContent: { padding: 16 },
  imageContainer: {
    width: '100%', height: 200, borderRadius: 12, overflow: 'hidden',
    marginBottom: 16, position: 'relative',
  },
  previewImage: { width: '100%', height: '100%' },
  bboxOverlay: {
    position: 'absolute', borderWidth: 2, borderColor: '#4CAF50',
    borderRadius: 4, backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  ocrBanner: {
    padding: 8, borderRadius: 8, marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  candidatesRow: {
    flexDirection: 'row', gap: 10, marginBottom: 16,
    ...(Platform.OS === 'web' ? { flexWrap: 'wrap' } : {}),
  },
  candidateCard: {
    flex: 1, minWidth: 90, padding: 14, borderRadius: 12,
    alignItems: 'center', position: 'relative',
  },
  candidateIcon: { marginBottom: 8, alignItems: 'center' },
  candidateName: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  confBadge: {
    marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  confText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  checkmark: {
    position: 'absolute', top: 6, right: 8,
    color: '#4CAF50', fontSize: 18, fontWeight: '900',
  },
  searchToggle: {
    padding: 12, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', marginBottom: 12,
  },
  searchSection: { marginBottom: 12 },
  searchInput: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, fontSize: 14, marginBottom: 8,
  },
  searchResults: { maxHeight: 200 },
  searchItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 10, borderRadius: 8,
  },
  searchItemText: { fontSize: 14, fontWeight: '500' },
  labelInput: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, fontSize: 14,
  },
  homePicker: { marginBottom: 8 },
  homeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    marginRight: 8,
  },
  roomPicker: { marginBottom: 8 },
  roomChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    marginRight: 8,
  },
  powerPreview: {
    padding: 14, borderRadius: 12, marginTop: 16,
  },
  powerTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  powerRow: { flexDirection: 'row', justifyContent: 'space-around' },
  powerStat: { alignItems: 'center' },
  powerValue: { fontSize: 20, fontWeight: '800' },
  errorText: { fontSize: 13, marginTop: 8, textAlign: 'center' },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth: 1,
  },
  confirmBtn: {
    paddingVertical: 14, borderRadius: 12, alignItems: 'center',
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  successContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  successIcon: { fontSize: 60, marginBottom: 16 },
  successText: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  successSub: { fontSize: 14 },
});
