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
