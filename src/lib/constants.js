// 공통 스탯 키 & 기본값
export const STAT_KEYS = ["Pace","Shooting","Passing","Dribbling","Physical","Stamina"]

export const DEFAULT_STATS = Object.fromEntries(STAT_KEYS.map(k => [k, 50]))

// 한글 라벨
export const LABELS = {
  Pace: "스피드",
  Shooting: "슛",
  Passing: "패스",
  Dribbling: "드리블",
  Physical: "피지컬",
  Stamina: "체력",
}
export const labelOf = (k) => LABELS[k] || k

// 선수 등급 옵션
export const PLAYER_GRADES = [
  { value: "pro", label: "프로선출", color: "purple" },
  { value: "semi-pro", label: "고교선출", color: "indigo" },
  { value: "amateur", label: "지역리그", color: "blue" },
  { value: "regular", label: "일반", color: "stone" },
]

// 레거시: 기존 "선수 출신" 호환을 위해 유지
export const PLAYER_ORIGINS = PLAYER_GRADES

// 기존 태그를 새 등급으로 마이그레이션
export const migrateOriginToGrade = (oldValue) => {
  const mapping = {
    'pro': 'pro',           // 프로 → Pro
    'semi-pro': 'semi-pro', // 고교선출 → Semi-Pro
    'amateur': 'amateur',   // 지역리그 → Amateur (수정: 기존에는 semi-pro로 잘못 변환됨)
    'college': 'amateur',   // 대학팀 → Amateur
    'none': 'regular',      // 일반 → Regular
  }
  return mapping[oldValue] || oldValue
}

export const getOriginLabel = (value) => {
  // 레거시 값 자동 변환
  const migratedValue = migrateOriginToGrade(value)
  const grade = PLAYER_GRADES.find(g => g.value === migratedValue)
  return grade ? grade.label : "Regular"
}

export const getOriginColor = (value) => {
  // 레거시 값 자동 변환
  const migratedValue = migrateOriginToGrade(value)
  const grade = PLAYER_GRADES.find(g => g.value === migratedValue)
  return grade ? grade.color : "stone"
}

// 상세 포지션 정의
export const DETAILED_POSITIONS = {
  GK: [
    { value: 'GK', label: 'GK', fullLabel: '골키퍼' }
  ],
  DF: [
    { value: 'RB', label: 'RB', fullLabel: '오른쪽 풀백' },
    { value: 'RWB', label: 'RWB', fullLabel: '오른쪽 윙백' },
    { value: 'CB', label: 'CB', fullLabel: '센터백' },
    { value: 'LB', label: 'LB', fullLabel: '왼쪽 풀백' },
    { value: 'LWB', label: 'LWB', fullLabel: '왼쪽 윙백' },
  ],
  MF: [
    { value: 'CDM', label: 'CDM', fullLabel: '수비형 미드필더' },
    { value: 'CM', label: 'CM', fullLabel: '중앙 미드필더' },
    { value: 'CAM', label: 'CAM', fullLabel: '공격형 미드필더' },
    { value: 'RM', label: 'RM', fullLabel: '오른쪽 미드필더' },
    { value: 'LM', label: 'LM', fullLabel: '왼쪽 미드필더' },
  ],
  FW: [
    { value: 'RW', label: 'RW', fullLabel: '오른쪽 윙어' },
    { value: 'ST', label: 'ST', fullLabel: '스트라이커' },
    { value: 'CF', label: 'CF', fullLabel: '중앙 포워드' },
    { value: 'LW', label: 'LW', fullLabel: '왼쪽 윙어' },
  ]
}

// 모든 상세 포지션 배열 (정렬/검색용)
export const ALL_DETAILED_POSITIONS = [
  ...DETAILED_POSITIONS.GK,
  ...DETAILED_POSITIONS.DF,
  ...DETAILED_POSITIONS.MF,
  ...DETAILED_POSITIONS.FW,
]

// 포지션 값으로 라벨 가져오기
export const getPositionLabel = (value) => {
  const pos = ALL_DETAILED_POSITIONS.find(p => p.value === value)
  return pos ? pos.label : value
}

// 포지션 값으로 풀 라벨 가져오기
export const getPositionFullLabel = (value) => {
  const pos = ALL_DETAILED_POSITIONS.find(p => p.value === value)
  return pos ? pos.fullLabel : value
}

// 포지션 값으로 카테고리 가져오기 (GK/DF/MF/FW)
export const getPositionCategory = (value) => {
  if (DETAILED_POSITIONS.GK.some(p => p.value === value)) return 'GK'
  if (DETAILED_POSITIONS.DF.some(p => p.value === value)) return 'DF'
  if (DETAILED_POSITIONS.MF.some(p => p.value === value)) return 'MF'
  if (DETAILED_POSITIONS.FW.some(p => p.value === value)) return 'FW'
  return null
}

// 포지션 배열에서 주 카테고리 가져오기 (정렬용)
export const getPrimaryCategory = (positions) => {
  if (!positions || positions.length === 0) return 'OTHER'
  const categories = positions.map(p => getPositionCategory(p)).filter(Boolean)
  if (categories.length === 0) return 'OTHER'
  // GK > DF > MF > FW 우선순위
  if (categories.includes('GK')) return 'GK'
  if (categories.includes('DF')) return 'DF'
  if (categories.includes('MF')) return 'MF'
  if (categories.includes('FW')) return 'FW'
  return 'OTHER'
}

// 레거시 position 필드를 positions 배열로 변환
export const migratePositionToPositions = (player) => {
  // 이미 positions 배열이 있으면 그대로 반환
  if (player.positions && Array.isArray(player.positions) && player.positions.length > 0) {
    return player.positions
  }
  
  // 레거시 position 필드가 있으면 변환
  if (player.position) {
    const pos = String(player.position).toUpperCase()
    // 이미 상세 포지션이면 그대로 사용
    if (ALL_DETAILED_POSITIONS.some(p => p.value === pos)) {
      return [pos]
    }
    // 카테고리만 있으면 첫 번째 상세 포지션 사용
    if (pos === 'GK') return ['GK']
    if (pos === 'DF') return ['CB']
    if (pos === 'MF') return ['CM']
    if (pos === 'FW') return ['ST']
  }
  
  return []
}

// Player Status
export const PLAYER_STATUS = [
  { value: 'active', label: '활동적', color: 'emerald' },
  { value: 'recovering', label: '회복중', color: 'red' },
  { value: 'inactive', label: '휴면', color: 'stone' },
  { value: 'suspended', label: '출전정지', color: 'amber' },
  { value: 'nocontact', label: '연락두절', color: 'slate' },
  { value: 'system', label: '시스템 계정', color: 'stone' },
]

export function getPlayerStatusLabel(status) {
  const found = PLAYER_STATUS.find(s => s.value === status)
  return found ? found.label : '활동적'
}

export function getPlayerStatusColor(status) {
  const found = PLAYER_STATUS.find(s => s.value === status)
  return found ? found.color : 'emerald'
}

// 커스텀 태그 색상 옵션
export const TAG_COLORS = [
  { value: 'red', label: '빨강', class: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'orange', label: '주황', class: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'amber', label: '노랑', class: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'emerald', label: '초록', class: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'blue', label: '파랑', class: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'purple', label: '보라', class: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'pink', label: '핑크', class: 'bg-pink-100 text-pink-800 border-pink-200' },
  { value: 'stone', label: '회색', class: 'bg-stone-100 text-stone-800 border-stone-200' },
]

export const getTagColorClass = (color) => {
  // 커스텀 hex 색상 체크
  if (color && color.startsWith('#')) {
    return '' // 인라인 스타일로 처리
  }
  const tag = TAG_COLORS.find(t => t.value === color)
  return tag ? tag.class : 'bg-stone-100 text-stone-800 border-stone-200'
}
