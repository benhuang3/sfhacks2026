/**
 * MultiAngleReviewScreen — Shows captured multi-angle photos in a 2x2 grid
 * before proceeding to the ScanConfirm flow.
 * Automatically calls Gemini to identify brand/model from the angle images.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  Platform,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { identifyBrand, BrandIdentification } from '../services/apiService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 8;
const GRID_PADDING = 16;
const IMAGE_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

interface MultiAngleReviewScreenProps {
  scanData: any;
  imageUris: string[];
  onContinue: (updatedScanData: any) => void;
  onRetake: () => void;
}

export function MultiAngleReviewScreen({
  scanData,
  imageUris,
  onContinue,
  onRetake,
}: MultiAngleReviewScreenProps) {
  const category = scanData?.detected_appliance?.name ?? 'Unknown';
  const confidence = scanData?.detected_appliance?.confidence ?? 0;

  const [brandResult, setBrandResult] = useState<BrandIdentification | null>(null);
  const [identifying, setIdentifying] = useState(true);

  // Auto-identify brand on mount
  useEffect(() => {
    let cancelled = false;

    async function identify() {
      try {
        const result = await identifyBrand(imageUris, category);
        if (!cancelled) setBrandResult(result);
      } catch {
        // Fallback silently — brand stays Unknown
      } finally {
        if (!cancelled) setIdentifying(false);
      }
    }

    if (imageUris.length > 0) {
      identify();
    } else {
      setIdentifying(false);
    }

    return () => { cancelled = true; };
  }, [imageUris, category]);

  const displayBrand =
    brandResult?.brand && brandResult.brand !== 'Unknown'
      ? brandResult.brand
      : null;
  const displayModel =
    brandResult?.model && brandResult.model !== 'Unknown'
      ? brandResult.model
      : null;

  const displayName = displayBrand
    ? `${displayBrand}${displayModel ? ` ${displayModel}` : ''}`
    : category;

  function handleContinue() {
    // Merge brand identification into scanData
    const updated = {
      ...scanData,
      detected_appliance: {
        ...scanData?.detected_appliance,
        brand: brandResult?.brand ?? scanData?.detected_appliance?.brand ?? 'Unknown',
        model: brandResult?.model ?? scanData?.detected_appliance?.model ?? 'Unknown',
        name: displayBrand ? displayName : scanData?.detected_appliance?.name,
      },
    };
    onContinue(updated);
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onRetake} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>{displayName}</Text>
          <View style={styles.headerSubRow}>
            {identifying ? (
              <View style={styles.identifyingRow}>
                <ActivityIndicator size="small" color="#4CAF50" />
                <Text style={styles.identifyingText}>Identifying brand...</Text>
              </View>
            ) : (
              <Text style={styles.headerSubtitle}>
                {displayBrand ? `${category} · ` : ''}
                {Math.round(confidence * 100)}% confidence
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Image grid */}
      <View style={styles.gridContainer}>
        <Text style={styles.sectionLabel}>
          {imageUris.length} angles captured
        </Text>
        <View style={styles.grid}>
          {imageUris.map((uri, index) => (
            <View key={index} style={styles.imageWrapper}>
              <Image source={{ uri }} style={styles.image} />
              <View style={styles.angleBadge}>
                <Text style={styles.angleBadgeText}>{index + 1}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Bottom actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.retakeButton} onPress={onRetake}>
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.retakeButtonText}>Retake</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.continueButton, identifying && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={identifying}
        >
          {identifying ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.continueButtonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a12',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubRow: {
    marginTop: 2,
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 14,
  },
  identifyingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  identifyingText: {
    color: '#4CAF50',
    fontSize: 14,
  },

  // Grid
  gridContainer: {
    flex: 1,
    paddingHorizontal: GRID_PADDING,
    justifyContent: 'center',
  },
  sectionLabel: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    justifyContent: 'center',
  },
  imageWrapper: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  angleBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  angleBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Bottom actions
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 16 : 24,
    paddingTop: 12,
    gap: 12,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  retakeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  continueButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
  },
  continueButtonDisabled: {
    backgroundColor: '#2a7a2e',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
