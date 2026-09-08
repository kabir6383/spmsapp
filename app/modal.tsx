import { Link } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Title } from 'react-native-paper';

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <Title style={styles.title}>SPMS Terminal Info</Title>
      <Text style={styles.info}>This is a system modal for SPMS operations. Use the link below to return to the dashboard.</Text>
      <Link href="/" dismissTo style={styles.link}>
        <Text style={styles.linkText}>Return to Overview</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    backgroundColor: '#000',
  },
  title: {
    color: '#FFF',
    fontWeight: '900',
    marginBottom: 20,
    letterSpacing: 1,
  },
  info: {
    color: '#555',
    textAlign: 'center',
    fontSize: 14,
    marginBottom: 30,
  },
  link: {
    paddingVertical: 15,
  },
  linkText: {
    color: '#39FF14',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
});
