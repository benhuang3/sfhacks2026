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

interface ScanResultScreenProps {
  onBack: () => void;
}


export function ScanResultScreen({ onBack }: ScanResultScreenProps) {
  const { confirmedProducts, clearScan } = useScannerStore();

  const renderItem = ({ item }: { item: TrackedObject }) => {
    const lookup = item.productInfo?.lookup;
    const name = item.productInfo?.displayName || getDisplayName(item.label);

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{name}</Text>
        {lookup && (
          <View style={styles.cardStats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{lookup.brand}</Text>
              <Text style={styles.statLabel}>Brand</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{lookup.model}</Text>
              <Text style={styles.statLabel}>Model</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{lookup.region}</Text>
              <Text style={styles.statLabel}>Region</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Scan Results</Text>
        <TouchableOpacity onPress={clearScan}>
          <Text style={styles.clearText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {confirmedProducts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No scanned appliances yet.</Text>
          <Text style={styles.emptySubtext}>
            Use the scanner to detect appliances in your home.
          </Text>
        </View>
      ) : (
        <>
          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Scanned Products</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total devices:</Text>
              <Text style={styles.summaryValue}>{confirmedProducts.length}</Text>
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
});
