// E2 · Tournament Discovery routes — all registered under /api/v1/tournaments
import type { FastifyInstance } from 'fastify'
import { searchHandler } from './search.js'
import { detailHandler, bookmarkHandler, followHandler } from './detail.js'
import { bookmarksListHandler } from './bookmarks.js'
import { thisWeekendHandler } from './this-weekend.js'
import { searchHistoryHandler } from './search-history.js'
import { authenticate, optionalAuthenticate } from '../../../middleware/authenticate.js'
import { adminCreateHandler, adminUpdateHandler, adminDeleteHandler, adminPublishHandler } from './admin.js'
import { adminCrawlHandler } from './admin-crawl.js'

export async function tournamentRoutes(app: FastifyInstance) {
  // Public routes — optional auth to enrich results for logged-in users
  app.get('/', { preHandler: optionalAuthenticate }, searchHandler)
  app.get('/this-weekend', { preHandler: optionalAuthenticate }, thisWeekendHandler)

  // Protected (requires auth — P2)
  app.get('/bookmarks', { preHandler: authenticate }, bookmarksListHandler)
  app.get('/search-history', { preHandler: authenticate }, searchHistoryHandler)

  // Public detail — optional auth so isBookmarked/isFollowing are returned for logged-in users
  app.get('/:id', { preHandler: optionalAuthenticate }, detailHandler)

  // Bookmark actions — requires auth (P2: bookmarks require auth)
  app.post('/:id/bookmark', { preHandler: authenticate }, bookmarkHandler.add)
  app.delete('/:id/bookmark', { preHandler: authenticate }, bookmarkHandler.remove)

  // Follow — no auth required (supports guest follow via guestToken), optional auth for user follows
  app.post('/:id/follow', { preHandler: optionalAuthenticate }, followHandler.add)
  app.delete('/:id/follow', { preHandler: optionalAuthenticate }, followHandler.remove)

  // E12: Admin CRUD — COACH role required (enforced in handlers)
  app.post('/admin/crawl', { preHandler: authenticate }, adminCrawlHandler)
  app.post('/admin', { preHandler: authenticate }, adminCreateHandler)
  app.patch('/admin/:id', { preHandler: authenticate }, adminUpdateHandler)
  app.delete('/admin/:id', { preHandler: authenticate }, adminDeleteHandler)
  app.post('/admin/:id/publish', { preHandler: authenticate }, adminPublishHandler)
}
