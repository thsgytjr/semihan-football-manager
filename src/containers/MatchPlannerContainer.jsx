// src/containers/MatchPlannerContainer.jsx
import { useEffect, useState } from 'react'
import MatchPlanner from '../pages/MatchPlanner'
import { saveMatch, updateMatch, deleteMatch, listMatches } from '../lib/matches.service'

// props: players 배열을 부모에서 내려주면 됩니다.
export default function MatchPlannerContainer({ players }) {
  const [matches, setMatches] = useState([])

  useEffect(() => {
    (async () => {
      try {
        const rows = await listMatches()
        setMatches(rows)
      } catch (e) {
        console.error('[listMatches]', e)
      }
    })()
  }, [])

  const onSaveMatch = async (matchObj) => {
    try {
      const row = await saveMatch(matchObj)
      setMatches(prev => [row, ...prev])
    } catch (e) {
      console.error('[saveMatch]', e)
      alert(`저장 실패: ${e.message || e}`)
    }
  }

  const onUpdateMatch = async (id, patch) => {
    try {
      const row = await updateMatch(id, patch)
      setMatches(prev => prev.map(m => m.id === id ? row : m))
    } catch (e) {
      console.error('[updateMatch]', e)
      alert(`업데이트 실패: ${e.message || e}`)
    }
  }

  const onDeleteMatch = async (id) => {
    try {
      await deleteMatch(id)
      setMatches(prev => prev.filter(m => m.id !== id))
    } catch (e) {
      console.error('[deleteMatch]', e)
      alert(`삭제 실패: ${e.message || e}`)
    }
  }

  return (
    <MatchPlanner
      players={players}
      matches={matches}
      onSaveMatch={onSaveMatch}
      onUpdateMatch={onUpdateMatch}
      onDeleteMatch={onDeleteMatch}
    />
  )
}
