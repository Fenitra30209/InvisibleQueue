import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLocation } from '../../hooks/useLocation'

export default function CreateQueueScreen() {
  const { user } = useAuth()
  const { location } = useLocation()
  const [name, setName] = useState('')
  const [useMyLocation, setUseMyLocation] = useState(true)
  const [customLat, setCustomLat] = useState('')
  const [customLon, setCustomLon] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!user) {
      Alert.alert('Erreur', 'Vous devez être connecté pour créer une file.')
      return
    }

    if (!name.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom pour la file.')
      return
    }

    let lat: number
    let lon: number

    if (useMyLocation) {
      if (!location) {
        Alert.alert('Erreur', 'Position GPS non disponible.')
        return
      }
      lat = location.latitude
      lon = location.longitude
    } else {
      lat = parseFloat(customLat)
      lon = parseFloat(customLon)
      if (isNaN(lat) || isNaN(lon)) {
        Alert.alert('Erreur', 'Coordonnées invalides.')
        return
      }
    }

    setLoading(true)

    const { data, error } = await supabase
      .from('queues')
      .insert({
        name: name.trim(),
        owner_id: user.id,
        latitude: lat,
        longitude: lon,
        is_active: true,
      })
      .select()
      .single()

    setLoading(false)

    if (error) {
      Alert.alert('Erreur', error.message)
    } else {
      Alert.alert(
        '✅ File créée !',
        `"${data.name}" est maintenant visible à proximité.`,
        [
          {
            text: 'Gérer la file',
            onPress: () => router.replace(`/queue/manage/${data.id}`),
          },
          {
            text: 'Retour accueil',
            onPress: () => router.replace('/'),
          },
        ]
      )
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Créer une file</Text>
          <Text style={styles.subtitle}>
            Mettez à disposition une file d'attente géolocalisée
          </Text>
        </View>

        {/* Nom */}
        <View style={styles.section}>
          <Text style={styles.label}>Nom de la file *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Caisse principale, Accueil..."
            value={name}
            onChangeText={setName}
            maxLength={50}
          />
          <Text style={styles.hint}>{name.length}/50 caractères</Text>
        </View>

        {/* Localisation */}
        <View style={styles.section}>
          <Text style={styles.label}>Localisation *</Text>

          <TouchableOpacity
            style={[styles.optionCard, useMyLocation && styles.optionCardActive]}
            onPress={() => setUseMyLocation(true)}
          >
            <View style={styles.optionRow}>
              <View style={[styles.radio, useMyLocation && styles.radioActive]} />
              <View>
                <Text style={styles.optionTitle}>📍 Ma position actuelle</Text>
                {location ? (
                  <Text style={styles.optionSub}>
                    {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                  </Text>
                ) : (
                  <Text style={styles.optionSubWarn}>GPS non disponible</Text>
                )}
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionCard, !useMyLocation && styles.optionCardActive]}
            onPress={() => setUseMyLocation(false)}
          >
            <View style={styles.optionRow}>
              <View style={[styles.radio, !useMyLocation && styles.radioActive]} />
              <Text style={styles.optionTitle}>🗺️ Coordonnées manuelles</Text>
            </View>
          </TouchableOpacity>

          {!useMyLocation && (
            <View style={styles.coordRow}>
              <TextInput
                style={[styles.input, styles.coordInput]}
                placeholder="Latitude (ex: -18.8792)"
                value={customLat}
                onChangeText={setCustomLat}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, styles.coordInput]}
                placeholder="Longitude (ex: 47.5079)"
                value={customLon}
                onChangeText={setCustomLon}
                keyboardType="numeric"
              />
            </View>
          )}
        </View>

        {/* Bouton créer */}
        <TouchableOpacity
          style={[styles.createBtn, loading && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.createBtnText}>Créer la file</Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 24, gap: 24 },
  header: { paddingTop: 40, gap: 6 },
  backText: { color: '#6366f1', fontSize: 15, fontWeight: '500', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b' },
  section: { gap: 10 },
  label: { fontSize: 15, fontWeight: '600', color: '#374151' },
  input: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    fontSize: 15, borderWidth: 1, borderColor: '#e2e8f0',
  },
  hint: { fontSize: 12, color: '#94a3b8', textAlign: 'right' },
  optionCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 2, borderColor: '#e2e8f0',
  },
  optionCardActive: { borderColor: '#6366f1', backgroundColor: '#eef2ff' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#cbd5e1',
  },
  radioActive: { borderColor: '#6366f1', backgroundColor: '#6366f1' },
  optionTitle: { fontSize: 15, fontWeight: '500', color: '#1e293b' },
  optionSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  optionSubWarn: { fontSize: 12, color: '#f59e0b', marginTop: 2 },
  coordRow: { flexDirection: 'row', gap: 10 },
  coordInput: { flex: 1 },
  createBtn: {
    backgroundColor: '#6366f1', borderRadius: 16,
    padding: 18, alignItems: 'center', marginTop: 8,
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
})