/**
 * ChatScreen.tsx — Gemini-powered energy advisor chatbot
 *
 * Uses the FastAPI /api/v1/chat endpoint (Gemini 2.0 Flash on the backend).
 * Works in Expo Go — no native dev build required.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Theme hook from App
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

import { API_V1_URL } from '../utils/apiConfig';
import { listHomes } from '../services/apiClient';

const BASE_URL = API_V1_URL;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------
async function sendChatMessage(
  message: string,
  history: { role: string; content: string }[],
  homeId?: string | null,
): Promise<string> {
  const url = `${API_V1_URL}/chat`;
  console.log(`[GEMINI] Chat request: "${message}" (${history.length} messages in history)`);
  const t0 = Date.now();

  const body: any = { message, history };
  if (homeId) body.home_id = homeId;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const elapsed = Date.now() - t0;

  if (!resp.ok) {
    const errText = await resp.text();
    console.log(`[GEMINI] Chat FAILED (${resp.status}, ${elapsed}ms): ${errText}`);
    throw new Error(`Chat failed: ${resp.status} — ${errText}`);
  }

  const text = await resp.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error('Server returned invalid response'); }
  const reply = json?.data?.reply ?? 'No response received.';
  console.log(`[GEMINI] Chat response (${elapsed}ms): "${reply.slice(0, 100)}${reply.length > 100 ? '...' : ''}"`);
  return reply;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ChatScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [homeId, setHomeId] = useState<string | null>(null);
  const [deviceCount, setDeviceCount] = useState(0);
  const [topCategory, setTopCategory] = useState<string | null>(null);

  // Fetch first home on mount so chat can include device context
  useEffect(() => {
    (async () => {
      try {
        const uid = user?.id || user?.homeId || 'demo';
        const homes = await listHomes(uid);
        if (homes.length > 0) {
          setHomeId(homes[0].id);
          // Fetch devices to personalize suggestions
          try {
            const { listDevices } = await import('../services/apiClient');
            const devs = await listDevices(homes[0].id);
            setDeviceCount(devs.length);
            if (devs.length > 0) {
              // Find highest wattage device for suggestion
              let maxW = 0;
              let maxCat = '';
              for (const d of devs) {
                const w = d.power?.active_watts_typical ?? 0;
                if (w > maxW) { maxW = w; maxCat = d.category; }
              }
              if (maxCat) setTopCategory(maxCat);
            }
          } catch { /* ok */ }
        }
      } catch { /* silently continue without home context */ }
    })();
  }, [user]);

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  // ── Send message ─────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setIsLoading(true);
    scrollToBottom();

    try {
      // Build history for context (last 10 messages)
      const history = updatedMessages.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const reply = await sendChatMessage(text, history, homeId);

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMsg]);
      scrollToBottom();
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Something went wrong';

      const errorReply: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: '[Error] ' + errorText,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorReply]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, isLoading, messages, scrollToBottom, homeId]);

  // ── Render message bubble ────────────────────────────────────────────
  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[
        s.messageBubble,
        isUser ? s.userBubble : s.assistantBubble,
        {
          backgroundColor: isUser
            ? colors.accent
            : isDark ? '#1a1a2e' : '#e8e8e8',
        },
      ]}>
        {!isUser && (
          <Text style={[s.roleLabel, { color: colors.accent }]}><Ionicons name="flash-outline" size={12} color={colors.accent} /> SmartGrid AI</Text>
        )}
        <Text style={[
          s.messageText,
          { color: isUser ? '#fff' : colors.text },
        ]}>
          {item.content}
        </Text>
      </View>
    );
  }, [colors, isDark]);

  // ── Quick suggestions — personalized when device data available ───
  const suggestions = React.useMemo(() => {
    if (deviceCount > 0 && topCategory) {
      return [
        'What device uses the most power in my home?',
        `How much does my ${topCategory} cost to run per year?`,
        'Give me a breakdown of my energy usage',
        'Which devices should I unplug to save the most?',
      ];
    }
    return [
      'What device uses the most power in my home?',
      'How can I reduce my electricity bill?',
      'Give me a breakdown of my energy usage',
      'Tips for energy-efficient cooling',
    ];
  }, [deviceCount, topCategory]);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image source={require('../../assets/image.png')} style={{ width: 22, height: 22, marginRight: 8, tintColor: colors.accent }} />
          <Text style={[s.headerTitle, { color: colors.text }]}>SmartGrid AI</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <Text style={[s.geminiIcon, { color: colors.textSecondary }]}>♊︎</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary, marginLeft: 6 }]}>Powered by Gemini • Energy Advisor</Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={s.messageList}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Image source={require('../../assets/gemini.png')} style={s.geminiLarge} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>
              Your Energy Assistant
            </Text>
            <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>
              {deviceCount > 0
                ? `I can see ${deviceCount} device${deviceCount !== 1 ? 's' : ''} in your home. Ask me anything about your energy usage!`
                : 'Ask anything about home energy usage, appliance efficiency, or reducing your electricity bill.'}
            </Text>

            {/* Quick suggestions */}
            <View style={s.suggestionsContainer}>
              {suggestions.map((suggestion, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.suggestionChip, { borderColor: colors.border, backgroundColor: colors.card }]}
                  onPress={() => setInputText(suggestion)}
                >
                  <Text style={[s.suggestionText, { color: colors.text }]}>
                    {suggestion}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListFooterComponent={
          isLoading ? (
            <View style={[s.messageBubble, s.assistantBubble, { backgroundColor: isDark ? '#1a1a2e' : '#e8e8e8' }]}>
              <Text style={[s.roleLabel, { color: colors.accent }]}><Ionicons name="flash-outline" size={12} color={colors.accent} /> SmartGrid AI</Text>
              <View style={s.typingRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[s.typingText, { color: colors.textSecondary }]}>Thinking…</Text>
              </View>
            </View>
          ) : null
        }
      />

      {/* Input bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <View style={[s.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TextInput
            style={[s.input, {
              backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0',
              color: colors.text,
            }]}
            placeholder="Ask about energy..."
            placeholderTextColor={colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            editable={!isLoading}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit
          />
          <TouchableOpacity
            style={[
              s.sendButton,
              { backgroundColor: colors.accent },
              (!inputText.trim() || isLoading) && s.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}
          >
            <Text style={s.sendButtonText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  geminiIcon: {
    fontSize: 14,
    lineHeight: 16,
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  roleLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typingText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  geminiLarge: {
    width: 56,
    height: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  suggestionsContainer: {
    marginTop: 24,
    width: '100%',
  },
  suggestionChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  suggestionText: {
    fontSize: 13,
    textAlign: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
});
