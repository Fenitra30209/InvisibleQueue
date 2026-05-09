import { useEffect, useRef } from 'react'
import { Alert } from 'react-native'
import { supabase } from '../lib/supabase'

export function useQueueNotifications(
  queueId: string | null,
  userId: string | null
) {
  const lastPositionRef = useRef<number | null>(null)
  const hasNotifiedSoon = useRef(false)
  const hasNotifiedTurn = useRef(false)

  useEffect(() => {
    if (!queueId || !userId) return

    const channel = supabase
      .channel(`notif-${queueId}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'queue_entries',
          filter: `queue_id=eq.${queueId}`,
        },
        async () => {
          // Récupère ma position actuelle
          const { data } = await supabase
            .from('queue_entries')
            .select('position, status')
            .eq('queue_id', queueId)
            .eq('user_id', userId)
            .eq('status', 'waiting')
            .single()

          if (!data) return

          const position = data.position

          // Notification : bientôt ton tour (position 3)
          if (position === 3 && !hasNotifiedSoon.current) {
            hasNotifiedSoon.current = true
            Alert.alert(
              '⚡ Bientôt votre tour !',
              'Plus que 2 personnes avant vous. Préparez-vous !'
            )
          }

          // Notification : prochain (position 2)
          if (position === 2 && lastPositionRef.current !== 2) {
            Alert.alert(
              '🔔 Vous êtes le prochain !',
              'Vous êtes en 2ème position. Approchez-vous !'
            )
          }

          // Notification : c'est votre tour (position 1)
          if (position === 1 && !hasNotifiedTurn.current) {
            hasNotifiedTurn.current = true
            Alert.alert(
              '🎉 C\'est votre tour !',
              'Veuillez vous présenter maintenant.'
            )
          }

          lastPositionRef.current = position
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queueId, userId])
}