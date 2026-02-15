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
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import {
  addDevice, listHomes, Home, listCategories, CategoryInfo, RoomModel,
  researchDevice, ResearchResult, ResearchAlternative,
} from '../services/apiClient';
import { identifyBrand } from '../services/apiService';
import { useAuth } from '../context/AuthContext';
import { Appliance3DModel } from '../components/Appliance3DModel';
import { log } from '../utils/logger';

const { width: SCREEN_W } = Dimensions.get('window');

// Device icons
const CATEGORY_ICONS: Record<string, string> = {
  'Television': 'tv-outline', 'TV': 'tv-outline', 'Laptop': 'laptop-outline', 'Monitor': 'desktop-outline',
  'Microwave': 'restaurant-outline', 'Oven': 'flame-outline', 'Toaster': 'cafe-outline',
  'Refrigerator': 'snow-outline', 'Fridge': 'snow-outline', 'Hair Dryer': 'cut-outline',
  'Phone Charger': 'battery-charging-outline', 'Clock': 'time-outline', 'Computer Peripheral': 'hardware-chip-outline',
  'Washing Machine': 'water-outline', 'Dryer': 'water-outline', 'Air Conditioner': 'snow-outline',
  'Space Heater': 'flame-outline', 'Light Bulb': 'bulb-outline', 'Lamp': 'bulb-outline',
  'Dishwasher': 'restaurant-outline', 'Gaming Console': 'game-controller-outline', 'Router': 'wifi-outline',
  'Fan': 'sync-outline', 'Water Heater': 'water-outline', 'Remote / Standby Device': 'radio-button-on-outline',
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
  angleUris?: string[];
  onBack: () => void;
  onDeviceAdded: (homeId: string, device: any, rooms: any[]) => void;
}

export function ScanConfirmScreen({ scanData, imageUri, angleUris, onBack, onDeviceAdded }: Props) {
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
  const [deviceBrand, setDeviceBrand] = useState(scanData.detected_appliance?.brand || '');
  const [deviceModel, setDeviceModel] = useState(scanData.detected_appliance?.model || '');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [researchData, setResearchData] = useState<ResearchResult | null>(null);
  const [researching, setResearching] = useState(false);
  const [researchVersion, setResearchVersion] = useState(0);
  const [recalculating, setRecalculating] = useState(false);
  const originalCategory = useRef(scanData.candidates[0]?.category ?? null);

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
      const brand = deviceBrand && deviceBrand !== 'Unknown' ? deviceBrand : scanData.detected_appliance?.brand;
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

  // Research device power specs when brand/model/category are known
  useEffect(() => {
    const brand = deviceBrand && deviceBrand !== 'Unknown' ? deviceBrand : '';
    const model = deviceModel && deviceModel !== 'Unknown' ? deviceModel : '';
    const cat = selectedCategory || '';
    if (!cat) return;
    // Need at least a brand/model or a manual recalculate trigger
    if (!brand && !model && researchVersion === 0) return;

    let cancelled = false;
    setResearching(true);
    log.scan('Research started for scanned device', { brand: brand || 'Unknown', model: model || 'Unknown', category: cat });
    researchDevice(brand || 'Unknown', model || 'Unknown', cat)
      .then(result => {
        if (!cancelled) {
          setResearchData(result);
          log.scan('Research completed for scanned device', {
            hasProfile: !!result.power_profile,
            source: result.power_profile?.source,
            alternativesCount: result.alternatives.length,
          });
        }
      })
      .catch(err => { log.error('scan', 'Research failed for scanned device', err); })
      .finally(() => { if (!cancelled) setResearching(false); });
    return () => { cancelled = true; };
  }, [deviceBrand, deviceModel, selectedCategory, researchVersion]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return allCategories;
    const q = searchQuery.toLowerCase();
    return allCategories.filter(c => c.category.toLowerCase().includes(q));
  }, [searchQuery, allCategories]);

  const handleConfirm = async () => {
    if (!selectedCategory || !selectedHomeId) return;
    setAdding(true);
    setError(null);
    log.scan('Confirm device pressed', { category: selectedCategory, homeId: selectedHomeId, room: selectedRoom });

    try {
      // Prefer researched power data over category defaults
      const rp = researchData?.power_profile;
      const pp = rp || scanData.power_profile?.profile;
      const newDevice = await addDevice(selectedHomeId, {
        roomId: selectedRoom,
        label: deviceLabel || selectedCategory,
        brand: deviceBrand || 'Unknown',
        model: deviceModel || 'Unknown',
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
      log.scan('Device confirmed and added', { category: selectedCategory, label: deviceLabel });
      setTimeout(() => onDeviceAdded(selectedHomeId, newDevice, rooms), 1200);
    } catch (e: unknown) {
      log.error('scan', 'Confirm device failed', e);
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
            {/* Only show bbox on full-frame images (not cropped multi-angle images) */}
            {scanData.bbox && !angleUris?.length && (
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
              <Ionicons name="document-text-outline" size={11} color={colors.textSecondary} /> Text detected: {scanData.ocr_texts.slice(0, 3).join(', ')}
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
                <Ionicons name="checkmark" size={18} color={colors.accent} style={styles.checkmark} />
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
            {showSearch ? '▲ Hide search' : ''}
            {!showSearch && <Ionicons name="search-outline" size={14} color={colors.accent} />}
            {!showSearch && ' Not in the list? Search...'}
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
                    <Ionicons name="checkmark" size={18} color={colors.accent} style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Device info inputs */}
        {selectedCategory && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>
              Device Name
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

            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>
              Brand
            </Text>
            <TextInput
              style={[styles.labelInput, {
                backgroundColor: isDark ? '#1a1a2a' : '#f0f0f0',
                color: colors.text,
                borderColor: colors.border,
              }]}
              value={deviceBrand}
              onChangeText={setDeviceBrand}
              placeholder="e.g., Samsung"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>
              Model
            </Text>
            <TextInput
              style={[styles.labelInput, {
                backgroundColor: isDark ? '#1a1a2a' : '#f0f0f0',
                color: colors.text,
                borderColor: colors.border,
              }]}
              value={deviceModel}
              onChangeText={setDeviceModel}
              placeholder="e.g., QN55Q80B"
              placeholderTextColor={colors.textSecondary}
            />

            {/* Recalculate button — shown when category changed from original */}
            {selectedCategory !== originalCategory.current && (
              <TouchableOpacity
                style={[styles.recalcButton, {
                  backgroundColor: recalculating ? colors.border : colors.accent,
                }]}
                onPress={async () => {
                  if (!selectedCategory) return;
                  setRecalculating(true);
                  setResearchData(null);
                  try {
                    if (angleUris && angleUris.length > 0) {
                      log.scan('Recalculating brand for new category', { category: selectedCategory, images: angleUris.length });
                      const result = await identifyBrand(angleUris, selectedCategory);
                      const newBrand = result.brand && result.brand !== 'Unknown' ? result.brand : '';
                      const newModel = result.model && result.model !== 'Unknown' ? result.model : '';
                      setDeviceBrand(newBrand);
                      setDeviceModel(newModel);
                      log.scan('Recalculate result', { brand: newBrand, model: newModel });
                    } else {
                      // No angle images — just clear brand/model and re-research by category
                      setDeviceBrand('');
                      setDeviceModel('');
                    }
                    setResearchVersion((v) => v + 1);
                  } catch (e) {
                    log.error('scan', 'Recalculate failed', e);
                    setDeviceBrand('');
                    setDeviceModel('');
                    setResearchVersion((v) => v + 1);
                  } finally {
                    setRecalculating(false);
                  }
                }}
                disabled={recalculating}
              >
                {recalculating ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.recalcButtonText}>Identifying...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={16} color="#fff" />
                    <Text style={styles.recalcButtonText}>Re-identify as {selectedCategory}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
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
                      <Ionicons name="home-outline" size={13} color={selectedHomeId === h.id ? '#fff' : colors.text} /> {h.name}
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
        {selectedCategory && (scanData.power_profile?.profile || researchData?.power_profile) && (() => {
          const rp = researchData?.power_profile;
          const pp = rp || scanData.power_profile?.profile;
          if (!pp) return null;
          return (
            <View style={[styles.powerPreview, { backgroundColor: isDark ? '#111122' : '#f0f4ff' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.powerTitle, { color: colors.text, marginBottom: 0 }]}>
                  <Ionicons name="flash-outline" size={14} color={colors.accent} /> Power Estimate
                </Text>
                {rp && (
                  <View style={{ backgroundColor: '#4CAF50', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                      {rp.source === 'energystar_api' ? 'ENERGY STAR' : 'Researched'}
                    </Text>
                  </View>
                )}
                {researching && !rp && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Researching...</Text>
                  </View>
                )}
              </View>
              <View style={[styles.powerRow, { marginTop: 10 }]}>
                <View style={styles.powerStat}>
                  <Text style={[styles.powerValue, { color: colors.accent }]}>
                    {pp.active_watts_typical}W
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Active</Text>
                </View>
                <View style={styles.powerStat}>
                  <Text style={[styles.powerValue, { color: '#FF9800' }]}>
                    {pp.standby_watts_typical}W
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Standby</Text>
                </View>
                <View style={styles.powerStat}>
                  <Text style={[styles.powerValue, { color: colors.textSecondary }]}>
                    {Math.round(pp.confidence * 100)}%
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Confidence</Text>
                </View>
              </View>
            </View>
          );
        })()}

        {/* Research alternatives preview */}
        {researchData && researchData.alternatives.length > 0 && (
          <View style={[styles.powerPreview, { backgroundColor: isDark ? '#0d1a0d' : '#f0fff0', marginTop: 12 }]}>
            <Text style={[styles.powerTitle, { color: colors.text }]}>
              <Ionicons name="leaf-outline" size={14} color="#4CAF50" /> Efficient Alternatives
            </Text>
            {researchData.alternatives.slice(0, 2).map((alt, i) => (
              <View key={i} style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0,
                borderTopColor: isDark ? '#1a2a1a' : '#ddeedd',
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                    {alt.brand} {alt.model}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                    {alt.active_watts_typical}W active
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: '#4CAF50', fontSize: 13, fontWeight: '700' }}>
                    Save ${alt.annual_savings_dollars}/yr
                  </Text>
                  {alt.energy_star_certified && (
                    <Text style={{ color: '#2196F3', fontSize: 10, fontWeight: '600' }}>ENERGY STAR</Text>
                  )}
                </View>
              </View>
            ))}
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
                <Ionicons name="checkmark" size={16} color="#fff" /> Add {selectedCategory} to Home
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
  recalcButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 12, paddingVertical: 10, borderRadius: 8,
  },
  recalcButtonText: {
    color: '#fff', fontSize: 14, fontWeight: '600',
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
