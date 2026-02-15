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
import { useTheme } from '../../App';
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
  const { colors, isDark } = useTheme();
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
        showAlert('Error', err instanceof Error ? err.message : 'Execution failed');
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
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { color: colors.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>AI Optimizer</Text>
        <TouchableOpacity
          onPress={() => tab === 'proposals' ? loadProposals() : loadHistory()}
          style={styles.headerBtn}
        >
          <Text style={[styles.headerBtnText, { color: colors.accent }]}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, tab === 'proposals' && { borderBottomWidth: 2, borderBottomColor: colors.accent }]}
          onPress={() => setTab('proposals')}
        >
          <Text style={[styles.tabText, { color: colors.textSecondary }, tab === 'proposals' && { color: colors.text }]}>
            🤖 Proposals
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'history' && { borderBottomWidth: 2, borderBottomColor: colors.accent }]}
          onPress={() => setTab('history')}
        >
          <Text style={[styles.tabText, { color: colors.textSecondary }, tab === 'history' && { color: colors.text }]}>
            📋 History
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
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
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Proposals</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  Add devices to your home, then the AI will suggest cost-saving actions.
                </Text>
              </View>
            ) : (
              <>
                {/* Summary bar */}
                <View style={[styles.summaryBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.summaryInfo}>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                      {selectedIds.size}/{proposals.length} selected
                    </Text>
                    <Text style={[styles.summaryValue, { color: colors.accent }]}>
                      Save ${totalSavings.toFixed(0)}/yr · Cost ${totalCost.toFixed(0)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={selectAll} style={[styles.selectAllBtn, { backgroundColor: colors.border }]}>
                    <Text style={[styles.selectAllText, { color: colors.accent }]}>
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
                      { backgroundColor: colors.card, borderColor: colors.border },
                      selectedIds.has(p.id) && { borderColor: colors.accent, backgroundColor: isDark ? 'rgba(76, 175, 80, 0.05)' : 'rgba(46, 125, 50, 0.06)' },
                    ]}
                    onPress={() => toggleSelect(p.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.proposalHeader}>
                      <View style={styles.proposalLeft}>
                        <Text style={styles.proposalIcon}>{getActionIcon(p.action_type)}</Text>
                        <View>
                          <Text style={[styles.proposalLabel, { color: colors.text }]}>{p.label}</Text>
                          <Text style={[styles.proposalAction, { color: colors.textSecondary }]}>{getActionLabel(p.action_type)}</Text>
                        </View>
                      </View>
                      <View style={styles.proposalRight}>
                        <Text style={[styles.proposalSaving, { color: colors.accent }]}>
                          ${p.estimated_annual_dollars_saved.toFixed(2)}/yr
                        </Text>
                        <Text style={styles.checkbox}>
                          {selectedIds.has(p.id) ? '✅' : '⬜'}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.proposalRationale, { color: colors.textSecondary, borderTopColor: colors.border }]}>{p.rationale}</Text>

                    <View style={styles.proposalStats}>
                      <View style={[styles.pStat, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f5' }]}>
                        <Text style={[styles.pStatValue, { color: colors.text }]}>{p.estimated_annual_kwh_saved.toFixed(1)}</Text>
                        <Text style={[styles.pStatLabel, { color: colors.textSecondary }]}>kWh/yr</Text>
                      </View>
                      <View style={[styles.pStat, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f5' }]}>
                        <Text style={[styles.pStatValue, { color: colors.text }]}>{p.estimated_co2_kg_saved.toFixed(1)}</Text>
                        <Text style={[styles.pStatLabel, { color: colors.textSecondary }]}>kg CO₂</Text>
                      </View>
                      <View style={[styles.pStat, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f5' }]}>
                        <Text style={[styles.pStatValue, { color: colors.text }]}>${p.estimated_cost_usd.toFixed(0)}</Text>
                        <Text style={[styles.pStatLabel, { color: colors.textSecondary }]}>Cost</Text>
                      </View>
                      <View style={[styles.pStat, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f5' }]}>
                        <Text style={[styles.pStatValue, { color: colors.text }]}>
                          {p.payback_months > 0 ? `${p.payback_months.toFixed(0)}mo` : 'Free'}
                        </Text>
                        <Text style={[styles.pStatLabel, { color: colors.textSecondary }]}>Payback</Text>
                      </View>
                    </View>

                    {/* Feasibility bar */}
                    <View style={styles.feasRow}>
                      <Text style={[styles.feasLabel, { color: colors.textSecondary }]}>Feasibility</Text>
                      <View style={[styles.feasTrack, { backgroundColor: colors.border }]}>
                        <View style={[styles.feasFill, { width: `${p.feasibility_score * 100}%`, backgroundColor: colors.accent }]} />
                      </View>
                      <Text style={[styles.feasValue, { color: colors.textSecondary }]}>{(p.feasibility_score * 100).toFixed(0)}%</Text>
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
                    { backgroundColor: colors.accent },
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
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Actions Yet</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  Execute proposals to see the audit log here.
                </Text>
              </View>
            ) : (
              history.map((a) => (
                <View key={a.id} style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.historyHeader}>
                    <View style={styles.historyLeft}>
                      <Text style={styles.historyIcon}>{getActionIcon(a.action_type)}</Text>
                      <View>
                        <Text style={[styles.historyLabel, { color: colors.text }]}>{a.label || 'Device'}</Text>
                        <Text style={[styles.historyAction, { color: colors.textSecondary }]}>{getActionLabel(a.action_type)}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(a.status) + '22' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(a.status) }]}>
                        {a.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {a.rationale && (
                    <Text style={[styles.historyRationale, { color: colors.textSecondary }]}>{a.rationale}</Text>
                  )}

                  <View style={styles.historyStats}>
                    <Text style={[styles.historyStat, { color: colors.textSecondary }]}>
                      💰 ${a.estimated_savings?.dollars_per_year?.toFixed(2) ?? '–'}/yr
                    </Text>
                    <Text style={[styles.historyStat, { color: colors.textSecondary }]}>
                      ⚡ {a.estimated_savings?.kwh_per_year?.toFixed(1) ?? '–'} kWh/yr
                    </Text>
                  </View>

                  <View style={styles.historyDates}>
                    <Text style={[styles.historyDate, { color: colors.textSecondary }]}>
                      Created: {new Date(a.createdAt).toLocaleDateString()}
                    </Text>
                    {a.executedAt && (
                      <Text style={[styles.historyDate, { color: colors.textSecondary }]}>
                        Executed: {new Date(a.executedAt).toLocaleDateString()}
                      </Text>
                    )}
                    {a.revertedAt && (
                      <Text style={[styles.historyDate, { color: colors.textSecondary }]}>
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
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBtn: { padding: 8 },
  headerBtnText: { fontSize: 14, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, maxWidth: 600, alignSelf: 'center', width: '100%' },

  loadingBox: { alignItems: 'center', paddingVertical: 60 },
  loadingText: { fontSize: 14, marginTop: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },

  // Summary bar
  summaryBar: {
    flexDirection: 'row', borderRadius: 12,
    padding: 14, marginBottom: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'space-between',
  },
  summaryInfo: {},
  summaryLabel: { fontSize: 12 },
  summaryValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  selectAllBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  selectAllText: { fontSize: 12, fontWeight: '600' },

  // Proposal cards
  proposalCard: {
    borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1,
  },
  proposalCardSelected: {},
  proposalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  proposalLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  proposalIcon: { fontSize: 24 },
  proposalLabel: { fontSize: 14, fontWeight: '600' },
  proposalAction: { fontSize: 11, marginTop: 2 },
  proposalRight: { alignItems: 'flex-end', gap: 4 },
  proposalSaving: { fontSize: 16, fontWeight: '700' },
  checkbox: { fontSize: 18 },

  proposalRationale: {
    fontSize: 12, lineHeight: 18, marginBottom: 12,
    paddingVertical: 8, borderTopWidth: 1,
  },

  proposalStats: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  pStat: {
    flex: 1, borderRadius: 8, padding: 8, alignItems: 'center',
  },
  pStatValue: { fontSize: 14, fontWeight: '700' },
  pStatLabel: { fontSize: 10, marginTop: 2 },

  feasRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  feasLabel: { fontSize: 11, width: 60 },
  feasTrack: {
    flex: 1, height: 6, borderRadius: 3, overflow: 'hidden',
  },
  feasFill: { height: '100%', borderRadius: 3 },
  feasValue: { fontSize: 11, width: 30, textAlign: 'right' },

  flagsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  flagBadge: {
    backgroundColor: 'rgba(255, 152, 0, 0.15)', paddingHorizontal: 8,
    paddingVertical: 4, borderRadius: 6,
  },
  flagText: { color: '#FF9800', fontSize: 11 },

  // Execute
  executeBtn: {
    paddingVertical: 18, borderRadius: 14,
    alignItems: 'center', marginTop: 8, marginBottom: 32,
  },
  executeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabledBtn: { opacity: 0.5 },

  // History cards
  historyCard: {
    borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1,
  },
  historyHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  historyLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyIcon: { fontSize: 22 },
  historyLabel: { fontSize: 14, fontWeight: '600' },
  historyAction: { fontSize: 11, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800' },
  historyRationale: { fontSize: 12, lineHeight: 18, marginBottom: 8 },
  historyStats: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  historyStat: { fontSize: 12 },
  historyDates: { gap: 2, marginBottom: 8 },
  historyDate: { fontSize: 11 },
  revertBtn: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)', paddingVertical: 10,
    borderRadius: 8, alignItems: 'center', borderWidth: 1,
    borderColor: 'rgba(244, 67, 54, 0.3)',
  },
  revertBtnText: { color: '#F44336', fontSize: 13, fontWeight: '600' },
});
