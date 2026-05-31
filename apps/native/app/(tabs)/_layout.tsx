// E13 · Native Mobile — Bottom Tab Layout (expo-router)
import { Tabs } from 'expo-router'
import { Text } from 'react-native'

function TabIcon({ name, color }: { name: string; color: string }) {
  // Simple emoji fallback until a dedicated icons package is added
  const icons: Record<string, string> = {
    home: '🏠',
    search: '🔍',
    calendar: '📅',
    users: '⚾',
    user: '👤',
  }
  return <Text style={{ color, fontSize: 20 }}>{icons[name] ?? '●'}</Text>
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#6b7280',
        tabBarStyle: { backgroundColor: '#111827', borderTopColor: '#1f2937' },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tournaments"
        options={{
          title: 'Find',
          tabBarIcon: ({ color }) => <TabIcon name="search" color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color }) => <TabIcon name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="teams"
        options={{
          title: 'Teams',
          tabBarIcon: ({ color }) => <TabIcon name="users" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  )
}
