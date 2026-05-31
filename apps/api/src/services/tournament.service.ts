// E2 · Tournament Discovery & Search — Service Layer
// P5: PostgreSQL/PostGIS source of truth
// P7: All geo radius queries use ST_DWithin — never JS distance math
// P12: Pino logging on all service calls

import { prisma } from '@diamondhub/db'
import { redis } from '../lib/redis.js'
import { logger } from '../lib/logger.js'
import { geocodingService } from './geocoding.service.js'
import type { TournamentSearchParams } from '@diamondhub/contracts'
import { createHash } from 'crypto'

const CACHE_TTL_SECONDS = 3600 // 1 hour (P5)
const CACHE_PREFIX = 'tournaments:'

function buildOrderBy(sortBy: string | undefined, sortOrder: string | undefined, lat: number | undefined): string {
  const dir = sortOrder === 'desc' ? 'DESC' : 'ASC'
  switch (sortBy) {
    case 'distance': return lat !== undefined ? `distance_meters ${dir}` : `t.start_date ${dir}`
    case 'entryFee': return `t.entry_fee ${dir}`
    default: return `t.start_date ${dir}` // 'date'
  }
}

export const tournamentService = {
  // E2-S1/S2: Search with PostGIS radius query (P7)
  async search(
    params: TournamentSearchParams & { lat?: number; lng?: number },
    userId?: string,
  ) {
    // Resolve coordinates from zip if lat/lng not provided
    let lat = params.lat
    let lng = params.lng

    if ((!lat || !lng) && params.zip) {
      const geo = geocodingService.geocodeZip(params.zip)
      if (geo) {
        lat = geo.lat
        lng = geo.lng
      }
    }

    // Cache key based on search params hash (P5)
    const cacheKey =
      CACHE_PREFIX +
      createHash('md5')
        .update(JSON.stringify({ ...params, userId: undefined }))
        .digest('hex')

    const cached = await redis.get(cacheKey)
    if (cached) {
      logger.info({ cacheKey }, 'Tournament search cache hit')
      return JSON.parse(cached)
    }

    const radiusMeters = geocodingService.getRadiusMeters(params.radiusMiles ?? 50)
    const page = params.page ?? 1
    const limit = params.limit ?? 20
    const offset = (page - 1) * limit

    // Build WHERE clauses
    const whereParts: string[] = ["t.is_published = true", "t.status != 'CANCELLED'"]
    const values: (string | number | Date | string[])[] = []
    let paramIdx = 1

    // Track which parameter indices hold lng/lat for the SELECT distance calculation
    let lngParamIdx: number | null = null
    let latParamIdx: number | null = null

    if (lat !== undefined && lng !== undefined) {
      lngParamIdx = paramIdx
      latParamIdx = paramIdx + 1
      whereParts.push(`ST_DWithin(
        ST_MakePoint(t.lng::float8, t.lat::float8)::geography,
        ST_MakePoint($${paramIdx++}::float8, $${paramIdx++}::float8)::geography,
        $${paramIdx++}::float8
      )`)
      values.push(lng, lat, radiusMeters)
    }

    if (params.startDate) {
      whereParts.push(`t.end_date >= $${paramIdx++}::timestamptz`)
      values.push(new Date(params.startDate))
    }
    if (params.endDate) {
      whereParts.push(`t.start_date <= $${paramIdx++}::timestamptz`)
      values.push(new Date(params.endDate))
    }
    if (params.sport) {
      whereParts.push(`t.sport = $${paramIdx++}::sport`)
      values.push(params.sport)
    }
    if (params.ageDivisions && params.ageDivisions.length > 0) {
      whereParts.push(`t.age_divisions && $${paramIdx++}::text[]`)
      values.push(params.ageDivisions)
    }
    if (params.organizers && params.organizers.length > 0) {
      whereParts.push(`t.organizer = ANY($${paramIdx++}::text[])`)
      values.push(params.organizers)
    }
    if (params.entryFeeMin !== undefined) {
      whereParts.push(`t.entry_fee >= $${paramIdx++}`)
      values.push(params.entryFeeMin)
    }
    if (params.entryFeeMax !== undefined) {
      whereParts.push(`t.entry_fee <= $${paramIdx++}`)
      values.push(params.entryFeeMax)
    }
    if (params.surface) {
      whereParts.push(`t.surface = $${paramIdx++}`)
      values.push(params.surface)
    }
    if (params.format) {
      whereParts.push(`t.format = $${paramIdx++}`)
      values.push(params.format)
    }

    const whereClause = whereParts.join(' AND ')
    // Use parameterized $N references for lat/lng to avoid SQL injection (P8)
    const distanceSelect =
      lngParamIdx !== null && latParamIdx !== null
        ? `, ST_Distance(ST_MakePoint(t.lng::float8, t.lat::float8)::geography, ST_MakePoint($${lngParamIdx}::float8, $${latParamIdx}::float8)::geography)::float AS distance_meters`
        : ', null::float AS distance_meters'

    const countQuery = `SELECT COUNT(*)::int AS total FROM tournaments t WHERE ${whereClause}`
    const dataQuery = `
      SELECT
        t.id, t.name, t.organizer, t.sport, t.age_divisions,
        t.format, t.start_date, t.end_date, t.city, t.state,
        t.entry_fee, t.max_teams, t.current_teams, t.status,
        t.data_source, t.registration_url, t.lat, t.lng
        ${distanceSelect}
      FROM tournaments t
      WHERE ${whereClause}
      ORDER BY ${buildOrderBy(params.sortBy, params.sortOrder, lat)}
      LIMIT ${limit} OFFSET ${offset}
    `

    logger.info({ params, lat, lng, radiusMeters }, 'Tournament search query')

    const [countResult, rows] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ total: number }>>(countQuery, ...values),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(dataQuery, ...values),
    ])

    const total = countResult[0]?.total ?? 0
    const tournaments = rows.map((row) => ({
      id: row['id'],
      name: row['name'],
      organizer: row['organizer'],
      sport: row['sport'],
      ageDivisions: row['age_divisions'],
      format: row['format'],
      startDate: (row['start_date'] as Date).toISOString(),
      endDate: (row['end_date'] as Date).toISOString(),
      city: row['city'],
      state: row['state'],
      entryFee: Number(row['entry_fee']),
      maxTeams: row['max_teams'] as number | null,
      currentTeams: Number(row['current_teams']),
      spotsRemaining:
        row['max_teams'] !== null
          ? Math.max(0, Number(row['max_teams']) - Number(row['current_teams']))
          : null,
      status: row['status'],
      dataSource: row['data_source'],
      registrationUrl: row['registration_url'] as string | null,
      lat: Number(row['lat']),
      lng: Number(row['lng']),
      distanceMeters: row['distance_meters'] as number | null,
    }))

    const result = {
      tournaments,
      total,
      page,
      limit,
      hasMore: offset + tournaments.length < total,
    }

    // Cache result (P5: Redis, 1h TTL)
    await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result))
    logger.info({ total, page, limit }, 'Tournament search completed, result cached')
    return result
  },

  // E2-S4: Tournament detail
  async getById(id: string, userId?: string) {
    logger.info({ id, userId }, 'Fetching tournament detail')

    const tournament = await prisma.tournament.findUnique({
      where: { id, isPublished: true },
    })
    if (!tournament) return null

    const [isBookmarked, isFollowing] = await Promise.all([
      userId
        ? prisma.tournamentBookmark.findUnique({
            where: { userId_tournamentId: { userId, tournamentId: id } },
          })
        : null,
      userId
        ? prisma.tournamentFollower.findFirst({
            where: { tournamentId: id, userId },
          })
        : null,
    ])

    return {
      id: tournament.id,
      name: tournament.name,
      organizer: tournament.organizer,
      sport: tournament.sport,
      ageDivisions: tournament.ageDivisions,
      format: tournament.format,
      startDate: tournament.startDate.toISOString(),
      endDate: tournament.endDate.toISOString(),
      registrationDeadline: tournament.registrationDeadline?.toISOString() ?? null,
      city: tournament.city,
      state: tournament.state,
      address: tournament.address,
      zip: tournament.zip,
      entryFee: Number(tournament.entryFee),
      maxTeams: tournament.maxTeams,
      currentTeams: tournament.currentTeams,
      spotsRemaining:
        tournament.maxTeams !== null
          ? Math.max(0, tournament.maxTeams - tournament.currentTeams)
          : null,
      fieldsCount: tournament.fieldsCount,
      surface: tournament.surface,
      hotelDealUrl: tournament.hotelDealUrl,
      registrationUrl: tournament.registrationUrl,
      sourceUrl: tournament.sourceUrl,
      umpireInfo: tournament.umpireInfo,
      notes: tournament.notes,
      status: tournament.status,
      dataSource: tournament.dataSource,
      lat: Number(tournament.lat),
      lng: Number(tournament.lng),
      isBookmarked: !!isBookmarked,
      isFollowing: !!isFollowing,
    }
  },

  // E2-S5: Bookmark
  async bookmark(userId: string, tournamentId: string) {
    logger.info({ userId, tournamentId }, 'Bookmarking tournament')
    await prisma.tournamentBookmark.upsert({
      where: { userId_tournamentId: { userId, tournamentId } },
      update: {},
      create: { userId, tournamentId },
    })
  },

  async unbookmark(userId: string, tournamentId: string) {
    logger.info({ userId, tournamentId }, 'Removing tournament bookmark')
    await prisma.tournamentBookmark.deleteMany({ where: { userId, tournamentId } })
  },

  async getBookmarks(userId: string) {
    logger.info({ userId }, 'Fetching tournament bookmarks')
    const bookmarks = await prisma.tournamentBookmark.findMany({
      where: { userId },
      include: { tournament: true },
      orderBy: { createdAt: 'desc' },
    })
    return bookmarks.map((b) => ({
      id: b.tournament.id,
      name: b.tournament.name,
      organizer: b.tournament.organizer,
      sport: b.tournament.sport,
      ageDivisions: b.tournament.ageDivisions,
      format: b.tournament.format,
      startDate: b.tournament.startDate.toISOString(),
      endDate: b.tournament.endDate.toISOString(),
      city: b.tournament.city,
      state: b.tournament.state,
      entryFee: Number(b.tournament.entryFee),
      maxTeams: b.tournament.maxTeams,
      currentTeams: b.tournament.currentTeams,
      spotsRemaining:
        b.tournament.maxTeams !== null
          ? Math.max(0, b.tournament.maxTeams - b.tournament.currentTeams)
          : null,
      status: b.tournament.status,
      dataSource: b.tournament.dataSource,
      registrationUrl: b.tournament.registrationUrl,
      lat: Number(b.tournament.lat),
      lng: Number(b.tournament.lng),
      bookmarkedAt: b.createdAt.toISOString(),
    }))
  },

  // E2-S7: Follow (guest or user)
  async follow(tournamentId: string, userId?: string, guestToken?: string) {
    if (!userId && !guestToken) throw new Error('Must provide userId or guestToken')
    logger.info({ tournamentId, userId, guestToken: guestToken ? '[present]' : undefined }, 'Following tournament')

    const existing = await prisma.tournamentFollower.findFirst({
      where: userId ? { tournamentId, userId } : { tournamentId, guestToken },
    })
    if (existing) return existing

    return prisma.tournamentFollower.create({
      data: {
        tournamentId,
        userId: userId ?? null,
        guestToken: guestToken ?? null,
      },
    })
  },

  async unfollow(tournamentId: string, userId?: string, guestToken?: string) {
    logger.info({ tournamentId, userId }, 'Unfollowing tournament')
    if (userId) {
      await prisma.tournamentFollower.deleteMany({ where: { tournamentId, userId } })
    } else if (guestToken) {
      await prisma.tournamentFollower.deleteMany({ where: { tournamentId, guestToken } })
    }
  },

  // E2-S6: This Weekend
  async getThisWeekend(lat: number | undefined, lng: number | undefined, userId?: string) {
    // Calculate current weekend (Fri–Sun)
    const now = new Date()
    const day = now.getDay() // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat

    // Days until next Friday (or 0 if today is Friday)
    let daysToFriday: number
    if (day === 5) {
      daysToFriday = 0
    } else if (day === 6) {
      daysToFriday = 6
    } else {
      // Sun=0 → 5 days, Mon=1 → 4 days, Tue=2 → 3 days, Wed=3 → 2 days, Thu=4 → 1 day
      daysToFriday = 5 - day
    }

    const friday = new Date(now)
    friday.setDate(now.getDate() + daysToFriday)
    friday.setHours(0, 0, 0, 0)

    const sunday = new Date(friday)
    sunday.setDate(friday.getDate() + 2)
    sunday.setHours(23, 59, 59, 999)

    logger.info({ lat, lng, friday, sunday }, 'Fetching this-weekend tournaments')

    return this.search(
      {
        ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
        radiusMiles: 50,
        startDate: friday.toISOString(),
        endDate: sunday.toISOString(),
        page: 1,
        limit: 10,
      },
      userId,
    )
  },

  // E2-S8: Search history
  async saveSearch(userId: string, params: Partial<TournamentSearchParams>) {
    const pref = await prisma.userSearchPreference.findUnique({ where: { userId } })
    const history: unknown[] = pref ? (pref.savedSearches as unknown[]) : []
    const newHistory = [
      { ...params, savedAt: new Date().toISOString() },
      ...history.slice(0, 4), // keep last 5
    ]
    await prisma.userSearchPreference.upsert({
      where: { userId },
      update: { savedSearches: newHistory },
      create: { userId, savedSearches: newHistory },
    })
  },

  async getSearchHistory(userId: string) {
    const pref = await prisma.userSearchPreference.findUnique({ where: { userId } })
    return pref ? (pref.savedSearches as unknown[]) : []
  },

  // E12: Admin CRUD operations
  async createTournament(data: any, createdById: string) {
    const { CreateTournamentSchema } = await import('@diamondhub/contracts')
    const parsed = CreateTournamentSchema.parse(data)
    return prisma.tournament.create({
      data: {
        ...parsed,
        startDate: new Date(parsed.startDate),
        endDate: new Date(parsed.endDate),
        registrationDeadline: parsed.registrationDeadline ? new Date(parsed.registrationDeadline) : null,
        entryFee: parsed.entryFee ?? 0,
        surface: parsed.surface ?? 'GRASS',
        fieldsCount: parsed.fieldsCount ?? 1,
        dataSource: 'MANUAL',
        isPublished: false,
      }
    })
  },

  async updateTournament(id: string, data: any) {
    const existing = await prisma.tournament.findUnique({ where: { id }, select: { dataSource: true } })
    if (!existing) throw new Error('NOT_FOUND')
    // P10: Never overwrite PARTNER data
    if (existing.dataSource === 'PARTNER') throw new Error('PARTNER_DATA_IMMUTABLE')
    return prisma.tournament.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        registrationDeadline: data.registrationDeadline ? new Date(data.registrationDeadline) : undefined,
        updatedAt: new Date(),
      }
    })
  },

  async deleteTournament(id: string) {
    await prisma.tournament.update({ where: { id }, data: { status: 'CANCELLED' } })
  },

  async publishTournament(id: string) {
    return prisma.tournament.update({ where: { id }, data: { isPublished: true, status: 'OPEN' } })
  },
}
