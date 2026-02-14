/**
 * ActionsScreen — AI optimization proposals, execution, and audit log
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { showAlert, showConfirm } from '../utils/alert';
import {
  proposeActions,
  executeActions,
  listActions,
  revertAction,
  type ActionProposal,
  type ActionRecord,
} from '../services/apiClient';

interface ActionsScreenProps {
  homeId: string;
  onBack: () => void;
}

type Tab = 'proposals' | 'history';

function getActionIcon(type: string): string {
  const icons: Record<string, string> = {
    smart_plug: '🔌', schedule: '⏰', turn_off: '🔴',
    set_mode: '🌿', replace: '🔄', suggest_manual: '💡',
  };
  return icons[type] || '⚡';
}

function getActionLabel(type: string): string {
  const labels: Record<string, string> = {
    smart_plug: 'Smart Plug', schedule: 'Schedule Off', turn_off: 'Turn Off',
    set_mode: 'Eco Mode', replace: 'Replace Device', suggest_manual: 'Suggestion',
  };
  return labels[type] || type;
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    proposed: '#FF9800', scheduled: '#2196F3', executed: '#4CAF50',
    reverted: '#9E9E9E', failed: '#F44336',
  };
  return colors[status] || '#888';
}

export function ActionsScreen({ homeId, onBack }: ActionsScreenProps) {
  const [tab, setTab] = useState<Tab>('proposals');
  const [proposals, setProposals] = useState<ActionProposal[]>([]);
  const [history, setHistory] = useState<ActionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadProposals = useCallback(async () => {
    try {
      setLoading(true);
      const data = await proposeActions(homeId, { top_n: 8 });
      setProposals(data.proposals || []);
    } catch (err) {
      console.warn('Failed to load proposals:', err);
    } finally {
      setLoading(false);
    }
  }, [homeId]);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listActions(homeId);
      setHistory(data || []);
    } catch (err) {
      console.warn('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }, [homeId]);

  useEffect(() => {
    if (tab === 'proposals') loadProposals();
    else loadHistory();
  }, [tab, loadProposals, loadHistory]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === proposals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(proposals.map(p => p.id)));
    }
  };

  const handleExecuteSelected = async () => {
    if (selectedIds.size === 0) {
      showAlert('Select Actions', 'Select at least one action to execute.');
      return;
    }

    const hasSafetyFlags = proposals
      .filter(p => selectedIds.has(p.id))
      .some(p => p.safety_flags.length > 0);

    const message = hasSafetyFlags
      ? 'Some selected actions have safety flags. Are you sure you want to proceed?'
      : `Execute ${selectedIds.size} selected action(s)?`;

    showConfirm('Confirm Execution', message, async () => {
      try {
        setExecuting(true);
        const result = await executeActions(homeId, Array.from(selectedIds));
        const succeeded = result.execution_results.filter(r => r.status === 'executed').length;
        const failed = result.execution_results.filter(r => r.status === 'failed').length;

        showAlert(
          'Execution Complete',
          `${succeeded} succeeded, ${failed} failed.\n\nEstimated annual savings: $${result.total_savings?.total_annual_dollars_saved?.toFixed(2) ?? '0.00'}`,
        );
        setSelectedIds(new Set());
        setTab('history');
      } catch (err: unknown) {
        showAlert('Error', err instanceof Error ? err.message : 'Operation failed' || 'Execution failed');
      } finally {
        setExecuting(false);
      }
    });
  };

  const handleRevert = async (actionId: string) => {
    showConfirm('Revert Action', 'Undo this action?', async () => {
      try {
        await revertAction(homeId, actionId);
        showAlert('Reverted', 'Action has been reverted.');
        loadHistory();
      } catch (err: unknown) {
        showAlert('Error', err instanceof Error ? err.message : 'Operation failed');
      }
    });
  };

  const totalSavings = proposals
    .filter(p => selectedIds.has(p.id))
    .reduce((sum, p) => sum + p.estimated_annual_dollars_saved, 0);

  const totalCost = proposals
    .filter(p => selectedIds.has(p.id))
    .reduce((sum, p) => sum + p.estimated_cost_usd, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Optimizer</Text>
        <TouchableOpacity
          onPress={() => tab === 'proposals' ? loadProposals() : loadHistory()}
          style={styles.headerBtn}
        >
          <Text style={styles.headerBtnText}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'proposals' && styles.tabActive]}
          onPress={() => setTab('proposals')}
        >
          <Text style={[styles.tabText, tab === 'proposals' && styles.tabTextActive]}>
            🤖 Proposals
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'history' && styles.tabActive]}
          onPress={() => setTab('history')}
        >
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>
            📋 History
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#4CAF50" size="large" />
            <Text style={styles.loadingText}>
              {tab === 'proposals' ? 'AI is analyzing your devices...' : 'Loading actions...'}
            </Text>
          </View>
        )}

        {/* ===== PROPOSALS TAB ===== */}
        {!loading && tab === 'proposals' && (
          <>
            {proposals.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🤖</Text>
                <Text style={styles.emptyTitle}>No Proposals</Text>
                <Text style={styles.emptySubtitle}>
                  Add devices to your home, then the AI will suggest cost-saving actions.
                </Text>
              </View>
            ) : (
              <>
                {/* Summary bar */}
                <View style={styles.summaryBar}>
                  <View style={styles.summaryInfo}>
                    <Text style={styles.summaryLabel}>
                      {selectedIds.size}/{proposals.length} selected
                    </Text>
                    <Text style={styles.summaryValue}>
                      Save ${totalSavings.toFixed(0)}/yr · Cost ${totalCost.toFixed(0)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={selectAll} style={styles.selectAllBtn}>
                    <Text style={styles.selectAllText}>
                      {selectedIds.size === proposals.length ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Proposal cards */}
                {proposals.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.proposalCard,
                      selectedIds.has(p.id) && styles.proposalCardSelected,
                    ]}
                    onPress={() => toggleSelect(p.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.proposalHeader}>
                      <View style={styles.proposalLeft}>
                        <Text style={styles.proposalIcon}>{getActionIcon(p.action_type)}</Text>
                        <View>
                          <Text style={styles.proposalLabel}>{p.label}</Text>
                          <Text style={styles.proposalAction}>{getActionLabel(p.action_type)}</Text>
                        </View>
                      </View>
                      <View style={styles.proposalRight}>
                        <Text style={styles.proposalSaving}>
                          ${p.estimated_annual_dollars_saved.toFixed(2)}/yr
                        </Text>
                        <Text style={styles.checkbox}>
                          {selectedIds.has(p.id) ? '✅' : '⬜'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.proposalRationale}>{p.rationale}</Text>

                    <View style={styles.proposalStats}>
                      <View style={styles.pStat}>
                        <Text style={styles.pStatValue}>{p.estimated_annual_kwh_saved.toFixed(1)}</Text>
                        <Text style={styles.pStatLabel}>kWh/yr</Text>
                      </View>
                      <View style={styles.pStat}>
                        <Text style={styles.pStatValue}>{p.estimated_co2_kg_saved.toFixed(1)}</Text>
                        <Text style={styles.pStatLabel}>kg CO₂</Text>
                      </View>
                      <View style={styles.pStat}>
                        <Text style={styles.pStatValue}>${p.estimated_cost_usd.toFixed(0)}</Text>
                        <Text style={styles.pStatLabel}>Cost</Text>
                      </View>
                      <View style={styles.pStat}>
                        <Text style={styles.pStatValue}>
                          {p.payback_months > 0 ? `${p.payback_months.toFixed(0)}mo` : 'Free'}
                        </Text>
                        <Text style={styles.pStatLabel}>Payback</Text>
                      </View>
                    </View>

                    {/* Feasibility bar */}
                    <View style={styles.feasRow}>
                      <Text style={styles.feasLabel}>Feasibility</Text>
                      <View style={styles.feasTrack}>
                        <View style={[styles.feasFill, { width: `${p.feasibility_score * 100}%` }]} />
                      </View>
                      <Text style={styles.feasValue}>{(p.feasibility_score * 100).toFixed(0)}%</Text>
                    </View>

                    {/* Safety flags */}
                    {p.safety_flags.length > 0 && (
                      <View style={styles.flagsRow}>
                        {p.safety_flags.map((f, i) => (
                          <View key={i} style={styles.flagBadge}>
                            <Text style={styles.flagText}>⚠️ {f}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                ))}

                {/* Execute button */}
                <TouchableOpacity
                  style={[
                    styles.executeBtn,
                    (selectedIds.size === 0 || executing) && styles.disabledBtn,
                  ]}
                  onPress={handleExecuteSelected}
                  disabled={selectedIds.size === 0 || executing}
                >
                  {executing ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.executeBtnText}>
                      ⚡ Execute {selectedIds.size} Action{selectedIds.size !== 1 ? 's' : ''}
                      {totalSavings > 0 ? ` · Save $${totalSavings.toFixed(0)}/yr` : ''}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {/* ===== HISTORY TAB ===== */}
        {!loading && tab === 'history' && (
          <>
            {history.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>No Actions Yet</Text>
                <Text style={styles.emptySubtitle}>
                  Execute proposals to see the audit log here.
                </Text>
              </View>
            ) : (
              history.map((a) => (
                <View key={a.id} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <View style={styles.historyLeft}>
                      <Text style={styles.historyIcon}>{getActionIcon(a.action_type)}</Text>
                      <View>
                        <Text style={styles.historyLabel}>{a.label || 'Device'}</Text>
                        <Text style={styles.historyAction}>{getActionLabel(a.action_type)}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(a.status) + '22' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(a.status) }]}>
                        {a.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {a.rationale && (
                    <Text style={styles.historyRationale}>{a.rationale}</Text>
                  )}

                  <View style={styles.historyStats}>
                    <Text style={styles.historyStat}>
                      💰 ${a.estimated_savings?.dollars_per_year?.toFixed(2) ?? '–'}/yr
                    </Text>
                    <Text style={styles.historyStat}>
                      ⚡ {a.estimated_savings?.kwh_per_year?.toFixed(1) ?? '–'} kWh/yr
                    </Text>
                  </View>

                  <View style={styles.historyDates}>
                    <Text style={styles.historyDate}>
                      Created: {new Date(a.createdAt).toLocaleDateString()}
                    </Text>
                    {a.executedAt && (
                      <Text style={styles.historyDate}>
                        Executed: {new Date(a.executedAt).toLocaleDateString()}
                      </Text>
                    )}
                    {a.revertedAt && (
                      <Text style={styles.historyDate}>
                        Reverted: {new Date(a.revertedAt).toLocaleDateString()}
                      </Text>
                    )}
                  </View>

                  {a.status === 'executed' && (
                    <TouchableOpacity
                      style={styles.revertBtn}
                      onPress={() => handleRevert(a.id)}
                    >
                      <Text style={styles.revertBtnText}>↩️ Revert</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a12' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#12121a',
    borderBottomWidth: 1, borderBottomColor: '#1f1f2e',
  },
  headerBtn: { padding: 8 },
  headerBtnText: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },

  tabRow: {
    flexDirection: 'row', backgroundColor: '#12121a',
    borderBottomWidth: 1, borderBottomColor: '#1f1f2e',
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#4CAF50' },
  tabText: { color: '#666', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, maxWidth: 600, alignSelf: 'center', width: '100%' },

  loadingBox: { alignItems: 'center', paddingVertical: 60 },
  loadingText: { color: '#888', fontSize: 14, marginTop: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: '#666', fontSize: 14, textAlign: 'center' },

  // Summary bar
  summaryBar: {
    flexDirection: 'row', backgroundColor: '#12121a', borderRadius: 12,
    padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1f1f2e',
    alignItems: 'center', justifyContent: 'space-between',
  },
  summaryInfo: {},
  summaryLabel: { color: '#888', fontSize: 12 },
  summaryValue: { color: '#4CAF50', fontSize: 14, fontWeight: '700', marginTop: 2 },
  selectAllBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1f1f2e' },
  selectAllText: { color: '#4CAF50', fontSize: 12, fontWeight: '600' },

  // Proposal cards
  proposalCard: {
    backgroundColor: '#12121a', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#1f1f2e',
  },
  proposalCardSelected: { borderColor: '#4CAF50', backgroundColor: 'rgba(76, 175, 80, 0.05)' },
  proposalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  proposalLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  proposalIcon: { fontSize: 24 },
  proposalLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  proposalAction: { color: '#888', fontSize: 11, marginTop: 2 },
  proposalRight: { alignItems: 'flex-end', gap: 4 },
  proposalSaving: { color: '#4CAF50', fontSize: 16, fontWeight: '700' },
  checkbox: { fontSize: 18 },

  proposalRationale: {
    color: '#aaa', fontSize: 12, lineHeight: 18, marginBottom: 12,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#1f1f2e',
  },

  proposalStats: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  pStat: {
    flex: 1, backgroundColor: '#1a1a2e', borderRadius: 8, padding: 8, alignItems: 'center',
  },
  pStatValue: { color: '#fff', fontSize: 14, fontWeight: '700' },
  pStatLabel: { color: '#888', fontSize: 10, marginTop: 2 },

  feasRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  feasLabel: { color: '#888', fontSize: 11, width: 60 },
  feasTrack: {
    flex: 1, height: 6, backgroundColor: '#1f1f2e', borderRadius: 3, overflow: 'hidden',
  },
  feasFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 3 },
  feasValue: { color: '#888', fontSize: 11, width: 30, textAlign: 'right' },

  flagsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  flagBadge: {
    backgroundColor: 'rgba(255, 152, 0, 0.15)', paddingHorizontal: 8,
    paddingVertical: 4, borderRadius: 6,
  },
  flagText: { color: '#FF9800', fontSize: 11 },

  // Execute
  executeBtn: {
    backgroundColor: '#4CAF50', paddingVertical: 18, borderRadius: 14,
    alignItems: 'center', marginTop: 8, marginBottom: 32,
  },
  executeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabledBtn: { opacity: 0.5 },

  // History cards
  historyCard: {
    backgroundColor: '#12121a', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#1f1f2e',
  },
  historyHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  historyLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyIcon: { fontSize: 22 },
  historyLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  historyAction: { color: '#888', fontSize: 11, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800' },
  historyRationale: { color: '#aaa', fontSize: 12, lineHeight: 18, marginBottom: 8 },
  historyStats: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  historyStat: { color: '#888', fontSize: 12 },
  historyDates: { gap: 2, marginBottom: 8 },
  historyDate: { color: '#555', fontSize: 11 },
  revertBtn: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)', paddingVertical: 10,
    borderRadius: 8, alignItems: 'center', borderWidth: 1,
    borderColor: 'rgba(244, 67, 54, 0.3)',
  },
  revertBtnText: { color: '#F44336', fontSize: 13, fontWeight: '600' },
});
