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

// 선수 출신 옵션
export const PLAYER_ORIGINS = [
  { value: "pro", label: "프로", color: "purple" },
  { value: "amateur", label: "아마추어", color: "blue" },
  { value: "college", label: "대학팀", color: "emerald" },
  { value: "none", label: "일반", color: "stone" },
]

export const getOriginLabel = (value) => {
  const origin = PLAYER_ORIGINS.find(o => o.value === value)
  return origin ? origin.label : "일반"
}

export const getOriginColor = (value) => {
  const origin = PLAYER_ORIGINS.find(o => o.value === value)
  return origin ? origin.color : "stone"
}
