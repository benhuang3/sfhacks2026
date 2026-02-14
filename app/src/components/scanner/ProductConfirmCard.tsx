import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
} from 'react-native';
import { TrackedObject, ProductInfo } from '../../utils/scannerTypes';
import { getDisplayName } from '../../utils/applianceClasses';

interface ProductConfirmCardProps {
  trackedObject: TrackedObject;
  onConfirm: (productInfo: ProductInfo) => void;
  onDismiss: () => void;
}

export function ProductConfirmCard({
  trackedObject,
  onConfirm,
  onDismiss,
}: ProductConfirmCardProps) {
  const info = trackedObject.productInfo ?? null;
  const [brand, setBrand] = useState(info?.brand || '');
  const [model, setModel] = useState(info?.model || '');

  const displayName = info?.displayName || getDisplayName(trackedObject.label);
  const lookup = info?.lookup ?? null;

  const handleConfirm = () => {
    onConfirm({
      brand: brand || 'Unknown',
      model: model || '',
      displayName: brand && model ? `${brand} ${model}` : displayName,
      confirmed: true,
      wattage: info?.wattage,
      lookup: lookup || undefined,
    });
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Product Detected</Text>
          <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
            <Text style={styles.closeText}>X</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {trackedObject.croppedImageUri && (
            <Image
              source={{ uri: trackedObject.croppedImageUri }}
              style={styles.preview}
              resizeMode="contain"
            />
          )}

          <Text style={styles.detectedAs}>
            Detected as: {getDisplayName(trackedObject.label)} ({Math.round(trackedObject.score * 100)}%)
          </Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Brand</Text>
            <TextInput
              style={styles.input}
              value={brand}
              onChangeText={setBrand}
              placeholder="Enter brand name"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Model</Text>
            <TextInput
              style={styles.input}
              value={model}
              onChangeText={setModel}
              placeholder="Enter model number"
              placeholderTextColor="#999"
            />
          </View>

          {lookup && (
            <View style={styles.energySection}>
              <Text style={styles.energyTitle}>Product Match</Text>
              <View style={styles.energyRow}>
                <Text style={styles.energyLabel}>Brand:</Text>
                <Text style={styles.energyValue}>{lookup.brand}</Text>
              </View>
              <View style={styles.energyRow}>
                <Text style={styles.energyLabel}>Model:</Text>
                <Text style={styles.energyValue}>{lookup.model}</Text>
              </View>
              <View style={styles.energyRow}>
                <Text style={styles.energyLabel}>Name:</Text>
                <Text style={styles.energyValue}>{lookup.name}</Text>
              </View>
              <View style={styles.energyRow}>
                <Text style={styles.energyLabel}>Region:</Text>
                <Text style={styles.energyValue}>{lookup.region}</Text>
              </View>
            </View>
          )}

          {info?.wattage && (
            <Text style={styles.wattageNote}>
              Detected wattage: {info.wattage}W (from label)
            </Text>
          )}
        </ScrollView>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissText}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
            <Text style={styles.confirmText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 20,
  },
  preview: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    backgroundColor: '#333',
    marginBottom: 12,
  },
  detectedAs: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 16,
  },
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    color: '#ccc',
    fontSize: 13,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#2a2a3e',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  energySection: {
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  energyTitle: {
    color: '#4CAF50',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  energyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  energyLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  energyValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  wattageNote: {
    color: '#FF9800',
    fontSize: 13,
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  dismissButton: {
    flex: 1,
    backgroundColor: '#333',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  dismissText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 2,
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
