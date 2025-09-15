// src/lib/matchLabel.js
// 월-주차 프리픽스(예: 9-2)와 함께 매치 라벨을 통일해서 만들어주는 유틸

function parseDateISO(dateISO) {
    if (!dateISO) return null
    // "YYYY-MM-DDTHH:MM" or ISO string
    const d = new Date(dateISO)
    return isNaN(d.getTime()) ? null : d
  }
  
  // Monday(월) 시작 기준 주차 계산
  function weekOfMonth(date) {
    const y = date.getFullYear()
    const m = date.getMonth() // 0-11
    const d = date.getDate()  // 1-31
    const first = new Date(y, m, 1)
    const firstDow = first.getDay() // 0=Sun ... 6=Sat
    const offset = (firstDow + 6) % 7 // 월(1) 시작으로 보정
    const w = Math.floor((d - 1 + offset) / 7) + 1
    return Math.max(1, Math.min(5, w))
  }
  
  export function monthWeekCode(dateISO) {
    const d = parseDateISO(dateISO) || new Date()
    const month = d.getMonth() + 1 // 1-12
    const wk = weekOfMonth(d)
    return `${month}-${wk}` // 예: "9-2"
  }
  
  function formatDateTimeShort(dateISO) {
    const d = parseDateISO(dateISO)
    if (!d) return ''
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const HH = String(d.getHours()).padStart(2, '0')
    const MM = String(d.getMinutes()).padStart(2, '0')
    return `${mm}/${dd}/${yyyy} ${HH}:${MM}`
  }
  
  /**
   * 매치 셀렉트/리스트에서 공통 사용 라벨
   * @param {object} m - match object (dateISO, mode, teamCount 등)
   * @param {object} opts
   *   - withDate: 날짜/시간 텍스트 포함 여부
   *   - withCount: 참석자 수 텍스트 포함 여부
   *   - count: 참석자 수 (계산되어 넘어오는 값 사용)
   */
  export function formatMatchLabel(m, opts = {}) {
    const { withDate = true, withCount = false, count = 0 } = opts
    const code = monthWeekCode(m?.dateISO)
    const bits = [code] // 항상 월-주차 프리픽스
  
    if (withDate) {
      const dt = formatDateTimeShort(m?.dateISO)
      if (dt) bits.push(dt)
    }
    if (withCount) {
      bits.push(`참석 ${count}명`)
    }
    return bits.join(' · ')
  }
  