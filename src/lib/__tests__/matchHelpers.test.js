// src/lib/__tests__/matchHelpers.test.js
/**
 * matchHelpers.js 테스트
 * 
 * 목적: 모든 레거시 데이터 구조에서 헬퍼가 정상 작동하는지 검증
 */

import {
  isDraftMatch,
  getCaptains,
  getCaptainForTeam,
  hasCaptains,
  getQuarterScores,
  hasQuarterScores,
  getWinnerIndex,
  getMatchWinner,
  isPlayerOnWinningTeam,
  isPlayerCaptain,
  didCaptainWin
} from '../matchHelpers'

describe('isDraftMatch', () => {
  test('selectionMode === "draft"인 경우', () => {
    expect(isDraftMatch({ selectionMode: 'draft' })).toBe(true)
  })

  test('draftMode === true인 경우 (레거시)', () => {
    expect(isDraftMatch({ draftMode: true })).toBe(true)
  })

  test('draft.quarterScores가 있는 경우', () => {
    expect(isDraftMatch({ 
      draft: { quarterScores: [[1, 2]] } 
    })).toBe(true)
  })

  test('quarterScores가 최상위에 있는 경우 (레거시)', () => {
    expect(isDraftMatch({ 
      quarterScores: [[1, 2]] 
    })).toBe(true)
  })

  test('selectionMode === "manual"인 경우', () => {
    expect(isDraftMatch({ selectionMode: 'manual' })).toBe(false)
  })

  test('빈 객체인 경우', () => {
    expect(isDraftMatch({})).toBe(false)
  })

  test('null/undefined인 경우', () => {
    expect(isDraftMatch(null)).toBe(false)
    expect(isDraftMatch(undefined)).toBe(false)
  })
})

describe('getCaptains', () => {
  test('draft.captains에서 가져오기 (최신)', () => {
    const match = {
      draft: { captains: ['p1', 'p2'] },
      captainIds: ['old1', 'old2'], // 무시됨
      captains: ['legacy1', 'legacy2'] // 무시됨
    }
    expect(getCaptains(match)).toEqual(['p1', 'p2'])
  })

  test('captainIds에서 가져오기 (중간)', () => {
    const match = {
      captainIds: ['p1', 'p2'],
      captains: ['legacy1', 'legacy2'] // 무시됨
    }
    expect(getCaptains(match)).toEqual(['p1', 'p2'])
  })

  test('captains에서 가져오기 (레거시)', () => {
    const match = {
      captains: ['p1', 'p2']
    }
    expect(getCaptains(match)).toEqual(['p1', 'p2'])
  })

  test('숫자 ID를 문자열로 변환', () => {
    const match = {
      draft: { captains: [123, 456] }
    }
    expect(getCaptains(match)).toEqual(['123', '456'])
  })

  test('없으면 빈 배열', () => {
    expect(getCaptains({})).toEqual([])
    expect(getCaptains(null)).toEqual([])
  })
})

describe('getCaptainForTeam', () => {
  const match = {
    draft: { captains: ['p1', 'p2', 'p3'] }
  }

  test('유효한 팀 인덱스', () => {
    expect(getCaptainForTeam(match, 0)).toBe('p1')
    expect(getCaptainForTeam(match, 1)).toBe('p2')
    expect(getCaptainForTeam(match, 2)).toBe('p3')
  })

  test('범위 밖 인덱스', () => {
    expect(getCaptainForTeam(match, 3)).toBe(null)
    expect(getCaptainForTeam(match, -1)).toBe(null)
  })

  test('주장이 null인 경우', () => {
    const matchWithNull = {
      draft: { captains: ['p1', null, 'p3'] }
    }
    expect(getCaptainForTeam(matchWithNull, 1)).toBe(null)
  })
})

describe('hasCaptains', () => {
  test('주장이 있으면 true', () => {
    expect(hasCaptains({ draft: { captains: ['p1'] } })).toBe(true)
  })

  test('주장이 모두 null이면 false', () => {
    expect(hasCaptains({ draft: { captains: [null, null] } })).toBe(false)
  })

  test('빈 배열이면 false', () => {
    expect(hasCaptains({ draft: { captains: [] } })).toBe(false)
  })

  test('주장 데이터가 없으면 false', () => {
    expect(hasCaptains({})).toBe(false)
  })
})

describe('getQuarterScores', () => {
  test('draft.quarterScores에서 가져오기 (최신)', () => {
    const match = {
      draft: { quarterScores: [[1, 2], [3, 4]] },
      quarterScores: [[9, 9]] // 무시됨
    }
    expect(getQuarterScores(match)).toEqual([[1, 2], [3, 4]])
  })

  test('quarterScores 2차원 배열 (레거시)', () => {
    const match = {
      quarterScores: [[1, 2], [3, 4]]
    }
    expect(getQuarterScores(match)).toEqual([[1, 2], [3, 4]])
  })

  test('quarterScores { teamScores } 형식 (레거시)', () => {
    const match = {
      quarterScores: [
        { teamScores: [1, 2] },
        { teamScores: [3, 4] }
      ]
    }
    expect(getQuarterScores(match)).toEqual([[1, 2], [3, 4]])
  })

  test('scores를 단일 쿼터로 변환', () => {
    const match = {
      scores: [5, 6]
    }
    expect(getQuarterScores(match)).toEqual([[5, 6]])
  })

  test('없으면 빈 배열', () => {
    expect(getQuarterScores({})).toEqual([])
    expect(getQuarterScores(null)).toEqual([])
  })
})

describe('getWinnerIndex', () => {
  test('2팀 - 팀0 승리', () => {
    const qs = [[5, 3], [2, 1]]
    expect(getWinnerIndex(qs)).toBe(0) // 7 vs 4
  })

  test('2팀 - 팀1 승리', () => {
    const qs = [[1, 2], [3, 5]]
    expect(getWinnerIndex(qs)).toBe(1) // 4 vs 7
  })

  test('무승부', () => {
    const qs = [[3, 3], [2, 2]]
    expect(getWinnerIndex(qs)).toBe(null) // 5 vs 5
  })

  test('3팀 경기', () => {
    const qs = [[1, 2, 3], [2, 1, 4]]
    expect(getWinnerIndex(qs)).toBe(2) // 3, 3, 7
  })

  test('빈 배열', () => {
    expect(getWinnerIndex([])).toBe(null)
  })
})

describe('getMatchWinner', () => {
  test('매치에서 승자 찾기', () => {
    const match = {
      draft: { quarterScores: [[5, 3]] }
    }
    expect(getMatchWinner(match)).toBe(0)
  })

  test('쿼터 점수 없으면 null', () => {
    expect(getMatchWinner({})).toBe(null)
  })
})

describe('isPlayerOnWinningTeam', () => {
  const match = {
    draft: { quarterScores: [[5, 3]] },
    snapshot: [
      ['p1', 'p2'],
      ['p3', 'p4']
    ]
  }

  test('승자 팀 선수', () => {
    expect(isPlayerOnWinningTeam(match, 'p1')).toBe(true)
    expect(isPlayerOnWinningTeam(match, 'p2')).toBe(true)
  })

  test('패자 팀 선수', () => {
    expect(isPlayerOnWinningTeam(match, 'p3')).toBe(false)
    expect(isPlayerOnWinningTeam(match, 'p4')).toBe(false)
  })

  test('무승부', () => {
    const draw = {
      draft: { quarterScores: [[3, 3]] },
      snapshot: [['p1'], ['p2']]
    }
    expect(isPlayerOnWinningTeam(draw, 'p1')).toBe(false)
  })
})

describe('isPlayerCaptain', () => {
  const match = {
    draft: { captains: ['p1', 'p3'] }
  }

  test('주장인 선수', () => {
    expect(isPlayerCaptain(match, 'p1')).toBe(true)
    expect(isPlayerCaptain(match, 'p3')).toBe(true)
  })

  test('주장이 아닌 선수', () => {
    expect(isPlayerCaptain(match, 'p2')).toBe(false)
    expect(isPlayerCaptain(match, 'p99')).toBe(false)
  })

  test('숫자 ID도 문자열로 비교', () => {
    const match2 = {
      draft: { captains: [123, 456] }
    }
    expect(isPlayerCaptain(match2, '123')).toBe(true)
    expect(isPlayerCaptain(match2, 123)).toBe(true)
  })
})

describe('didCaptainWin', () => {
  const match = {
    draft: { 
      captains: ['p1', 'p3'],
      quarterScores: [[5, 3]]
    },
    snapshot: [
      ['p1', 'p2'],
      ['p3', 'p4']
    ]
  }

  test('주장이면서 승리한 선수', () => {
    expect(didCaptainWin(match, 'p1')).toBe(true)
  })

  test('주장이지만 패배한 선수', () => {
    expect(didCaptainWin(match, 'p3')).toBe(false)
  })

  test('주장이 아닌 선수', () => {
    expect(didCaptainWin(match, 'p2')).toBe(false)
  })
})
