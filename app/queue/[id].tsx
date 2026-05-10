import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  ScrollView, Modal, KeyboardAvoidingView, Platform
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLocation } from '../../hooks/useLocation'
import { Queue, QueueEntry } from '../../types/database'
import { useQueueNotifications } from '../../hooks/useNotifications'
import AsyncStorage from '@react-native-async-storage/async-storage'

export default function QueueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user, profile } = useAuth()
  const { isNearQueue } = useLocation()

  const [queue, setQueue] = useState<Queue | null>(null)
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const [myEntry, setMyEntry] = useState<QueueEntry | null>(null)
  const [userProfiles, setUserProfiles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [showGuestModal, setShowGuestModal] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [isOwner, setIsOwner] = useState(false)

  useQueueNotifications(id ?? null, myEntry?.id ?? null)

  useEffect(() => {
    if (id) {
      fetchQueue()
      fetchEntries()

      const channel = supabase
        .channel(`queue-${id}`)
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
  }, [id, user])

  const fetchQueue = async () => {
    const { data } = await supabase
      .from('queues')
      .select('*')
      .eq('id', id)
      .single()
    if (data) {
      setQueue(data)
      if (user && data.owner_id === user.id) setIsOwner(true)
    }
  }

  const fetchEntries = async () => {
    const { data } = await supabase
      .from('queue_entries')
      .select(`
        *,
        profiles (
          id,
          name
        )
      `)
      .eq('queue_id', id)
      .eq('status', 'waiting')
      .order('position', { ascending: true })

    if (data) {
      setEntries(data)

      // Construit la map des noms
      const map: Record<string, string> = {}
      data.forEach((e: any) => {
        if (e.user_id && e.profiles?.name) {
          map[e.user_id] = e.profiles.name
        }
      })
      setUserProfiles(map)

      // Retrouve mon entrée
      if (user?.id) {
        const mine = data.find((e: any) => e.user_id === user.id)
        setMyEntry(mine ?? null)
      } else {
        const savedId = await AsyncStorage.getItem(`entry_${id}`)
        if (savedId) {
          const mine = data.find((e: any) => e.id === savedId)
          setMyEntry(mine ?? null)
        } else {
          setMyEntry(null)
        }
      }
    }
    setLoading(false)
  }

  const handleJoin = async () => {
    if (!queue) return

    if (!isNearQueue(queue.latitude, queue.longitude)) {
      Alert.alert('Trop loin', 'Vous devez être à moins de 3km de la file.')
      return
    }

    // Vérif doublon utilisateur connecté
    if (user?.id) {
      const { data: existing } = await supabase
        .from('queue_entries')
        .select('id')
        .eq('queue_id', id)
        .eq('user_id', user.id)
        .eq('status', 'waiting')
        .single()

      if (existing) {
        Alert.alert('Déjà inscrit', 'Vous êtes déjà dans cette file.')
        return
      }

      await joinQueue(user.id, profile?.name ?? '', profile?.email ?? '')
      return
    }

    // Vérif doublon invité via AsyncStorage
    const savedId = await AsyncStorage.getItem(`entry_${id}`)
    if (savedId) {
      const { data: existing } = await supabase
        .from('queue_entries')
        .select('id')
        .eq('id', savedId)
        .eq('status', 'waiting')
        .single()

      if (existing) {
        Alert.alert('Déjà inscrit', 'Vous êtes déjà dans cette file.')
        return
      }

      // L'entrée n'existe plus, on nettoie
      await AsyncStorage.removeItem(`entry_${id}`)
    }

    setShowGuestModal(true)
  }

  const joinQueue = async (
    userId: string | null,
    name: string,
    email: string
  ) => {
    setJoining(true)

    const { data: posData } = await supabase
      .rpc('next_position', { p_queue_id: id })

    const { data, error } = await supabase
      .from('queue_entries')
      .insert({
        queue_id: id,
        user_id: userId,
        guest_name: userId ? null : name,
        guest_email: userId ? null : email,
        position: posData ?? 1,
        status: 'waiting',
      })
      .select()
      .single()

    setJoining(false)

    if (error) {
      Alert.alert('Erreur', error.message)
    } else {
      if (!userId) {
        await AsyncStorage.setItem(`entry_${id}`, data.id)
      }
      setMyEntry(data)
      setShowGuestModal(false)
      Alert.alert('✅ Inscrit !', `Vous êtes en position ${posData}.`)
    }
  }

  const handleLeave = async () => {
    if (!myEntry) return
    Alert.alert('Quitter la file', 'Êtes-vous sûr de vouloir quitter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Quitter', style: 'destructive',
        onPress: async () => {
  const { error } = await supabase
    .from('queue_entries')
    .update({ status: 'removed' })
    .eq('id', myEntry.id)

  if (error) {
    Alert.alert('Erreur', error.message)
    return
  }

  await supabase.rpc('compact_queue', { p_queue_id: id })
  await AsyncStorage.removeItem(`entry_${id}`)
  setMyEntry(null)
}
      }
    ])
  }

  const getEntryName = (entry: any) => {
    if (entry.id === myEntry?.id) {
      return (profile?.name ?? myEntry?.guest_name ?? 'Moi') + ' (moi)'
    }
    if (entry.user_id) {
      return userProfiles[entry.user_id] ?? 'Utilisateur'
    }
    return entry.guest_name ?? 'Invité'
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    )
  }

  const waitingCount = entries.length
  const myPosition = myEntry?.position ?? null

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.queueName}>{queue?.name}</Text>
        {isOwner && (
          <TouchableOpacity
            onPress={() => router.push(`/queue/manage/${id}`)}
            style={styles.manageBtn}
          >
            <Text style={styles.manageBtnText}>⚙️ Gérer</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Ma position */}
        {myEntry ? (
          <View style={styles.myCard}>
            <Text style={styles.myCardLabel}>Ma position</Text>
            <Text style={styles.myCardPosition}>{myPosition}</Text>
            <Text style={styles.myCardName}>
              {profile?.name ?? myEntry.guest_name ?? 'Invité'}
            </Text>
            <Text style={styles.myCardSub}>
              {(myPosition ?? 1) - 1} personne(s) devant vous
            </Text>

            {myPosition === 1 && (
              <View style={styles.yourTurnBadge}>
                <Text style={styles.yourTurnText}>🎉 C'est votre tour !</Text>
              </View>
            )}
            {myPosition === 2 && (
              <View style={styles.soonBadge}>
                <Text style={styles.soonText}>⚡ Vous êtes le prochain !</Text>
              </View>
            )}

            <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
              <Text style={styles.leaveBtnText}>Quitter la file</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.joinBtn}
            onPress={handleJoin}
            disabled={joining}
          >
            {joining
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.joinBtnText}>Rejoindre la file</Text>
            }
          </TouchableOpacity>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{waitingCount}</Text>
            <Text style={styles.statLabel}>En attente</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>~{waitingCount * 3}min</Text>
            <Text style={styles.statLabel}>Temps estimé</Text>
          </View>
        </View>

        {/* Liste */}
        <Text style={styles.sectionTitle}>File d'attente</Text>
        {entries.map((entry) => (
          <View
            key={entry.id}
            style={[
              styles.entryRow,
              entry.id === myEntry?.id && styles.entryRowMine,
            ]}
          >
            <View style={styles.entryPos}>
              <Text style={styles.entryPosText}>{entry.position}</Text>
            </View>
            <Text style={styles.entryName}>{getEntryName(entry)}</Text>
          </View>
        ))}

        {waitingCount === 0 && (
          <Text style={styles.emptyText}>La file est vide. Soyez le premier !</Text>
        )}
      </ScrollView>

      {/* Modal invité */}
      <Modal visible={showGuestModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rejoindre en invité</Text>
            <Text style={styles.modalSub}>
              Entrez vos informations pour rejoindre la file
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Votre nom"
              value={guestName}
              onChangeText={setGuestName}
            />
            <TextInput
              style={styles.input}
              placeholder="Votre email"
              value={guestEmail}
              onChangeText={setGuestEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={styles.joinBtn}
              onPress={() => {
                if (!guestName || !guestEmail) {
                  Alert.alert('Erreur', 'Veuillez remplir tous les champs')
                  return
                }
                joinQueue(null, guestName, guestEmail)
              }}
              disabled={joining}
            >
              {joining
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.joinBtnText}>Rejoindre</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowGuestModal(false)}>
              <Text style={styles.cancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  backBtn: { marginBottom: 8 },
  backText: { color: '#6366f1', fontSize: 15, fontWeight: '500' },
  queueName: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  manageBtn: {
    marginTop: 6, backgroundColor: '#f1f5f9',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  manageBtnText: { color: '#475569', fontWeight: '600', fontSize: 13 },
  content: { padding: 20, gap: 16 },
  myCard: {
    backgroundColor: '#6366f1', borderRadius: 20,
    padding: 24, alignItems: 'center', gap: 4,
  },
  myCardLabel: { color: '#c7d2fe', fontSize: 14, fontWeight: '500' },
  myCardPosition: { color: '#fff', fontSize: 72, fontWeight: '800', lineHeight: 80 },
  myCardName: { color: '#e0e7ff', fontSize: 16, fontWeight: '600' },
  myCardSub: { color: '#c7d2fe', fontSize: 14, marginBottom: 4 },
  yourTurnBadge: {
    backgroundColor: '#22c55e', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 6, marginVertical: 8,
  },
  yourTurnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  soonBadge: {
    backgroundColor: '#f59e0b', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 6, marginVertical: 8,
  },
  soonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  leaveBtn: {
    marginTop: 12, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10,
  },
  leaveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  joinBtn: {
    backgroundColor: '#6366f1', borderRadius: 16,
    padding: 18, alignItems: 'center',
  },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16,
    alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05,
    shadowRadius: 8, elevation: 2,
  },
  statValue: { fontSize: 24, fontWeight: '700', color: '#1e293b' },
  statLabel: { fontSize: 12, color: '#64748b', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginTop: 8 },
  entryRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  entryRowMine: { borderWidth: 2, borderColor: '#6366f1' },
  entryPos: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center',
  },
  entryPosText: { fontWeight: '700', color: '#475569' },
  entryName: { fontSize: 15, color: '#1e293b', fontWeight: '500' },
  emptyText: { color: '#94a3b8', textAlign: 'center', marginTop: 12, fontSize: 14 },
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 28, gap: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  modalSub: { fontSize: 14, color: '#64748b', marginBottom: 4 },
  input: {
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 16,
    fontSize: 15, borderWidth: 1, borderColor: '#e2e8f0',
  },
  cancelText: { color: '#94a3b8', textAlign: 'center', marginTop: 8, fontSize: 14 },
})