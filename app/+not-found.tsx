import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { router } from 'expo-router'

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔍</Text>
      <Text style={styles.title}>Page introuvable</Text>
      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/')}>
        <Text style={styles.btnText}>Retour à l'accueil</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  icon: { fontSize: 48 },
  title: { fontSize: 20, fontWeight: '600', color: '#1e293b' },
  btn: {
    backgroundColor: '#6366f1', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  btnText: { color: '#fff', fontWeight: '600' },
})