// DEPRECATED: Use src/services/matches.service.js
// This shim re-exports the canonical service to avoid duplicate implementations.
export {
  saveMatchToDB as saveMatch,
  updateMatchInDB as updateMatch,
  deleteMatchFromDB as deleteMatch,
  listMatchesFromDB as listMatches
} from '../services/matches.service'
