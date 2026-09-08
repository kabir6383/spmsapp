import { database } from '@/constants/firebaseConfig';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { onValue, ref, set, update } from 'firebase/database';
import React, { useContext, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Image } from 'react-native';
import { Avatar, Card, Subheading, Title, ActivityIndicator } from 'react-native-paper';
import { AuthContext } from './_layout';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const { isLoggedIn, setIsLoggedIn, userData, setUserData } = useContext(AuthContext);
  const router = useRouter();
  const [aiHealth, setAiHealth] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit State
  const [firstName, setFirstName] = useState(userData?.firstName || '');
  const [lastName, setLastName] = useState(userData?.lastName || '');
  const [mobile, setMobile] = useState(userData?.mobile || '');
  const [profileImage, setProfileImage] = useState(userData?.profileImage || null);

  useEffect(() => {
    if (userData) {
      setFirstName(userData.firstName);
      setLastName(userData.lastName);
      setMobile(userData.mobile);
      setProfileImage(userData.profileImage);
    }
  }, [userData]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const healthRef = ref(database, 'spms/ai_health');
    const unsub = onValue(healthRef, (snap) => setAiHealth(snap.val()));
    return () => unsub();
  }, [isLoggedIn]);

  const handlePickImage = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event: any) => {
          setProfileImage(event.target.result);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        };
        reader.readAsDataURL(file);
      };
      input.click();
    } else {
      Alert.alert("System Notification", "Image selection on mobile requires the personnel terminal library to be installed.");
    }
  };

  const handleSave = async () => {
    if (!firstName || !lastName || !mobile) {
      Alert.alert("Validation Error", "All engineering fields are mandatory.");
      return;
    }

    setSaving(true);
    try {
      const userId = userData.email.replace(/\./g, '_').toLowerCase();
      const userRef = ref(database, `spms/users/${userId}`);
      
      const updatedUser = {
        ...userData,
        firstName,
        lastName,
        mobile,
        profileImage
      };

      await update(userRef, {
        firstName,
        lastName,
        mobile,
        profileImage
      });

      setUserData(updatedUser);
      
      // Update persistent storage for web
      if (Platform.OS === 'web') {
        localStorage.setItem('spms_engineer', JSON.stringify(updatedUser));
      }

      setIsEditing(false);
      Alert.alert("Success", "Profile monitor updated successfully.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("System Error", "Failed to commit changes to central database.");
    } finally {
      setSaving(false);
    }
  };

  const downloadCSV = () => {
    const healthRef = ref(database, 'spms/ai_health/logs');
    onValue(healthRef, (snap) => {
      const logs = snap.val();
      if (!logs) {
        Alert.alert("Error", "No recent data logs found in synchronization node.");
        return;
      }
      const logLines = ["Timestamp,Voltage,Current,Load,NetGrid"];
      Object.keys(logs).forEach(k => {
        const l = logs[k];
        logLines.push(`${l.timestamp},${l.voltage},${l.current},${l.load},${l.netGrid}`);
      });
      const csvContent = logLines.join('\n');
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spms_report_${Date.now()}.csv`;
        a.click();
      } else {
        Alert.alert("Report Generated", "CSV data is ready for export in browser terminal.");
      }
    }, { onlyOnce: true });
  };

  const handleRestart = async () => {
    if (Platform.OS === 'web') {
      if (window.confirm("Initialize Python Bridge Reboot?")) {
        await set(ref(database, 'spms/control/restart'), true);
        alert("Command sent.");
      }
    } else {
      Alert.alert(
        "Bridge Control",
        "Confirm reboot of the SPMS Python bridge?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Execute", onPress: async () => {
              await set(ref(database, 'spms/control/restart'), true);
              Alert.alert("Success", "Reboot command transmitted.");
          }}
        ]
      );
    }
  };

  const handleLogout = () => {
    const logoutAction = () => {
      setIsLoggedIn(false);
      setUserData(null);
      try {
        if (Platform.OS === 'web') {
          localStorage.removeItem('spms_engineer');
        }
      } catch (e) {}
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');
    };
    if (Platform.OS === 'web') {
      if (window.confirm("Are you sure you want to logout of the system?")) logoutAction();
    } else {
      Alert.alert("Logout", "Are you sure you want to end this engineer session?", [
        { text: "Cancel", style: "cancel" },
        { text: "LOGOUT", onPress: logoutAction }
      ]);
    }
  };

  const isAdminOrEngineer = userData?.role === 'Admin' || userData?.role === 'Senior Engineer';

  if (!isLoggedIn) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.tabTitle}>PROFILE</Text>
      </View>
      <View style={styles.header}>
        <View style={styles.avatarWrapper}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={styles.profileImg} />
          ) : (
            <Avatar.Icon size={120} icon="account" style={{ backgroundColor: '#111' }} color="#39FF14" />
          )}
          {isEditing && (
            <TouchableOpacity style={styles.editImageBtn} onPress={handlePickImage}>
              <MaterialCommunityIcons name="camera-plus" size={24} color="#000" />
            </TouchableOpacity>
          )}
        </View>
        <Title style={styles.name}>{userData?.firstName} {userData?.lastName}</Title>
        <Subheading style={styles.role}>{userData?.role || 'Staff Engineer'}</Subheading>
      </View>

      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Card.Title 
            title="ENGINEERING PROFILE" 
            titleStyle={styles.cardHeaderTitle} 
            left={(props) => <MaterialCommunityIcons {...props} name="shield-check" color="#39FF14" />} 
          />
          <TouchableOpacity style={styles.editToggle} onPress={() => isEditing ? handleSave() : setIsEditing(true)}>
             {saving ? (
               <ActivityIndicator color="#39FF14" size="small" />
             ) : (
               <MaterialCommunityIcons name={isEditing ? "check" : "pencil"} size={20} color="#39FF14" />
             )}
          </TouchableOpacity>
        </View>
        
        <Card.Content>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="account-outline" size={20} color="#39FF14" style={{ marginTop: 10 }} />
            <View style={styles.infoText}>
              <Text style={styles.label}>First Name</Text>
              {isEditing ? (
                <TextInput style={styles.editInput} value={firstName} onChangeText={setFirstName} />
              ) : (
                <Text style={styles.value}>{userData?.firstName}</Text>
              )}
            </View>
          </View>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="account-outline" size={20} color="#39FF14" style={{ marginTop: 10 }} />
            <View style={styles.infoText}>
              <Text style={styles.label}>Last Name</Text>
              {isEditing ? (
                <TextInput style={styles.editInput} value={lastName} onChangeText={setLastName} />
              ) : (
                <Text style={styles.value}>{userData?.lastName}</Text>
              )}
            </View>
          </View>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="phone-outline" size={20} color="#39FF14" style={{ marginTop: 10 }} />
            <View style={styles.infoText}>
              <Text style={styles.label}>Emergency Mobile</Text>
              {isEditing ? (
                <TextInput style={styles.editInput} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
              ) : (
                <Text style={styles.value}>{userData?.mobile}</Text>
              )}
            </View>
          </View>
          {isEditing && (
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditing(false)}>
              <Text style={styles.cancelText}>CANCEL EDITS</Text>
            </TouchableOpacity>
          )}
        </Card.Content>
      </Card>

      <Card style={[styles.card, { marginTop: 25 }]}>
        <Card.Title title="HISTORICAL DATA & AI" titleStyle={styles.cardHeaderTitle} left={(props) => <MaterialCommunityIcons {...props} name="database-clock" color="#39FF14" />} />
        <Card.Content>
          <View style={styles.aiFlex}>
            <View>
              <Text style={styles.label}>Machine Learning Health</Text>
              <Text style={[styles.value, { color: aiHealth?.status === 'optimized' ? '#39FF14' : '#FF3131' }]}>
                {aiHealth?.status?.toUpperCase() || 'SYNCHRONIZING...'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.label}>Last 7-Day Cycle</Text>
              <Text style={styles.value}>{aiHealth?.last_train_date ? new Date(aiHealth.last_train_date * 1000).toLocaleDateString() : 'N/A'}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.exportBtn} onPress={downloadCSV}>
            <MaterialCommunityIcons name="file-download-outline" size={18} color="#000" />
            <Text style={styles.exportText}>EXPORT CSV REPORT</Text>
          </TouchableOpacity>
        </Card.Content>
      </Card>

      <View style={styles.footer}>
        {isAdminOrEngineer && (
          <TouchableOpacity style={styles.restartBtn} onPress={handleRestart}>
            <MaterialCommunityIcons name="restart" size={20} color="#FFF" />
            <Text style={styles.restartText}>RESTART SYSTEM</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={20} color="#FFF" />
          <Text style={styles.logoutText}>LOGOUT</Text>
        </TouchableOpacity>
        <Text style={styles.version}>SPMS V3.2.0 | Automated AI Terminal</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#000', padding: 25, paddingTop: 80 },
  topBar: { marginBottom: 20 },
  tabTitle: { color: '#FFF', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  header: { alignItems: 'center', marginBottom: 40 },
  avatarWrapper: { position: 'relative' },
  profileImg: { width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: '#39FF14' },
  editImageBtn: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#39FF14', padding: 10, borderRadius: 20 },
  name: { color: '#FFF', fontSize: 26, fontWeight: '900', marginTop: 15 },
  role: { color: '#39FF14', fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 2 },
  card: { backgroundColor: '#111', borderRadius: 25, borderWidth: 1, borderColor: '#222', paddingBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 20 },
  cardHeaderTitle: { color: '#FFF', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  editToggle: { padding: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 12 },
  infoText: { marginLeft: 20, flex: 1 },
  label: { color: '#555', fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase' },
  value: { color: '#FFF', fontSize: 15, marginTop: 2, fontWeight: '500' },
  editInput: { backgroundColor: '#1a1a1a', color: '#FFF', padding: 10, borderRadius: 8, marginTop: 5, borderWidth: 1, borderColor: '#333', fontSize: 14 },
  cancelBtn: { marginTop: 15, paddingVertical: 10, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#222' },
  cancelText: { color: '#FF3131', fontSize: 10, fontWeight: 'bold' },
  aiFlex: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 20 },
  exportBtn: { backgroundColor: '#39FF14', flexDirection: 'row', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  exportText: { color: '#000', fontWeight: '900', marginLeft: 10, fontSize: 12 },
  footer: { marginTop: 'auto', paddingTop: 40, alignItems: 'center' },
  restartBtn: { backgroundColor: '#FF3131', flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 15, borderRadius: 15, alignItems: 'center', width: '100%', justifyContent: 'center', marginBottom: 15 },
  restartText: { color: '#FFF', fontWeight: '900', marginLeft: 10, fontSize: 13 },
  logoutBtn: { backgroundColor: '#1a1a1a', flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 15, borderRadius: 15, alignItems: 'center', width: '100%', justifyContent: 'center', borderWidth: 1, borderColor: '#333' },
  logoutText: { color: '#FFF', fontWeight: '900', marginLeft: 10, fontSize: 13 },
  version: { color: '#222', fontSize: 9, marginTop: 25, fontWeight: 'bold', letterSpacing: 1 }
});
