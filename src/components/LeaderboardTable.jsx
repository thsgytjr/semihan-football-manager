// src/components/LeaderboardTable.jsx
import React from 'react'
import InitialAvatar from './InitialAvatar'
import Medal from './ranking/Medal'
import FormDots from './ranking/FormDots'
import { rankTone } from '../lib/rankingUtils'

/**
 * Generic leaderboard table component
 * @param {Object} props
 * @param {Array} props.rows - Data rows to display
 * @param {boolean} props.showAll - Whether to show all rows or limit to 5
 * @param {Function} props.onToggle - Callback for show all/less toggle
 * @param {ReactNode} props.controls - Control elements (date selector, toggle buttons)
 * @param {string} props.title - Table title/header text
 * @param {Array} props.columns - Column configuration array
 * @param {Function} props.renderRow - Function to render table row cells
 */
export default function LeaderboardTable({ 
  rows, 
  showAll, 
  onToggle, 
  controls, 
  title,
  columns = [],
  renderRow
}) {
  const data = showAll ? rows : rows.slice(0, 5)
  const totalPlayers = rows.length

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th colSpan={columns.length} className="border-b px-2 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-stone-600">
                  {title} <span className="font-semibold">{totalPlayers}</span>명
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
                표시할 기록이 없습니다.
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
    <td className={`border-b align-middle px-1.5 py-1.5 ${tone.cellBg}`}>
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
 */
export function PlayerNameCell({ id, name, isGuest, tone }) {
  return (
    <td className={`border-b px-2 py-1.5 ${tone.cellBg}`}>
      <div className="flex items-center gap-2">
        <InitialAvatar id={id} name={name} size={20} badges={isGuest ? ['G'] : []} />
        <span className="font-medium truncate">{name}</span>
      </div>
    </td>
  )
}

/**
 * Standard numeric stat cell
 */
export function StatCell({ value, tone, bold = true, align = 'left' }) {
  return (
    <td className={`border-b px-2 py-1.5 ${bold ? 'font-semibold' : ''} tabular-nums ${
      align === 'center' ? 'text-center' : 
      align === 'right' ? 'text-right' : 'text-left'
    } ${tone.cellBg}`}>
      {value}
    </td>
  )
}

/**
 * Standard form dots cell
 */
export function FormDotsCell({ form, tone }) {
  return (
    <td className={`border-b px-2 py-1.5 ${tone.cellBg}`}>
      <div className="flex justify-center">
        <FormDots form={form || []} />
      </div>
    </td>
  )
}
