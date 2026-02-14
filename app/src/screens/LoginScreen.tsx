/**
 * LoginScreen — email/password login with JWT
 */

import React, { useState } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

interface Props {
  onGoSignup: () => void;
  onGoForgot: () => void;
}

export function LoginScreen({ onGoSignup, onGoForgot }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { setError('Please fill in all fields'); return; }
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (e: any) {
      setError(e.message || 'Login failed');
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

        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

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
          placeholder="Password"
          placeholderTextColor="#666"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.forgotLink} onPress={onGoForgot}>
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sign In</Text>}
        </TouchableOpacity>

        <View style={styles.row}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={onGoSignup}>
            <Text style={styles.linkText}>Sign Up</Text>
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
  forgotLink: { alignSelf: 'flex-end', marginBottom: 24 },
  forgotText: { color: '#4CAF50', fontSize: 14 },
  primaryBtn: {
    backgroundColor: '#4CAF50', paddingVertical: 18, borderRadius: 14,
    alignItems: 'center', marginBottom: 24,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'center' },
  footerText: { color: '#888', fontSize: 14 },
  linkText: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },
});
