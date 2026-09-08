import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ref, set, get } from 'firebase/database';
import { database } from '@/constants/firebaseConfig';
import { Menu, Provider } from 'react-native-paper';

export default function RegisterScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('Technician');
  const [menuVisible, setMenuVisible] = useState(false);

  const roles = ["Admin", "Senior Engineer", "Junior Engineer", "Technician", "Others"];

  const validatePassword = (pass: string) => {
    const hasUpper = /[A-Z]/.test(pass);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    return pass.length >= 8 && hasUpper && hasSpecial && hasNumber;
  };

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !mobile || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    if (!validatePassword(password)) {
      Alert.alert('Security Policy', 'Password must have 1 Uppercase, 1 Special Character, 1 Number, and min 8 characters.');
      return;
    }

    try {
      const userId = email.replace(/\./g, '_').toLowerCase();
      const usersRef = ref(database, 'spms/users');
      const snapshot = await get(usersRef);
      const guestExists = snapshot.exists();

      const userRef = ref(database, `spms/users/${userId}`);
      const pendingRef = ref(database, `spms/pendingApprovals/${userId}`);
      
      const userData = {
        firstName,
        lastName,
        email: email.toLowerCase(),
        mobile,
        password,
        role,
        approved: !guestExists || role === 'Admin', // Auto-approve first user or any Admin
        mail_sent: !guestExists || role === 'Admin',
        createdAt: new Date().toISOString()
      };

      await set(userRef, userData);
      await set(pendingRef, {
        name: `${firstName} ${lastName}`,
        role: role,
        uid: userId
      });

      Alert.alert('Success', 'Registration completed. Pending Owner Approval.');
      router.replace('/');
    } catch (e) {
      Alert.alert('Network Error', 'Registration failed.');
    }
  };

  return (
    <Provider>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <MaterialCommunityIcons name="account-plus" size={60} color="#39FF14" />
            <Text style={styles.title}>SPMS REGISTRATION</Text>
          </View>

          <View style={styles.form}>
            <TextInput style={styles.input} placeholder="First Name" placeholderTextColor="#555" value={firstName} onChangeText={setFirstName} />
            <TextInput style={styles.input} placeholder="Last Name" placeholderTextColor="#555" value={lastName} onChangeText={setLastName} />
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#555" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <TextInput style={styles.input} placeholder="Mobile Number" placeholderTextColor="#555" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
            
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>SELECT SYSTEM ROLE</Text>
              <Menu
                visible={menuVisible}
                onDismiss={() => setMenuVisible(false)}
                anchor={
                  <TouchableOpacity style={styles.pickerTrigger} onPress={() => setMenuVisible(true)}>
                    <Text style={styles.pickerText}>{role}</Text>
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#39FF14" />
                  </TouchableOpacity>
                }>
                {roles.map((r) => (
                  <Menu.Item key={r} onPress={() => { setRole(r); setMenuVisible(false); }} title={r} titleStyle={{ color: '#000' }} />
                ))}
              </Menu>
            </View>

            <TextInput style={styles.input} placeholder="Security Key" placeholderTextColor="#555" value={password} onChangeText={setPassword} secureTextEntry />
            <TextInput style={styles.input} placeholder="Confirm Security Key" placeholderTextColor="#555" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />

            <TouchableOpacity style={styles.regBtn} onPress={handleRegister}>
              <Text style={styles.regBtnText}>INITIALIZE ACCOUNT</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
              <Text style={styles.backText}>Return to Terminal Gateway</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: { flexGrow: 1, padding: 30, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 30 },
  title: { color: '#FFF', fontSize: 22, fontWeight: '900', marginTop: 15, letterSpacing: 2 },
  form: { width: '100%' },
  input: { backgroundColor: '#111', padding: 18, borderRadius: 12, color: '#FFF', marginBottom: 15, borderWidth: 1, borderColor: '#222' },
  pickerContainer: { marginBottom: 20 },
  pickerLabel: { color: '#555', fontSize: 10, fontWeight: 'bold', marginBottom: 8, marginLeft: 5 },
  pickerTrigger: { backgroundColor: '#111', padding: 18, borderRadius: 12, borderWidth: 1, borderColor: '#222', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerText: { color: '#FFF', fontSize: 14 },
  regBtn: { backgroundColor: '#39FF14', padding: 20, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  regBtnText: { color: '#000', fontWeight: '900', fontSize: 16 },
  backLink: { marginTop: 20, alignItems: 'center' },
  backText: { color: '#555', fontSize: 12, textDecorationLine: 'underline' }
});
