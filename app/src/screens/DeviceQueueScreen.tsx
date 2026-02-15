/**
 * DeviceQueueScreen — Review queued devices before batch processing.
 *
 * Shows all devices captured via AdvancedScanScreen (Basic or Scan Room mode).
 * User can review thumbnails, edit category labels, remove items, and then
 * "Process All" to run brand identification on each device before navigating
 * to the stacked ScanConfirm flow.
 */

import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useScanQueue } from '../context/ScanQueueContext';
import { identifyBrand } from '../services/apiService';
import { QueuedDevice } from '../utils/scannerTypes';

const { width: SCREEN_W } = Dimensions.get('window');
const THUMB_SIZE = (SCREEN_W - 48 - 12 - 80) / 4; // 4 thumbs in a row, minus padding

interface DeviceQueueScreenProps {
  onBack: () => void;
  onProcessComplete: (queue: QueuedDevice[]) => void;
}

export function DeviceQueueScreen({ onBack, onProcessComplete }: DeviceQueueScreenProps) {
  const { colors, isDark } = useTheme();
  const { queue, removeFromQueue, updateInQueue, clearQueue } = useScanQueue();

  const [processing, setProcessing] = useState(false);
  const [processIndex, setProcessIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = useCallback((id: string) => {
    removeFromQueue(id);
  }, [removeFromQueue]);

  const handleProcessAll = useCallback(async () => {
    if (queue.length === 0) return;
    setProcessing(true);
    setError(null);

    const enriched: QueuedDevice[] = [...queue];

    for (let i = 0; i < enriched.length; i++) {
      setProcessIndex(i);
      const device = enriched[i];

      try {
        const { brand, model } = await identifyBrand(
          device.angleImages,
          device.label,
        );

        // Merge brand/model into scanData
        const updatedScanData = {
          ...device.scanData,
          detected_appliance: {
            ...device.scanData.detected_appliance,
            brand,
            model,
          },
        };

        enriched[i] = { ...device, scanData: updatedScanData };
        updateInQueue(device.id, { scanData: updatedScanData });
      } catch (err) {
        // Non-fatal — continue with Unknown brand/model
        console.warn(`[DeviceQueue] Brand identification failed for device ${i}:`, err);
      }
    }

    setProcessing(false);
    setProcessIndex(-1);
    onProcessComplete(enriched);
  }, [queue, updateInQueue, onProcessComplete]);

  const handleClearAll = useCallback(() => {
    Alert.alert(
      'Clear Queue',
      `Remove all ${queue.length} device${queue.length !== 1 ? 's' : ''} from the queue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => clearQueue() },
      ],
    );
  }, [queue.length, clearQueue]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Review Devices</Text>
          <Text style={[styles.headerCount, { color: colors.textSecondary }]}>
            {queue.length} device{queue.length !== 1 ? 's' : ''}
          </Text>
        </View>
        {queue.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn}>
            <Text style={{ color: '#F44336', fontSize: 13, fontWeight: '600' }}>Clear</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 50 }} />
        )}
      </View>

      {/* Processing overlay */}
      {processing && (
        <View style={[styles.processingOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)' }]}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.processingText, { color: colors.text }]}>
            Identifying {processIndex + 1} of {queue.length}...
          </Text>
          <Text style={[styles.processingSubtext, { color: colors.textSecondary }]}>
            {queue[processIndex]?.label ?? 'Device'}
          </Text>
        </View>
      )}

      {/* Empty state */}
      {queue.length === 0 && !processing && (
        <View style={styles.emptyContainer}>
          <Ionicons name="scan-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No devices in queue
          </Text>
          <Text style={[styles.emptySubtext, { color: isDark ? '#555' : '#aaa' }]}>
            Go back to the camera and scan some devices
          </Text>
          <TouchableOpacity
            style={[styles.emptyBackBtn, { backgroundColor: colors.accent }]}
            onPress={onBack}
          >
            <Ionicons name="camera-outline" size={18} color="#fff" />
            <Text style={styles.emptyBackText}>Back to Camera</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Device list */}
      {queue.length > 0 && (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {queue.map((device, index) => (
            <DeviceCard
              key={device.id}
              device={device}
              index={index}
              colors={colors}
              isDark={isDark}
              onRemove={handleRemove}
              isProcessing={processing && processIndex === index}
            />
          ))}
        </ScrollView>
      )}

      {/* Error */}
      {error && (
        <View style={[styles.errorBar, { backgroundColor: 'rgba(244,67,54,0.1)' }]}>
          <Text style={{ color: '#F44336', fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {/* Bottom bar */}
      {queue.length > 0 && !processing && (
        <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.processBtn, { backgroundColor: colors.accent }]}
            onPress={handleProcessAll}
          >
            <Ionicons name="flash-outline" size={20} color="#fff" />
            <Text style={styles.processBtnText}>
              Process All ({queue.length})
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Device Card
// ---------------------------------------------------------------------------

interface DeviceCardProps {
  device: QueuedDevice;
  index: number;
  colors: any;
  isDark: boolean;
  onRemove: (id: string) => void;
  isProcessing: boolean;
}

function DeviceCard({ device, index, colors, isDark, onRemove, isProcessing }: DeviceCardProps) {
  return (
    <View style={[
      styles.card,
      {
        backgroundColor: colors.card,
        borderColor: isProcessing ? colors.accent : colors.border,
        borderWidth: isProcessing ? 2 : 1,
      },
    ]}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <View style={[styles.indexBadge, { backgroundColor: colors.accent + '22' }]}>
            <Text style={[styles.indexText, { color: colors.accent }]}>{index + 1}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[styles.cardLabel, { color: colors.text }]} numberOfLines={1}>
              {device.label}
            </Text>
            <View style={styles.confRow}>
              <View style={[styles.confBadge, {
                backgroundColor: device.confidence > 0.5 ? '#4CAF50' : device.confidence > 0.2 ? '#FF9800' : '#666',
              }]}>
                <Text style={styles.confText}>
                  {Math.round(device.confidence * 100)}%
                </Text>
              </View>
              {device.scanData?.detected_appliance?.brand &&
                device.scanData.detected_appliance.brand !== 'Unknown' && (
                <Text style={[styles.brandText, { color: colors.textSecondary }]}>
                  {device.scanData.detected_appliance.brand} {device.scanData.detected_appliance.model}
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={() => onRemove(device.id)}
            style={[styles.removeBtn, { backgroundColor: 'rgba(244,67,54,0.1)' }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color="#F44336" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Thumbnail grid */}
      <View style={styles.thumbRow}>
        {device.angleImages.map((uri, i) => (
          <View
            key={i}
            style={[styles.thumb, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0' }]}
          >
            <Image
              source={{ uri }}
              style={styles.thumbImage}
              resizeMode="cover"
            />
            <View style={[styles.thumbBadge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
              <Text style={styles.thumbBadgeText}>{i + 1}</Text>
            </View>
          </View>
        ))}
        {/* Placeholder for missing angles */}
        {Array.from({ length: Math.max(0, 4 - device.angleImages.length) }).map((_, i) => (
          <View
            key={`empty-${i}`}
            style={[styles.thumb, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0' }]}
          >
            <Ionicons name="image-outline" size={20} color={isDark ? '#444' : '#ccc'} />
          </View>
        ))}
      </View>

      {/* Processing indicator */}
      {isProcessing && (
        <View style={styles.cardProcessing}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.cardProcessingText, { color: colors.accent }]}>
            Identifying brand...
          </Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerCount: {
    fontSize: 12,
    marginTop: 2,
  },
  clearBtn: {
    width: 50,
    alignItems: 'flex-end',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  processingSubtext: {
    fontSize: 14,
    marginTop: 6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBackText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: 14,
    paddingBottom: 10,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  confRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  confBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  confText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  brandText: {
    fontSize: 12,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 6,
  },
  thumb: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  cardProcessing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  cardProcessingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    borderRadius: 10,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopWidth: 1,
  },
  processBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
  },
  processBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
