import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useScannerStore } from '../store/scannerStore';
import { TrackedObject } from '../utils/scannerTypes';
import { getDisplayName } from '../utils/applianceClasses';
import { useTheme } from '../../App';

interface ScanResultScreenProps {
  onBack: () => void;
}


export function ScanResultScreen({ onBack }: ScanResultScreenProps) {
  const { confirmedProducts, clearScan } = useScannerStore();
  const { colors } = useTheme();

  const renderItem = ({ item }: { item: TrackedObject }) => {
    const lookup = item.productInfo?.lookup;
    const power = item.productInfo?.powerProfile;
    const name = item.productInfo?.displayName || getDisplayName(item.label);

    return (
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{name}</Text>
        {lookup && (
          <View style={styles.cardStats}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.accent }]}>{lookup.brand}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Brand</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.accent }]}>{lookup.model}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Model</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.accent }]}>{lookup.region}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Region</Text>
            </View>
          </View>
        )}
        {power ? (
          <View style={[styles.powerSection, { borderTopColor: colors.border }]}>
            <Text style={styles.powerTitle}>Power Profile</Text>
            <View style={styles.cardStats}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{power.active_watts_typical}W</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Active</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{power.standby_watts_typical}W</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Standby</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{power.category}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Category</Text>
              </View>
            </View>
            <Text style={[styles.powerSource, { color: colors.textSecondary }]}>
              Source: {power.source} (confidence: {Math.round(power.confidence * 100)}%)
            </Text>
          </View>
        ) : (
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading power data...</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={[styles.backText, { color: colors.accent }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Scan Results</Text>
        <TouchableOpacity onPress={clearScan}>
          <Text style={styles.clearText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {confirmedProducts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.text }]}>No scanned appliances yet.</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Use the scanner to detect appliances in your home.
          </Text>
        </View>
      ) : (
        <>
          {/* Summary Card */}
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.accent }]}>
            <Text style={[styles.summaryTitle, { color: colors.accent }]}>Scanned Products</Text>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total devices:</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{confirmedProducts.length}</Text>
            </View>
          </View>

          <FlatList
            data={confirmedProducts}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  clearText: {
    color: '#f44336',
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#2a2a3e',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  summaryTitle: {
    color: '#4CAF50',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  summaryValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 2,
  },
  powerSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#3a3a4e',
  },
  powerTitle: {
    color: '#FF9800',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  powerSource: {
    color: '#888',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  loadingText: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
