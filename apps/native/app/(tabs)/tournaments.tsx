// E13 · Native Mobile — Tournament Search Screen
// Search input, "Near Me" button, FlatList of tournament cards

import { useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ListRenderItem,
  Platform,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from '../../hooks/useLocation'
import { apiClient } from '../../lib/apiClient'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Tournament {
  id: string
  name: string
  city: string
  state: string
  startDate: string
  endDate: string
  ageDivisions: string[]
  entryFee: number
  sport: string
  organizerName?: string
}

// ── Tournament Card ────────────────────────────────────────────────────────────

function TournamentCard({
  tournament,
  onPress,
}: {
  tournament: Tournament
  onPress: (id: string) => void
}) {
  const start = new Date(tournament.startDate)
  const end = new Date(tournament.endDate)
  const dateLabel = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(tournament.id)}
      accessibilityRole="button"
      accessibilityLabel={`View ${tournament.name}`}
      activeOpacity={0.75}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardName} numberOfLines={2}>
          {tournament.name}
        </Text>
        <Text style={styles.cardFee}>${tournament.entryFee}</Text>
      </View>
      <Text style={styles.cardMeta}>
        {tournament.city}, {tournament.state}
      </Text>
      <Text style={styles.cardMeta}>{dateLabel}</Text>
      <View style={styles.divisionRow}>
        {tournament.ageDivisions.slice(0, 4).map((d) => (
          <View key={d} style={styles.divisionBadge}>
            <Text style={styles.divisionText}>{d}</Text>
          </View>
        ))}
        {tournament.ageDivisions.length > 4 && (
          <Text style={styles.moreText}>+{tournament.ageDivisions.length - 4}</Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

// ── Tournaments Screen ─────────────────────────────────────────────────────────

export default function TournamentsScreen() {
  const [searchText, setSearchText] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [nearMeActive, setNearMeActive] = useState(false)

  const { coords, loading: locationLoading, requestLocation } = useLocation()

  // Build query params
  const queryParams = {
    ...(submittedQuery && { q: submittedQuery }),
    ...(nearMeActive && coords && { lat: coords.latitude, lng: coords.longitude, radius: 100 }),
    limit: 20,
  }

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['tournaments-search', submittedQuery, nearMeActive, coords?.latitude, coords?.longitude],
    queryFn: () => apiClient.get('/tournaments', { params: queryParams }).then((r) => r.data),
    staleTime: 2 * 60 * 1000,
  })

  const tournaments: Tournament[] = data?.data ?? []
  const total: number = data?.total ?? 0

  const handleSearch = () => {
    setNearMeActive(false)
    setSubmittedQuery(searchText.trim())
  }

  const handleNearMe = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (!coords) await requestLocation()
    setNearMeActive(true)
    setSubmittedQuery('')
    setSearchText('')
  }

  const handleCardPress = useCallback(async (id: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    // Navigate to tournament detail
    // router.push(`/tournaments/${id}`)
  }, [])

  const renderItem: ListRenderItem<Tournament> = useCallback(
    ({ item }) => <TournamentCard tournament={item} onPress={handleCardPress} />,
    [handleCardPress],
  )

  const keyExtractor = useCallback((item: Tournament) => item.id, [])

  const ListHeader = (
    <View style={styles.listHeader}>
      {/* Search row */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search tournaments…"
          placeholderTextColor="#6b7280"
          value={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={handleSearch}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Text style={styles.searchBtnText}>Go</Text>
        </TouchableOpacity>
      </View>

      {/* Near Me button */}
      <TouchableOpacity
        style={[styles.nearMeBtn, nearMeActive && styles.nearMeBtnActive]}
        onPress={handleNearMe}
        disabled={locationLoading}
        accessibilityRole="button"
        accessibilityLabel="Find tournaments near me"
      >
        {locationLoading ? (
          <ActivityIndicator size="small" color="#3b82f6" />
        ) : (
          <Text style={[styles.nearMeText, nearMeActive && styles.nearMeTextActive]}>
            📍 Near Me
          </Text>
        )}
      </TouchableOpacity>

      {/* Result count */}
      {!isLoading && (submittedQuery || nearMeActive) && (
        <Text style={styles.resultCount}>
          {total} tournament{total !== 1 ? 's' : ''} found
        </Text>
      )}
    </View>
  )

  return (
    <View style={styles.container}>
      <FlatList
        data={tournaments}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color="#3b82f6" style={{ marginTop: 32 }} />
          ) : isError ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Error loading tournaments</Text>
              <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyTitle}>No tournaments found</Text>
              <Text style={styles.emptySubtitle}>
                Try a different search or tap Near Me to find events in your area.
              </Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  listContent: {
    paddingBottom: 96,
  },
  listHeader: {
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#f9fafb',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#374151',
  },
  searchBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  searchBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  nearMeBtn: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    marginBottom: 12,
  },
  nearMeBtnActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#1e3a5f',
  },
  nearMeText: {
    color: '#9ca3af',
    fontWeight: '600',
    fontSize: 14,
  },
  nearMeTextActive: {
    color: '#60a5fa',
  },
  resultCount: {
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  cardName: {
    flex: 1,
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '700',
  },
  cardFee: {
    color: '#34d399',
    fontWeight: '700',
    fontSize: 15,
  },
  cardMeta: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 2,
  },
  divisionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  divisionBadge: {
    backgroundColor: '#1e3a5f',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  divisionText: {
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: '600',
  },
  moreText: {
    color: '#6b7280',
    fontSize: 12,
    alignSelf: 'center',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
})
