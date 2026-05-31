// E13 · Native Mobile — Home Screen
// Role-aware: CoachHome / ParentHome / PlayerHome
// "This Weekend Near Me" card using device location

import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth.store'
import { useLocation } from '../../hooks/useLocation'
import { apiClient } from '../../lib/apiClient'

// ── Sub-screens ────────────────────────────────────────────────────────────────

function CoachHome() {
  return (
    <View style={styles.roleCard}>
      <Text style={styles.roleEmoji}>⚾</Text>
      <Text style={styles.roleTitle}>Coach Dashboard</Text>
      <Text style={styles.roleSubtitle}>Manage your team, track attendance, and view analytics.</Text>
    </View>
  )
}

function ParentHome() {
  return (
    <View style={styles.roleCard}>
      <Text style={styles.roleEmoji}>👨‍👧</Text>
      <Text style={styles.roleTitle}>Parent Hub</Text>
      <Text style={styles.roleSubtitle}>See your player's schedule, RSVPs, and upcoming tournaments.</Text>
    </View>
  )
}

function PlayerHome() {
  return (
    <View style={styles.roleCard}>
      <Text style={styles.roleEmoji}>🏃</Text>
      <Text style={styles.roleTitle}>Player Home</Text>
      <Text style={styles.roleSubtitle}>Check your stats, upcoming games, and team news.</Text>
    </View>
  )
}

// ── Weekend Nearby Card ────────────────────────────────────────────────────────

function WeekendNearMeCard() {
  const { coords, loading: locationLoading, error: locationError } = useLocation()

  const { data: tournaments = [], isLoading } = useQuery({
    queryKey: ['nearby-tournaments', coords?.latitude, coords?.longitude],
    queryFn: () =>
      apiClient
        .get('/tournaments', {
          params: {
            lat: coords!.latitude,
            lng: coords!.longitude,
            radius: 100,
            limit: 3,
          },
        })
        .then((r) => r.data.data ?? []),
    enabled: !!coords,
    staleTime: 5 * 60 * 1000,
  })

  const handleTournamentPress = async (id: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    // Navigate to tournament detail — expo-router Link approach
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>This Weekend Near Me</Text>

      {locationLoading && (
        <View style={styles.centered}>
          <ActivityIndicator color="#3b82f6" />
          <Text style={styles.mutedText}>Getting your location…</Text>
        </View>
      )}

      {locationError && (
        <Text style={styles.mutedText}>Enable location to see nearby tournaments.</Text>
      )}

      {!locationLoading && !locationError && isLoading && (
        <ActivityIndicator color="#3b82f6" style={{ marginVertical: 8 }} />
      )}

      {!locationLoading && !locationError && !isLoading && tournaments.length === 0 && (
        <Text style={styles.mutedText}>No tournaments found within 100 miles this weekend.</Text>
      )}

      {tournaments.map((t: any) => (
        <TouchableOpacity
          key={t.id}
          style={styles.tournamentRow}
          onPress={() => handleTournamentPress(t.id)}
          accessibilityRole="button"
          accessibilityLabel={`View ${t.name}`}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.tournamentName}>{t.name}</Text>
            <Text style={styles.tournamentMeta}>
              {t.city}, {t.state} · {t.ageDivisions?.join(', ')}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

// ── Home Screen ────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const activeRole = useAuthStore((s: any) => s.activeRole)
  const user = useAuthStore((s: any) => s.user)

  const role = activeRole?.role ?? 'PLAYER'
  const greeting = user?.name ? `Hey, ${user.name.split(' ')[0]}!` : 'Welcome back!'

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>{greeting}</Text>
        <Text style={styles.subGreeting}>
          {role === 'COACH'
            ? 'Coach view'
            : role === 'PARENT'
            ? 'Parent view'
            : 'Player view'}
        </Text>
      </View>

      {/* Role-specific section */}
      {role === 'COACH' && <CoachHome />}
      {role === 'PARENT' && <ParentHome />}
      {role === 'PLAYER' && <PlayerHome />}

      {/* Weekend near me */}
      <WeekendNearMeCard />
    </ScrollView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 16,
    paddingBottom: 96,
  },
  header: {
    marginBottom: 20,
    paddingTop: Platform.OS === 'ios' ? 48 : 24,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f9fafb',
  },
  subGreeting: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  roleCard: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  roleEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  roleTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 4,
  },
  roleSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 12,
  },
  centered: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  mutedText: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
  tournamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  tournamentName: {
    color: '#f9fafb',
    fontWeight: '600',
    fontSize: 14,
  },
  tournamentMeta: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    color: '#6b7280',
    fontSize: 22,
    marginLeft: 8,
  },
})
