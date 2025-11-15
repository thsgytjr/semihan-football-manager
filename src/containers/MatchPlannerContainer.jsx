import { useEffect, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
import MatchPlanner from '../pages/MatchPlanner'
import { saveMatchToDB, updateMatchInDB, deleteMatchFromDB, listMatchesFromDB } from '../services/matches.service'
import { logger } from '../lib/logger'

// props: players 배열을 부모에서 내려주면 됩니다.
export default function MatchPlannerContainer({ players, isAdmin }) {
  const [matches, setMatches] = useState([])
  const [alertState, setAlertState] = useState({ open: false, title: '안내', message: '' })

  useEffect(() => {
    (async () => {
      try {
        const rows = await listMatchesFromDB()
        setMatches(rows)
      } catch (e) {
        logger.error('[listMatches]', e)
      }
    })()
  }, [])

  const onSaveMatch = async (matchObj) => {
    if(!isAdmin){ setAlertState({ open: true, title: '권한 없음', message: 'Admin만 가능합니다.' }); return }
    try {
      const row = await saveMatchToDB(matchObj)
      setMatches(prev => [row, ...prev])
    } catch (e) {
      logger.error('[saveMatch]', e)
      setAlertState({ open: true, title: '오류', message: `저장 실패: ${e.message || e}` })
    }
  }

  const onUpdateMatch = async (id, patch) => {
    try {
      const row = await updateMatchInDB(id, patch)
      setMatches(prev => prev.map(m => m.id === id ? row : m))
    } catch (e) {
      logger.error('[updateMatch]', e)
      setAlertState({ open: true, title: '오류', message: `업데이트 실패: ${e.message || e}` })
    }
  }

  const onDeleteMatch = async (id) => {
    if(!isAdmin){ setAlertState({ open: true, title: '권한 없음', message: 'Admin만 가능합니다.' }); return }
    try {
      await deleteMatchFromDB(id)
      setMatches(prev => prev.filter(m => m.id !== id))
    } catch (e) {
      logger.error('[deleteMatch]', e)
      setAlertState({ open: true, title: '오류', message: `삭제 실패: ${e.message || e}` })
    }
  }

  return (
    <>
      <MatchPlanner
        players={players}
        matches={matches}
        onSaveMatch={onSaveMatch}
        onUpdateMatch={onUpdateMatch}
        onDeleteMatch={onDeleteMatch}
        isAdmin={isAdmin}
      />
      <ConfirmDialog
        open={alertState.open}
        title={alertState.title}
        message={alertState.message}
        confirmLabel="확인"
        cancelLabel={null}
        tone="default"
        onConfirm={() => setAlertState({ open: false, title: '안내', message: '' })}
      />
    </>
  )
}
