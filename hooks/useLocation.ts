import { useEffect, useState } from 'react'
import * as Location from 'expo-location'

export interface UserLocation {
  latitude: number
  longitude: number
}

export function getDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const MAX_DISTANCE_METERS = 999999

export function useLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const start = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()

        if (status !== 'granted') {
          if (!cancelled) {
            setError('Permission de géolocalisation refusée')
            setLoading(false)
          }
          return
        }

        // Timeout de 8 secondes max
        const timeoutId = setTimeout(() => {
          if (!cancelled && loading) {
            // Position par défaut (Antananarivo) si timeout
            setLocation({ latitude: -18.8792, longitude: 47.5079 })
            setLoading(false)
          }
        }, 8000)

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low, // Low = beaucoup plus rapide
        })

        clearTimeout(timeoutId)

        if (!cancelled) {
          setLocation({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          })
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          // En cas d'erreur, position par défaut
          setLocation({ latitude: -18.8792, longitude: 47.5079 })
          setLoading(false)
        }
      }
    }

    start()
    return () => { cancelled = true }
  }, [])

  const isNearQueue = (queueLat: number, queueLon: number): boolean => {
    if (!location) return false
    return getDistance(
      location.latitude, location.longitude,
      queueLat, queueLon
    ) <= MAX_DISTANCE_METERS
  }

  return { location, error, loading, isNearQueue }
}