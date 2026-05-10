import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, FlatList
} from 'react-native'
import MapView, { Marker, Circle } from 'react-native-maps'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLocation, getDistance } from '../hooks/useLocation'
import { Queue } from '../types/database'

const MAX_RADIUS = 999999

export default function HomeScreen() {
  const { user, profile, signOut } = useAuth()
  const { location, loading: locationLoading, error: locationError } = useLocation()
  const [queues, setQueues] = useState<Queue[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [view, setView] = useState<'list' | 'map'>('list')

  useEffect(() => {
    if (location) fetchQueues()
  }, [location])

  const fetchQueues = async () => {
    const { data, error } = await supabase
      .from('queues')
      .select(`*, queue_entries(count)`)
      .eq('is_active', true)

    if (error) { console.error(error); return }

    const nearby = (data || [])
      .map((q: any) => ({
        ...q,
        distance_meters: location
          ? Math.round(getDistance(location.latitude, location.longitude, q.latitude, q.longitude))
          : null,
        waiting_count: q.queue_entries?.[0]?.count ?? 0,
      }))
      .filter((q: Queue) => (q.distance_meters ?? 9999) <= MAX_RADIUS)
      .sort((a: Queue, b: Queue) => (a.distance_meters ?? 0) - (b.distance_meters ?? 0))

    setQueues(nearby)
    setLoading(false)
    setRefreshing(false)
  }

  const onRefresh = () => { setRefreshing(true); fetchQueues() }

  if (locationLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.subtitle}>Récupération de votre position...</Text>
      </View>
    )
  }

  if (locationError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>📍 {locationError}</Text>
        <Text style={styles.subtitle}>Activez la géolocalisation.</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Invisible Queue</Text>
          <Text style={styles.subtitle}>
            {user ? `Bonjour, ${profile?.name}` : 'Mode invité'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {user ? (
            <>
              <TouchableOpacity
                style={styles.btnOutline}
                onPress={() => router.push('/queue/create')}
              >
                <Text style={styles.btnOutlineText}>+ File</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={signOut}>
                <Text style={styles.signOutText}>Déco</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={styles.btnPrimaryText}>Connexion</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Toggle vue */}
      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, view === 'list' && styles.toggleBtnActive]}
          onPress={() => setView('list')}
        >
          <Text style={[styles.toggleText, view === 'list' && styles.toggleTextActive]}>
            📋 Liste
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, view === 'map' && styles.toggleBtnActive]}
          onPress={() => setView('map')}
        >
          <Text style={[styles.toggleText, view === 'map' && styles.toggleTextActive]}>
            🗺️ Carte
          </Text>
        </TouchableOpacity>
      </View>

      {/* Vue carte */}
      {view === 'map' && location && (
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            showsUserLocation
            showsMyLocationButton
          >
            {/* Cercle rayon */}
            <Circle
              center={{ latitude: location.latitude, longitude: location.longitude }}
              radius={MAX_RADIUS}
              fillColor="rgba(99,102,241,0.08)"
              strokeColor="rgba(99,102,241,0.3)"
              strokeWidth={1}
            />

            {/* Markers des files */}
            {queues.map((queue) => (
              <Marker
                key={queue.id}
                coordinate={{ latitude: queue.latitude, longitude: queue.longitude }}
                title={queue.name}
                description={`${queue.waiting_count} en attente · ${queue.distance_meters}m`}
                pinColor="#6366f1"
                onCalloutPress={() => router.push(`/queue/${queue.id}`)}
              />
            ))}
          </MapView>

          {/* Légende */}
          <View style={styles.mapLegend}>
            <Text style={styles.mapLegendText}>
              📍 {queues.length} file(s) dans un rayon de {MAX_RADIUS / 1000}km
            </Text>
          </View>
        </View>
      )}

      {/* Vue liste */}
      {view === 'list' && (
        <>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#6366f1" />
          ) : queues.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>
                Aucune file dans un rayon de {MAX_RADIUS / 1000}km
              </Text>
            </View>
          ) : (
            <FlatList
              data={queues}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => router.push(`/queue/${item.id}`)}
                >
                  <View style={styles.cardLeft}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    <Text style={styles.cardDistance}>📍 {item.distance_meters}m</Text>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={styles.cardCount}>{item.waiting_count}</Text>
                    <Text style={styles.cardCountLabel}>en attente</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, marginBottom: 16,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 2 },
  toggle: {
    flexDirection: 'row', marginHorizontal: 20, marginBottom: 16,
    backgroundColor: '#e2e8f0', borderRadius: 12, padding: 4,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10,
  },
  toggleBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  toggleText: { fontSize: 14, fontWeight: '500', color: '#64748b' },
  toggleTextActive: { color: '#1e293b', fontWeight: '700' },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  mapLegend: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  mapLegendText: { fontSize: 13, color: '#475569', textAlign: 'center', fontWeight: '500' },
  list: { paddingHorizontal: 20, gap: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardLeft: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  cardDistance: { fontSize: 13, color: '#64748b', marginTop: 4 },
  cardRight: { alignItems: 'center', marginLeft: 16 },
  cardCount: { fontSize: 28, fontWeight: '700', color: '#6366f1' },
  cardCountLabel: { fontSize: 11, color: '#94a3b8' },
  btnPrimary: {
    backgroundColor: '#6366f1', paddingHorizontal: 16,
    paddingVertical: 8, borderRadius: 10,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  btnOutline: {
    borderWidth: 1.5, borderColor: '#6366f1', paddingHorizontal: 14,
    paddingVertical: 7, borderRadius: 10,
  },
  btnOutlineText: { color: '#6366f1', fontWeight: '600', fontSize: 14 },
  signOutText: { color: '#ef4444', fontSize: 14, fontWeight: '500' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#64748b', textAlign: 'center' },
  errorText: { fontSize: 16, color: '#ef4444', fontWeight: '600' },
})