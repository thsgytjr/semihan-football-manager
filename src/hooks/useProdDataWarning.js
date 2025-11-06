import { useMockMode } from '../context/MockModeContext'

export function useProdDataWarning() {
  const isMockMode = useMockMode()
  
  const confirmProdDataModification = async (action) => {
    // Mock 모드이면 경고 없음
    if (isMockMode) {
      return true
    }
    
    // Prod 모드이면 경고 표시
    return confirm(
      `⚠️ 경고: 실제 프로덕션 DB를 수정하려고 합니다!\n\n` +
      `작업: ${action}\n\n` +
      `정말 진행하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
    )
  }
  
  return { confirmProdDataModification, isProdMode: !isMockMode }
}
