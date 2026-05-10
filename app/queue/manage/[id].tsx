import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, RefreshControl
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { QueueEntry } from '../../../types/database'

export default function ManageQueueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const [queueName, setQueueName] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)

useEffect(() => {
  fetchData()

  const channel = supabase
    .channel(`manage-${id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'queue_entries',
        filter: `queue_id=eq.${id}`,
      },
      () => fetchEntries()
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [id])

  const fetchData = async () => {
    // Vérifie que l'user est bien le propriétaire
    const { data: queue } = await supabase
      .from('queues')
      .select('*')
      .eq('id', id)
      .eq('owner_id', user?.id)
      .single()

    if (!queue) {
      Alert.alert('Accès refusé', 'Vous n\'êtes pas propriétaire de cette file.')
      router.back()
      return
    }

    setQueueName(queue.name)
    await fetchEntries()
  }

  const fetchEntries = async () => {
    const { data } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('queue_id', id)
      .in('status', ['waiting', 'missed'])
      .order('position', { ascending: true })

    if (data) setEntries(data)
    setLoading(false)
    setRefreshing(false)
  }

  const subscribeToEntries = () => {
    const channel = supabase
      .channel(`manage-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_entries',
          filter: `queue_id=eq.${id}`,
        },
        () => fetchEntries()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }

  // Marquer comme servi
  const handleServe = async (entry: QueueEntry) => {
    setProcessing(entry.id)
    const { error } = await supabase.rpc('serve_entry', { p_entry_id: entry.id })
    if (error) Alert.alert('Erreur', error.message)
    setProcessing(null)
  }

  // Marquer comme absent (tour manqué)
  const handleMissed = async (entry: QueueEntry) => {
    setProcessing(entry.id)
    const { error } = await supabase.rpc('handle_missed_turn', { p_entry_id: entry.id })
    if (error) Alert.alert('Erreur', error.message)
    setProcessing(null)
  }

  // Exclure manuellement
  const handleRemove = async (entry: QueueEntry) => {
    Alert.alert(
      'Exclure',
      `Voulez-vous exclure ${entry.guest_name ?? 'cet utilisateur'} de la file ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Exclure', style: 'destructive',
          onPress: async () => {
            setProcessing(entry.id)
            await supabase
              .from('queue_entries')
              .update({ status: 'removed' })
              .eq('id', entry.id)

            await supabase.rpc('compact_queue', { p_queue_id: id })
            setProcessing(null)
          }
        }
      ]
    )
  }

  const getEntryName = (entry: QueueEntry) =>
    entry.guest_name ?? 'Utilisateur connecté'

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    )
  }

  const currentEntry = entries[0] ?? null

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{queueName}</Text>
        <Text style={styles.subtitle}>Gestion de file · {entries.length} en attente</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchEntries() }} />}
      >
        {/* Personne actuelle */}
        {currentEntry && (
          <View style={styles.currentCard}>
            <Text style={styles.currentLabel}>👤 Prochain</Text>
            <Text style={styles.currentName}>{getEntryName(currentEntry)}</Text>
            {currentEntry.missed_count > 0 && (
              <View style={styles.missedBadge}>
                <Text style={styles.missedBadgeText}>
                  ⚠️ {currentEntry.missed_count} retard(s)
                </Text>
              </View>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.btnServe}
                onPress={() => handleServe(currentEntry)}
                disabled={processing === currentEntry.id}
              >
                {processing === currentEntry.id
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnServeText}>✅ Servi</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnMissed}
                onPress={() => handleMissed(currentEntry)}
                disabled={processing === currentEntry.id}
              >
                <Text style={styles.btnMissedText}>⏭ Absent</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnRemove}
                onPress={() => handleRemove(currentEntry)}
                disabled={processing === currentEntry.id}
              >
                <Text style={styles.btnRemoveText}>🚫</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {entries.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyText}>La file est vide !</Text>
          </View>
        )}

        {/* File complète */}
        {entries.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>File complète</Text>
            {entries.map((entry, index) => (
              <View key={entry.id} style={styles.entryRow}>
                <View style={[
                  styles.posCircle,
                  index === 0 && styles.posCircleActive
                ]}>
                  <Text style={[
                    styles.posText,
                    index === 0 && styles.posTextActive
                  ]}>
                    {entry.position}
                  </Text>
                </View>

                <View style={styles.entryInfo}>
                  <Text style={styles.entryName}>{getEntryName(entry)}</Text>
                  {entry.missed_count > 0 && (
                    <Text style={styles.entryMissed}>
                      {entry.missed_count} tour(s) manqué(s)
                    </Text>
                  )}
                </View>

                {index !== 0 && (
                  <TouchableOpacity
                    style={styles.removeSmall}
                    onPress={() => handleRemove(entry)}
                  >
                    <Text style={styles.removeSmallText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backText: { color: '#6366f1', fontSize: 15, fontWeight: '500', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  content: { padding: 20, gap: 16 },

  currentCard: {
    backgroundColor: '#1e293b', borderRadius: 20,
    padding: 24, alignItems: 'center', gap: 8,
  },
  currentLabel: { color: '#94a3b8', fontSize: 13 },
  currentName: { color: '#fff', fontSize: 24, fontWeight: '700' },
  missedBadge: {
    backgroundColor: '#f59e0b', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  missedBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btnServe: {
    flex: 1, backgroundColor: '#22c55e', borderRadius: 14,
    padding: 14, alignItems: 'center',
  },
  btnServeText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnMissed: {
    flex: 1, backgroundColor: '#f59e0b', borderRadius: 14,
    padding: 14, alignItems: 'center',
  },
  btnMissedText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnRemove: {
    backgroundColor: '#ef4444', borderRadius: 14,
    padding: 14, paddingHorizontal: 16, alignItems: 'center',
  },
  btnRemoveText: { fontSize: 16 },

  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#64748b' },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  entryRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  posCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center',
  },
  posCircleActive: { backgroundColor: '#6366f1' },
  posText: { fontWeight: '700', color: '#475569', fontSize: 16 },
  posTextActive: { color: '#fff' },
  entryInfo: { flex: 1 },
  entryName: { fontSize: 15, color: '#1e293b', fontWeight: '500' },
  entryMissed: { fontSize: 12, color: '#f59e0b', marginTop: 2 },
  removeSmall: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center',
  },
  removeSmallText: { color: '#ef4444', fontWeight: '700' },
})