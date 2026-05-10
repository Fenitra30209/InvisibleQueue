import { Stack } from 'expo-router'
import { AuthProvider } from '../context/AuthContext'

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(auth)/register" />
        <Stack.Screen name="queue/[id]" />
        <Stack.Screen name="queue/create" />
        <Stack.Screen name="queue/manage/[id]" />
      </Stack>
    </AuthProvider>
  )
}