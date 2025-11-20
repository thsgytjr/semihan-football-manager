// src/components/LeaderboardTable.jsx
import React from 'react'
import { useTranslation } from 'react-i18next'
import InitialAvatar from './InitialAvatar'
import Medal from './ranking/Medal'
import FormDots from './ranking/FormDots'
import { rankTone } from '../lib/rankingUtils'
import { getMembershipBadge } from '../lib/membershipConfig'

// 멤버십 helper 함수
const S = (v) => v == null ? '' : String(v)
const isMember = (m) => {
  const s = S(m).trim().toLowerCase()
  return s === 'member' || s.includes('정회원')
}
const isAssociate = (m) => {
  const s = S(m).trim().toLowerCase()
  return s === 'associate' || s.includes('준회원')
}
const isGuest = (m) => {
  const s = S(m).trim().toLowerCase()
  return s === 'guest' || s.includes('게스트')
}

// 커스텀 멤버십 기반 배지 가져오기
const getBadgesWithCustom = (membership, customMemberships = []) => {
  const badgeInfo = getMembershipBadge(membership, customMemberships)
  return badgeInfo ? [badgeInfo.badge] : []
}

/**
 * Generic leaderboard table component
 */
export default function LeaderboardTable({ 
  rows, 
  showAll, 
  onToggle, 
  controls, 
  title,
  columns = [],
  renderRow,
  membershipSettings = []
}) {
  const { t } = useTranslation()
  const customMemberships = membershipSettings.length > 0 ? membershipSettings : []
  const data = showAll ? rows : rows.slice(0, 5)
  const totalPlayers = rows.length

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 scrollbar-hide">
      <table className="w-full text-sm" style={{ minWidth: '100%' }}>
        <thead>
          <tr>
            <th colSpan={columns.length} className="border-b px-2 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-stone-600">
                  {title} <span className="font-semibold">{totalPlayers}</span>{t('leaderboard.playersCount')}
                </div>
                <div className="ml-auto">{controls}</div>
              </div>
            </th>
          </tr>
          <tr className="text-left text-[13px] text-stone-600">
            {columns.map((col, idx) => (
              <th 
                key={idx}
                className={`border-b px-${col.px || 2} py-1.5 ${
                  col.align === 'center' ? 'text-center' : 
                  col.align === 'right' ? 'text-right' : 'text-left'
                } ${col.className || ''}`}
                onClick={col.onClick}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((r, idx) => {
            const tone = rankTone(r.rank)
            return (
              <tr key={r.id || idx} className={`${tone.rowBg}`}>
                {renderRow(r, tone, idx)}
              </tr>
            )
          })}
          {data.length === 0 && (
            <tr>
              <td className="px-3 py-4 text-sm text-stone-500" colSpan={columns.length}>
                {t('leaderboard.noData')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Standard rank cell with medal and number
 */
export function RankCell({ rank, tone, delta }) {
  return (
    <td className={`border-b align-middle px-1.5 py-1.5 ${tone.cellBg}`} style={{ width: '60px', minWidth: '60px', maxWidth: '60px' }}>
      <div className="grid items-center" style={{ gridTemplateColumns: '16px 1fr 22px', columnGap: 4 }}>
        <div className="flex items-center justify-center">
          <Medal rank={rank} />
        </div>
        <div className="text-center tabular-nums">{rank}</div>
        <div className="text-right">
          {delta && delta.diff !== 0 ? (
            <span className={`inline-block min-w-[20px] text-[11px] font-medium ${delta.dir === 'up' ? 'text-emerald-700' : 'text-rose-700'}`}>
              {delta.dir === 'up' ? '▲' : '▼'} {Math.abs(delta.diff)}
            </span>
          ) : (
            <span className="inline-block min-w-[20px] text-[11px] text-transparent">0</span>
          )}
        </div>
      </div>
    </td>
  )
}

/**
 * Standard player name cell with avatar
 * - 모바일: 한글 3글자 정도 보이고 '…' 처리, hover/focus 시 가로 스크롤 가능
 * - 데스크탑(md 이상): 전체 이름 항상 표시 (overflow-visible)
 * - 스크롤 시 높이 요동 방지를 위해 고정 라인-박스 + stable scrollbar gutter
 */
export function PlayerNameCell({ id, name, isGuest, membership, tone, photoUrl, customMemberships = [], onSelect }) {
  // membership prop이 있으면 커스텀 배지 사용, 없으면 isGuest prop 사용 (하위 호환성)
  const badges = membership ? getBadgesWithCustom(membership, customMemberships) : (isGuest ? ['G'] : [])
  const badgeInfo = membership ? getMembershipBadge(membership, customMemberships) : null
  const selectable = typeof onSelect === 'function'

  const handleSelect = () => {
    if (!selectable) return
    onSelect({ id, name, membership, isGuest: !!isGuest, photoUrl })
  }

  const Wrapper = selectable ? 'button' : 'div'
  const wrapperProps = selectable
    ? {
        type: 'button',
        onClick: handleSelect,
        className: 'group flex w-full items-center gap-1.5 rounded-xl px-0 py-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
      }
    : {
        className: 'flex items-center gap-1.5',
      }
  
  return (
    <td className={`border-b px-2 py-1.5 ${tone.cellBg}`}>
      <Wrapper {...wrapperProps}>
        <div className="flex items-center gap-1.5 min-w-0 w-[88px] sm:w-[140px] lg:w-auto lg:max-w-[250px]">
        <div className="flex-shrink-0">
          <InitialAvatar 
            id={id} 
            name={name} 
            size={32} 
            badges={badges} 
            photoUrl={photoUrl} 
            customMemberships={customMemberships}
            badgeInfo={badgeInfo}
          />
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide">
          <span 
            className="font-medium text-sm whitespace-nowrap notranslate" 
            title={name}
            translate="no"
            data-player-name
          >
            {name}
          </span>
        </div>
        </div>
      </Wrapper>
    </td>
  )
}/**
 * Standard numeric stat cell
 */
export function StatCell({ value, tone, bold = true, align = 'left', width }) {
  const inlineStyle = width ? { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` } : {}
  return (
    <td 
      className={`border-b px-2 py-1.5 ${bold ? 'font-semibold' : ''} tabular-nums ${
        align === 'center' ? 'text-center' : 
        align === 'right' ? 'text-right' : 'text-left'
      } ${tone.cellBg}`}
      style={inlineStyle}
    >
      {value}
    </td>
  )
}

/**
 * Standard form dots cell
 */
export function FormDotsCell({ form, tone }) {
  return (
    <td className={`border-b px-2 py-1.5 ${tone.cellBg}`} style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}>
      <div className="flex justify-center">
        <FormDots form={form || []} />
      </div>
    </td>
  )
}
