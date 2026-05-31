// E13 · Native Mobile — Profile tab
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useAuthStore } from '../../store/auth.store'

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    logout()
  }

  return (
    <View style={styles.container}>
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarText}>
          {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
        </Text>
      </View>
      <Text style={styles.name}>{user?.name ?? 'Unknown User'}</Text>
      <Text style={styles.email}>{user?.email ?? ''}</Text>

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 80 : 48,
    padding: 24,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 32,
  },
  logoutBtn: {
    backgroundColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#4b5563',
  },
  logoutText: {
    color: '#f87171',
    fontWeight: '600',
    fontSize: 15,
  },
})
