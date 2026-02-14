/**
 * ForgotPasswordScreen — OTP-based password reset
 */

import React, { useState } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { apiForgotPassword, apiResetPassword } from '../services/authApi';

interface Props {
  onGoLogin: () => void;
}

export function ForgotPasswordScreen({ onGoLogin }: Props) {
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [debugOtp, setDebugOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!email) { setError('Please enter your email'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await apiForgotPassword(email);
      setMessage(result.message);
      if (result._debug_otp) setDebugOtp(result._debug_otp);
      setStep('code');
    } catch (e: any) {
      setError(e.message || 'Failed to send reset code');
    }
    setLoading(false);
  };

  const handleReset = async () => {
    if (!code || !newPassword) { setError('Please fill in all fields'); return; }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await apiResetPassword(email, code, newPassword);
      setMessage(result.message);
      setStep('done');
    } catch (e: any) {
      setError(e.message || 'Reset failed');
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
          <Text style={styles.logoIcon}>🔐</Text>
        </View>

        <Text style={styles.title}>
          {step === 'email' ? 'Reset Password' : step === 'code' ? 'Enter Code' : 'Success!'}
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!message && <Text style={styles.success}>{message}</Text>}

        {step === 'email' && (
          <>
            <Text style={styles.subtitle}>Enter your email to receive a reset code</Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#666"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSendOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send Reset Code</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === 'code' && (
          <>
            <Text style={styles.subtitle}>Check your email for the 6-digit code</Text>
            {!!debugOtp && (
              <View style={styles.debugBox}>
                <Text style={styles.debugText}>🔧 Debug OTP: {debugOtp}</Text>
              </View>
            )}
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor="#666"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
            <TextInput
              style={styles.input}
              placeholder="New Password (min 6 chars)"
              placeholderTextColor="#666"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleReset} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Reset Password</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === 'done' && (
          <TouchableOpacity style={styles.primaryBtn} onPress={onGoLogin}>
            <Text style={styles.primaryBtnText}>Go to Login</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.backLink} onPress={onGoLogin}>
          <Text style={styles.linkText}>← Back to Login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a12' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32 },
  logoBox: { alignItems: 'center', marginBottom: 24 },
  logoIcon: { fontSize: 48 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#888', fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  error: { color: '#ff4444', textAlign: 'center', marginBottom: 12, fontSize: 14 },
  success: { color: '#4CAF50', textAlign: 'center', marginBottom: 12, fontSize: 14 },
  input: {
    backgroundColor: '#12121a', borderWidth: 1, borderColor: '#2a2a3e',
    borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: '#4CAF50', paddingVertical: 18, borderRadius: 14,
    alignItems: 'center', marginBottom: 24,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  backLink: { alignItems: 'center', marginTop: 8 },
  linkText: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },
  debugBox: {
    backgroundColor: '#1a1a2e', borderRadius: 8, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#FFD700',
  },
  debugText: { color: '#FFD700', fontSize: 14, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
