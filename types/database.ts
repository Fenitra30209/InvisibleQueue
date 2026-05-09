export type QueueStatus = 'waiting' | 'served' | 'missed' | 'removed'

export interface Profile {
  id: string
  name: string
  email: string
  created_at: string
}

export interface Queue {
  id: string
  name: string
  owner_id: string
  latitude: number
  longitude: number
  is_active: boolean
  created_at: string
  // champ calculé côté client
  distance_meters?: number
  waiting_count?: number
}

export interface QueueEntry {
  id: string
  queue_id: string
  user_id: string | null
  guest_name: string | null
  guest_email: string | null
  position: number
  status: QueueStatus
  missed_count: number
  joined_at: string
  updated_at: string
}