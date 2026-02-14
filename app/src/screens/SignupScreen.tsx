/**
 * SignupScreen — create account with name, email, password
 */

import React, { useState } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

interface Props {
  onGoLogin: () => void;
}

export function SignupScreen({ onGoLogin }: Props) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password) { setError('Please fill in all fields'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setError('');
    setLoading(true);
    try {
      await signup(email, password, name);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Signup failed');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoBox}>
          <Text style={styles.logoIcon}>⚡</Text>
          <Text style={styles.logoText}>SmartGrid Home</Text>
        </View>

        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join SmartGrid Home</Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Name (optional)"
          placeholderTextColor="#666"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#666"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password (min 6 chars)"
          placeholderTextColor="#666"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          placeholderTextColor="#666"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
        />

        <TouchableOpacity style={styles.primaryBtn} onPress={handleSignup} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create Account</Text>}
        </TouchableOpacity>

        <View style={styles.row}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={onGoLogin}>
            <Text style={styles.linkText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a12' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32 },
  logoBox: { alignItems: 'center', marginBottom: 32 },
  logoIcon: { fontSize: 48, marginBottom: 8 },
  logoText: { color: '#4CAF50', fontSize: 24, fontWeight: '800' },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#888', fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  error: { color: '#ff4444', textAlign: 'center', marginBottom: 12, fontSize: 14 },
  input: {
    backgroundColor: '#12121a', borderWidth: 1, borderColor: '#2a2a3e',
    borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: '#4CAF50', paddingVertical: 18, borderRadius: 14,
    alignItems: 'center', marginBottom: 24, marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'center' },
  footerText: { color: '#888', fontSize: 14 },
  linkText: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },
});
