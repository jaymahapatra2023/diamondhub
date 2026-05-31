export interface CrawledTournament {
  name: string
  organizer: 'PERFECT_GAME' | 'USA_BASEBALL' | 'TRIPLE_CROWN' | 'OTHER'
  sport: 'BASEBALL' | 'SOFTBALL' | 'BOTH'
  ageDivisions: string[]
  format: 'POOL_BRACKET' | 'DOUBLE_ELIM' | 'ROUND_ROBIN' | 'SINGLE_ELIM'
  startDate: Date
  endDate: Date
  registrationDeadline?: Date
  locationName: string
  address: string
  city: string
  state: string
  zip?: string
  lat?: number
  lng?: number
  entryFee?: number
  maxTeams?: number
  registrationUrl?: string
  sourceUrl: string
  notes?: string
}

export interface CrawlResult {
  source: string
  created: number
  updated: number
  skipped: number
  errors: number
}
