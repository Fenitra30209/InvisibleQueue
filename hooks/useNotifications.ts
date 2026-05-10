import { useEffect, useRef } from 'react'
import { Alert } from 'react-native'
import { supabase } from '../lib/supabase'

export function useQueueNotifications(
  queueId: string | null,
  entryId: string | null  // on utilise l'ID de l'entrée directement
) {
  const hasNotified3 = useRef(false)
  const hasNotified2 = useRef(false)
  const hasNotified1 = useRef(false)

  useEffect(() => {
    if (!queueId || !entryId) return

    // Reset les notifications à chaque nouvelle entrée
    hasNotified3.current = false
    hasNotified2.current = false
    hasNotified1.current = false

    const channel = supabase
      .channel(`notif-${entryId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'queue_entries',
          filter: `id=eq.${entryId}`,
        },
        (payload) => {
          const position = payload.new?.position
          const status = payload.new?.status

          if (status !== 'waiting') return

          if (position === 3 && !hasNotified3.current) {
            hasNotified3.current = true
            Alert.alert('⚡ Bientôt votre tour !', 'Plus que 2 personnes avant vous.')
          }

          if (position === 2 && !hasNotified2.current) {
            hasNotified2.current = true
            Alert.alert('🔔 Vous êtes le prochain !', 'Approchez-vous !')
          }

          if (position === 1 && !hasNotified1.current) {
            hasNotified1.current = true
            Alert.alert('🎉 C\'est votre tour !', 'Veuillez vous présenter maintenant.')
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queueId, entryId])
}