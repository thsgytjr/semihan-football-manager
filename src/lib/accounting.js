// src/lib/accounting.js
// 회계 관리 기능
import { supabase } from './supabaseClient'
import { STORAGE_PREFIX } from './teamConfig'
import { logger } from './logger'

// ---------------- Mock routing helper ----------------
function isMockMode() {
  try {
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    if (!isLocal) return false
    const usp = new URLSearchParams(window.location.search)
    // ?nomock 이 있으면 실제 DB 사용, 없으면 로컬 Mock 사용
    return !usp.has('nomock')
  } catch {
    return false
  }
}

// 팀별 로컬 스토리지 키(세미한/디케이에스씨 등 테넌트 분리)
const LS_KEY = `${STORAGE_PREFIX}accounting`
function loadLS() {
  const raw = localStorage.getItem(LS_KEY)
  if (!raw) return { payments: [], dues_settings: [], match_payments: [] }
  try { return JSON.parse(raw) } catch { return { payments: [], dues_settings: [], match_payments: [] } }
}
function saveLS(db) {
  localStorage.setItem(LS_KEY, JSON.stringify(db))
}
function uuid() { return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) }

/**
 * 결제 내역 조회
 */
export async function listPayments({ playerId, paymentType, startDate, endDate, matchId } = {}) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      let list = [...(db.payments || [])]
      if (playerId) list = list.filter(p => p.player_id === playerId)
      if (paymentType) list = list.filter(p => p.payment_type === paymentType)
      if (matchId) list = list.filter(p => p.match_id === matchId)
      if (startDate) list = list.filter(p => String(p.payment_date) >= startDate)
      if (endDate) list = list.filter(p => String(p.payment_date) <= endDate)
      // players join은 UI에서 선수 배열을 통해 해결 (mock에선 생략)
      return list.sort((a,b)=> new Date(b.payment_date)-new Date(a.payment_date))
    }
    let query = supabase
      .from('payments')
      .select('*, players(id, name, membership)')
      .order('payment_date', { ascending: false })

    if (playerId) query = query.eq('player_id', playerId)
    if (paymentType) query = query.eq('payment_type', paymentType)
    if (matchId) query = query.eq('match_id', matchId)
    if (startDate) query = query.gte('payment_date', startDate)
    if (endDate) query = query.lte('payment_date', endDate)

    const { data, error } = await query

    if (error) throw error
    return data || []
  } catch (error) {
    logger.error('[Accounting] Failed to list payments:', error)
    throw error
  }
}

/**
 * 결제 내역 추가
 */
// 입력된 날짜 문자열을 안전한 ISO 문자열(Z 포함)로 정규화
function normalizePaymentDate(input) {
  try {
    if (!input) return new Date().toISOString()
    // 이미 타임존 정보가 있는 경우 그대로 Date로 파싱하여 ISO 반환
    if (/[zZ]|[\+\-]\d{2}:?\d{2}$/.test(input)) {
      const d = new Date(input)
      if (!isNaN(d)) return d.toISOString()
    }
    // YYYY-MM-DD만 있는 경우: 전세계 타임존에서 날짜가 바뀌지 않도록 UTC 정오로 설정
    const dateOnlyMatch = String(input).match(/^\d{4}-\d{2}-\d{2}$/)
    if (dateOnlyMatch) {
      const [y, m, d] = input.split('-').map(Number)
      const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
      return utc.toISOString()
    }
    // datetime-local(YYYY-MM-DDTHH:mm) 형태는 로컬 기준으로 파싱 후 ISO로 변환
    const d = new Date(input)
    if (!isNaN(d)) return d.toISOString()
  } catch {}
  return new Date().toISOString()
}

export async function addPayment(payment) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      const row = {
        id: uuid(),
        player_id: payment.playerId,
        payment_type: payment.paymentType,
        amount: payment.amount,
  payment_date: normalizePaymentDate(payment.paymentDate),
        payment_method: payment.paymentMethod || 'venmo',
        match_id: payment.matchId || null,
        notes: payment.notes || '',
        verified_by: payment.verifiedBy || null,
        verified_at: payment.verifiedAt || null
      }
      db.payments = [row, ...(db.payments||[])]
      saveLS(db)
      return row
    }
    const { data, error } = await supabase
      .from('payments')
      .insert([{
        player_id: payment.playerId,
        payment_type: payment.paymentType,
        amount: payment.amount,
  payment_date: normalizePaymentDate(payment.paymentDate),
        payment_method: payment.paymentMethod || 'venmo',
        match_id: payment.matchId || null,
        notes: payment.notes || '',
        verified_by: payment.verifiedBy || null,
        verified_at: payment.verifiedAt || null
      }])
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    logger.error('[Accounting] Failed to add payment:', error)
    throw error
  }
}

/**
 * 결제 내역 수정
 */
export async function updatePayment(id, updates) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      db.payments = (db.payments||[]).map(p => p.id === id ? { ...p, ...updates } : p)
      saveLS(db)
      return db.payments.find(p => p.id === id)
    }
    const { data, error } = await supabase
      .from('payments')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    logger.error('[Accounting] Failed to update payment:', error)
    throw error
  }
}

/**
 * 결제 내역 삭제
 */
export async function deletePayment(id) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      db.payments = (db.payments||[]).filter(p => p.id !== id)
      saveLS(db)
      return
    }
    const { error } = await supabase
      .from('payments')
      .delete()
      .eq('id', id)

    if (error) throw error
  } catch (error) {
    logger.error('[Accounting] Failed to delete payment:', error)
    throw error
  }
}

// 필터 기반 대량 삭제 (전역 삭제 포함)
export async function deletePaymentsByFilter({ playerId, paymentType, matchId, startDate, endDate } = {}) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      db.payments = (db.payments||[]).filter(p => {
        if (playerId && p.player_id !== playerId) return true
        if (paymentType && p.payment_type !== paymentType) return true
        if (matchId && p.match_id !== matchId) return true
        if (startDate && String(p.payment_date) < startDate) return true
        if (endDate && String(p.payment_date) > endDate) return true
        return false // 제거 대상
      })
      saveLS(db)
      return { ok: true }
    }

    let query = supabase.from('payments').delete()
    if (playerId) query = query.eq('player_id', playerId)
    if (paymentType) query = query.eq('payment_type', paymentType)
    if (matchId) query = query.eq('match_id', matchId)
    if (startDate) query = query.gte('payment_date', startDate)
    if (endDate) query = query.lte('payment_date', endDate)

    const { error } = await query
    if (error) throw error
    return { ok: true }
  } catch (error) {
    logger.error('[Accounting] Failed to bulk delete payments:', error)
    throw error
  }
}

/**
 * 회비 설정 조회
 */
export async function getDuesSettings() {
  try {
    if (isMockMode()) {
      const db = loadLS()
      return (db.dues_settings||[]).filter(d => d.is_active !== false)
    }
    const { data, error } = await supabase
      .from('dues_settings')
      .select('*')
      .eq('is_active', true)
      .order('setting_type')

    if (error) throw error
    return data || []
  } catch (error) {
    logger.error('[Accounting] Failed to get dues settings:', error)
    return []
  }
}

/**
 * 회비 기본값이 없으면 자동으로 삽입 (가입비 $10, 월 $5, 연 $50)
 */
export async function ensureDuesDefaults() {
  try {
    if (isMockMode()) {
      const db = loadLS()
      const have = new Set((db.dues_settings||[]).map(d => d.setting_type))
      if (!have.has('registration_fee')) db.dues_settings.push({ id: uuid(), setting_type: 'registration_fee', amount: 10.00, description: '정회원 가입비 (1회)', effective_date: new Date().toISOString(), is_active: true })
      if (!have.has('monthly_dues')) db.dues_settings.push({ id: uuid(), setting_type: 'monthly_dues', amount: 5.00, description: '월회비 (기본 $5)', effective_date: new Date().toISOString(), is_active: true })
      if (!have.has('annual_dues')) db.dues_settings.push({ id: uuid(), setting_type: 'annual_dues', amount: 50.00, description: '연회비 (월 납부 대비 $10 할인)', effective_date: new Date().toISOString(), is_active: true })
      saveLS(db)
      return true
    }
    // 실제 DB
    const { data, error } = await supabase.from('dues_settings').select('setting_type')
    if (error) throw error
    const have = new Set((data || []).map(d => d.setting_type))
    const toInsert = []
    if (!have.has('registration_fee')) toInsert.push({ setting_type: 'registration_fee', amount: 10.00, description: '정회원 가입비 (1회)', effective_date: new Date().toISOString() })
    if (!have.has('monthly_dues')) toInsert.push({ setting_type: 'monthly_dues', amount: 5.00, description: '월회비 (기본 $5)', effective_date: new Date().toISOString() })
    if (!have.has('annual_dues')) toInsert.push({ setting_type: 'annual_dues', amount: 50.00, description: '연회비 (월 납부 대비 $10 할인)', effective_date: new Date().toISOString() })
    if (toInsert.length === 0) return true
    const { error: insErr } = await supabase.from('dues_settings').insert(toInsert)
    if (insErr) throw insErr
    return true
  } catch (err) {
    logger.error('[Accounting] Failed to ensure dues defaults:', err)
    return false
  }
}

/**
 * 회비 설정 업데이트
 */
export async function updateDuesSetting(settingType, amount, description) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      db.dues_settings = (db.dues_settings||[]).map(s => s.setting_type === settingType ? { ...s, amount, description, effective_date: new Date().toISOString() } : s)
      saveLS(db)
      return db.dues_settings.find(s => s.setting_type === settingType)
    }
    const { data, error } = await supabase
      .from('dues_settings')
      .update({
        amount,
        description,
        effective_date: new Date().toISOString()
      })
      .eq('setting_type', settingType)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    logger.error('[Accounting] Failed to update dues setting:', error)
    throw error
  }
}

/**
 * 매치별 구장비 납부 현황 조회
 */
export async function getMatchPayments(matchId) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      return (db.match_payments||[]).filter(r => r.match_id === matchId).sort((a,b)=>String(a.payment_status).localeCompare(String(b.payment_status)))
    }
    const { data, error } = await supabase
      .from('match_payments')
      .select('*, players(id, name, membership)')
      .eq('match_id', matchId)
      .order('payment_status')

    if (error) throw error
    return data || []
  } catch (error) {
    logger.error('[Accounting] Failed to get match payments:', error)
    return []
  }
}

/**
 * 매치 구장비 납부 현황 생성/업데이트
 */
export async function upsertMatchPayment(matchPayment) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      const key = (r) => r.match_id === matchPayment.matchId && r.player_id === matchPayment.playerId
      const existing = (db.match_payments||[]).find(key)
      if (existing) {
        Object.assign(existing, {
          expected_amount: matchPayment.expectedAmount,
          paid_amount: matchPayment.paidAmount || existing.paid_amount || 0,
          payment_status: matchPayment.paymentStatus || existing.payment_status || 'pending',
          payment_date: matchPayment.paymentDate || existing.payment_date || null,
          deadline: matchPayment.deadline || existing.deadline || null,
          notes: matchPayment.notes || existing.notes || ''
        })
      } else {
        (db.match_payments ||= []).push({
          id: uuid(),
          match_id: matchPayment.matchId,
          player_id: matchPayment.playerId,
          expected_amount: matchPayment.expectedAmount,
          paid_amount: matchPayment.paidAmount || 0,
          payment_status: matchPayment.paymentStatus || 'pending',
          payment_date: matchPayment.paymentDate || null,
          deadline: matchPayment.deadline || null,
          notes: matchPayment.notes || ''
        })
      }
      saveLS(db)
      return true
    }
    const { data, error } = await supabase
      .from('match_payments')
      .upsert({
        match_id: matchPayment.matchId,
        player_id: matchPayment.playerId,
        expected_amount: matchPayment.expectedAmount,
        paid_amount: matchPayment.paidAmount || 0,
        payment_status: matchPayment.paymentStatus || 'pending',
        payment_date: matchPayment.paymentDate || null,
        deadline: matchPayment.deadline || null,
        notes: matchPayment.notes || ''
      }, {
        onConflict: 'match_id,player_id'
      })
      .select()

    if (error) throw error
    return data
  } catch (error) {
    logger.error('[Accounting] Failed to upsert match payment:', error)
    throw error
  }
}

// 매치 구장비 행 완전 삭제 (match_payments + payments 동시 정리)
export async function hardDeleteMatchPayment(matchId, playerId) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      db.match_payments = (db.match_payments||[]).filter(r => !(r.match_id === matchId && r.player_id === playerId))
      db.payments = (db.payments||[]).filter(p => !(p.match_id === matchId && p.player_id === playerId && p.payment_type === 'match_fee'))
      saveLS(db)
      return { ok: true }
    }

    const [{ error: mpError }, { error: pError }] = await Promise.all([
      supabase
        .from('match_payments')
        .delete()
        .eq('match_id', matchId)
        .eq('player_id', playerId),
      supabase
        .from('payments')
        .delete()
        .eq('match_id', matchId)
        .eq('player_id', playerId)
        .eq('payment_type', 'match_fee')
    ])

    if (mpError) throw mpError
    if (pError) throw pError
    return { ok: true }
  } catch (error) {
    logger.error('[Accounting] Failed to hard-delete match payment:', error)
    throw error
  }
}

/**
 * 선수별 납부 통계 조회
 */
export async function getPlayerPaymentStats(playerId) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      const list = (db.payments||[]).filter(p => p.player_id === playerId)
      const stats = {
        registration: { paid: false, amount: 0 },
        monthlyDues: { totalPaid: 0, count: 0 },
        annualDues: { totalPaid: 0, count: 0 },
        matchFees: { totalPaid: 0, count: 0 },
        total: 0
      }
      list.forEach(payment => {
        const amount = parseFloat(payment.amount)
        stats.total += amount
        switch (payment.payment_type) {
          case 'registration':
            stats.registration.paid = true
            stats.registration.amount = amount
            break
          case 'monthly_dues':
            stats.monthlyDues.totalPaid += amount
            stats.monthlyDues.count += 1
            break
          case 'annual_dues':
            stats.annualDues.totalPaid += amount
            stats.annualDues.count += 1
            break
          case 'match_fee':
            stats.matchFees.totalPaid += amount
            stats.matchFees.count += 1
            break
        case 'reimbursement':
            // 상환은 비용이므로 총계에서 차감
            stats.total -= amount
            if (!stats.reimbursements) stats.reimbursements = { totalPaid: 0, count: 0 }
            stats.reimbursements.totalPaid += amount
            stats.reimbursements.count += 1
            break
        }
      })
      return stats
    }
    const { data, error } = await supabase
      .from('payments')
      .select('payment_type, amount')
      .eq('player_id', playerId)

    if (error) throw error

    const stats = {
      registration: { paid: false, amount: 0 },
      monthlyDues: { totalPaid: 0, count: 0 },
      annualDues: { totalPaid: 0, count: 0 },
      matchFees: { totalPaid: 0, count: 0 },
      total: 0
    }

    data.forEach(payment => {
      const amount = parseFloat(payment.amount)
      stats.total += amount

      switch (payment.payment_type) {
        case 'registration':
          stats.registration.paid = true
          stats.registration.amount = amount
          break
        case 'monthly_dues':
          stats.monthlyDues.totalPaid += amount
          stats.monthlyDues.count += 1
          break
        case 'annual_dues':
          stats.annualDues.totalPaid += amount
          stats.annualDues.count += 1
          break
        case 'match_fee':
          stats.matchFees.totalPaid += amount
          stats.matchFees.count += 1
          break
      }
    })

    return stats
  } catch (error) {
    logger.error('[Accounting] Failed to get player payment stats:', error)
    return null
  }
}

/**
 * 전체 회계 요약 (총무용)
 */
export async function getAccountingSummary({ startDate, endDate } = {}) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      let data = [...(db.payments||[])]
      if (startDate) data = data.filter(p => String(p.payment_date) >= startDate)
      if (endDate) data = data.filter(p => String(p.payment_date) <= endDate)
      const summary = {
        totalRevenue: 0,
        registrationFees: { total: 0, count: 0 },
        monthlyDues: { total: 0, count: 0 },
        annualDues: { total: 0, count: 0 },
        matchFees: { total: 0, count: 0 },
        otherIncome: { total: 0, count: 0 },
        expenses: { total: 0, count: 0 }
      }
      data.forEach(payment => {
        const amount = parseFloat(payment.amount)
        
        // 지출은 비용이므로 수익에서 차감, 나머지는 수익에 추가
        if (payment.payment_type === 'expense') {
          summary.totalRevenue -= amount
        } else {
          summary.totalRevenue += amount
        }
        
        switch (payment.payment_type) {
          case 'registration': summary.registrationFees.total += amount; summary.registrationFees.count += 1; break
          case 'monthly_dues': summary.monthlyDues.total += amount; summary.monthlyDues.count += 1; break
          case 'annual_dues': summary.annualDues.total += amount; summary.annualDues.count += 1; break
          case 'match_fee': summary.matchFees.total += amount; summary.matchFees.count += 1; break
          case 'other_income':
            summary.otherIncome.total += amount
            summary.otherIncome.count += 1
            break
          case 'expense':
            summary.expenses.total += amount
            summary.expenses.count += 1
            break
        }
      })
      return summary
    }
    let query = supabase.from('payments').select('payment_type, amount, payment_date')

    if (startDate) query = query.gte('payment_date', startDate)
    if (endDate) query = query.lte('payment_date', endDate)

    const { data, error } = await query

    if (error) throw error

    const summary = {
      totalRevenue: 0,
      registrationFees: { total: 0, count: 0 },
      monthlyDues: { total: 0, count: 0 },
      annualDues: { total: 0, count: 0 },
      matchFees: { total: 0, count: 0 },
      otherIncome: { total: 0, count: 0 },
      expenses: { total: 0, count: 0 }
    }

    data.forEach(payment => {
      const amount = parseFloat(payment.amount)
      
      // 지출은 비용이므로 수익에서 차감, 나머지는 수익에 추가
      if (payment.payment_type === 'expense') {
        summary.totalRevenue -= amount
      } else {
        summary.totalRevenue += amount
      }

      switch (payment.payment_type) {
        case 'registration':
          summary.registrationFees.total += amount
          summary.registrationFees.count += 1
          break
        case 'monthly_dues':
          summary.monthlyDues.total += amount
          summary.monthlyDues.count += 1
          break
        case 'annual_dues':
          summary.annualDues.total += amount
          summary.annualDues.count += 1
          break
        case 'match_fee':
          summary.matchFees.total += amount
          summary.matchFees.count += 1
          break
        case 'other_income':
          summary.otherIncome.total += amount
          summary.otherIncome.count += 1
          break
        case 'expense':
          summary.expenses.total += amount
          summary.expenses.count += 1
          break
      }
    })

    return summary
  } catch (error) {
    logger.error('[Accounting] Failed to get accounting summary:', error)
    throw error
  }
}

/**
 * 매치 구장비 자동 생성 (예정된 매치 생성 시 호출)
 */
export async function createMatchPaymentRecords(matchId, participantIds, feePerPerson, deadline) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      const records = participantIds.map(playerId => ({
        id: uuid(),
        match_id: matchId,
        player_id: playerId,
        expected_amount: feePerPerson,
        paid_amount: 0,
        payment_status: 'pending',
        deadline: deadline || null
      }))
      (db.match_payments ||= [])
      // upsert by (match_id, player_id)
      records.forEach(r => {
        const i = db.match_payments.findIndex(x => x.match_id === r.match_id && x.player_id === r.player_id)
        if (i >= 0) db.match_payments[i] = { ...db.match_payments[i], ...r }
        else db.match_payments.push(r)
      })
      saveLS(db)
      return records
    }
    const records = participantIds.map(playerId => ({
      match_id: matchId,
      player_id: playerId,
      expected_amount: feePerPerson,
      paid_amount: 0,
      payment_status: 'pending',
      deadline: deadline || null
    }))

    const { data, error } = await supabase
      .from('match_payments')
      .upsert(records, { onConflict: 'match_id,player_id' })
      .select()

    if (error) throw error
    return data
  } catch (error) {
    logger.error('[Accounting] Failed to create match payment records:', error)
    throw error
  }
}

/**
 * 구장비 납부 확인 및 payment 테이블에 기록
 */
export async function confirmMatchPayment(matchId, playerId, amount, paymentMethod = 'venmo', verifiedBy = null) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      const row = (db.match_payments||[]).find(r => r.match_id === matchId && r.player_id === playerId)
      if (row) {
        row.paid_amount = amount
        row.payment_status = 'paid'
        row.payment_date = new Date().toISOString()
      } else {
        (db.match_payments ||= []).push({ id: uuid(), match_id: matchId, player_id: playerId, expected_amount: amount, paid_amount: amount, payment_status: 'paid', payment_date: new Date().toISOString() })
      }
      // match_id + player_id + match_fee 중복 방지: 기존 항목 제거 후 추가
      db.payments = (db.payments || []).filter(p => !(p.match_id === matchId && p.player_id === playerId && p.payment_type === 'match_fee'))
      ;(db.payments ||= []).push({ id: uuid(), player_id: playerId, payment_type: 'match_fee', amount, payment_method: paymentMethod, match_id: matchId, verified_by: verifiedBy, verified_at: new Date().toISOString(), payment_date: new Date().toISOString() })
      saveLS(db)
      return { ok: true }
    }
    // 1. match_payments 업데이트 또는 생성 (upsert)
    const { data: matchPayment, error: mpError } = await supabase
      .from('match_payments')
      .upsert({
        match_id: matchId,
        player_id: playerId,
        expected_amount: amount,
        paid_amount: amount,
        payment_status: 'paid',
        payment_date: new Date().toISOString()
      }, {
        onConflict: 'match_id,player_id'
      })
      .select()
      .single()

    if (mpError) throw mpError

    // 2. payments 테이블에 기록
    // 2. payments 테이블에 기록 (중복 방지: match_id + player_id + payment_type)
    const { data: payment, error: pError } = await supabase
      .from('payments')
      .upsert({
        player_id: playerId,
        payment_type: 'match_fee',
        amount: amount,
        payment_method: paymentMethod,
        match_id: matchId,
        verified_by: verifiedBy,
        verified_at: new Date().toISOString(),
        payment_date: new Date().toISOString()
      }, {
        onConflict: 'match_id,player_id,payment_type'
      })
      .select()
      .single()

    if (pError) throw pError

    return { matchPayment, payment }
  } catch (error) {
    logger.error('[Accounting] Failed to confirm match payment:', error)
    throw error
  }
}

/**
 * 구장비 납부 취소 (실수로 확인한 경우)
 */
export async function cancelMatchPayment(matchId, playerId) {
  try {
    if (isMockMode()) {
      const db = loadLS()
      // match_payments에서 미납으로 되돌림
      const row = (db.match_payments||[]).find(r => r.match_id === matchId && r.player_id === playerId)
      if (row) {
        row.paid_amount = 0
        row.payment_status = 'pending'
        row.payment_date = null
      }
      // payments 테이블에서 해당 기록 삭제
      db.payments = (db.payments||[]).filter(p => !(p.match_id === matchId && p.player_id === playerId && p.payment_type === 'match_fee'))
      saveLS(db)
      return { ok: true }
    }
    
    // 1. match_payments 미납으로 되돌림
    const { error: mpError } = await supabase
      .from('match_payments')
      .update({
        paid_amount: 0,
        payment_status: 'pending',
        payment_date: null
      })
      .eq('match_id', matchId)
      .eq('player_id', playerId)

    if (mpError) throw mpError

    // 2. payments 테이블에서 해당 기록 삭제
    const { error: pError } = await supabase
      .from('payments')
      .delete()
      .eq('match_id', matchId)
      .eq('player_id', playerId)
      .eq('payment_type', 'match_fee')

    if (pError) throw pError

    return { ok: true }
  } catch (error) {
    logger.error('[Accounting] Failed to cancel match payment:', error)
    throw error
  }
}

// payments + match_payments 전역 삭제 (필터 없음) — 위험 영역용
export async function deleteAllPaymentsAndMatchPayments() {
  try {
    if (isMockMode()) {
      const db = loadLS()
      db.payments = []
      db.match_payments = []
      saveLS(db)
      return { ok: true }
    }

    const [{ error: mpError }, { error: pError }] = await Promise.all([
      supabase.from('match_payments').delete().not('id', 'is', null),
      supabase.from('payments').delete().not('id', 'is', null)
    ])

    if (mpError) throw mpError
    if (pError) throw pError
    return { ok: true }
  } catch (error) {
    logger.error('[Accounting] Failed to wipe payments tables:', error)
    throw error
  }
}

/**
 * 전체 선수의 최근 월/연/가입비 결제 날짜와 다음 리뉴얼 예정일 반환
 */
export async function getDuesRenewals(players = []) {
  const ids = players.map(p => p.id).filter(Boolean)
  const buildEmpty = () => ({
    lastMonthly: null,
    nextMonthly: null,
    lastAnnual: null,
    nextAnnual: null,
    registrationPaidAt: null
  })
  const byPlayer = new Map(ids.map(id => [id, buildEmpty()]))
  const applyLatest = (list) => {
    for (const p of list) {
      const bag = byPlayer.get(p.player_id) || buildEmpty()
      const dt = new Date(p.payment_date)
      if (p.payment_type === 'monthly_dues') {
        if (!bag.lastMonthly || new Date(bag.lastMonthly) < dt) bag.lastMonthly = dt.toISOString()
      }
      if (p.payment_type === 'annual_dues') {
        if (!bag.lastAnnual || new Date(bag.lastAnnual) < dt) bag.lastAnnual = dt.toISOString()
      }
      if (p.payment_type === 'registration') {
        if (!bag.registrationPaidAt || new Date(bag.registrationPaidAt) < dt) bag.registrationPaidAt = dt.toISOString()
      }
      byPlayer.set(p.player_id, bag)
    }
    // compute next dates
    for (const [id, bag] of byPlayer) {
      if (bag.lastMonthly) {
        const d = new Date(bag.lastMonthly)
        d.setMonth(d.getMonth() + 1)
        bag.nextMonthly = d.toISOString()
      }
      if (bag.lastAnnual) {
        const d = new Date(bag.lastAnnual)
        d.setFullYear(d.getFullYear() + 1)
        bag.nextAnnual = d.toISOString()
      }
    }
  }

  if (ids.length === 0) {
    return {}
  }

  if (isMockMode()) {
    const db = loadLS()
    const list = (db.payments||[]).filter(p => ['monthly_dues', 'annual_dues', 'registration'].includes(p.payment_type))
    applyLatest(list)
    return Object.fromEntries(byPlayer)
  }

  // 실제 DB: 필요한 타입만 가져와서 클라이언트에서 그룹핑
  const { data, error } = await supabase
    .from('payments')
    .select('player_id, payment_type, payment_date')
    .in('player_id', ids)
    .in('payment_type', ['monthly_dues','annual_dues','registration'])
  if (error) {
    logger.error('[Accounting] Failed to get dues renewals:', error)
    return Object.fromEntries(byPlayer)
  }
  applyLatest(data || [])
  return Object.fromEntries(byPlayer)
}
