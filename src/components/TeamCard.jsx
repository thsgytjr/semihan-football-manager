// src/components/TeamCard.jsx
import React from 'react'
import Card from './Card'
import { scoreBy } from '../lib/teams'
import { optimizeImageUrl } from '../utils/imageOptimization'

export default function TeamCard({ name, list, total, criterion }){
  return (
    <Card title={`${name}`} right={<div className="text-xs text-gray-500">합계: {total}</div>}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-1">선수</th>
            <th className="py-1">포지션</th>
            <th className="py-1">점수</th>
          </tr>
        </thead>
        <tbody>
          {list.map(p => {
            const avatarSrc = p.photoUrl
              ? optimizeImageUrl(p.photoUrl, { width: 64, height: 64, quality: 65 })
              : null
            return (
              <tr key={p.id} className="border-t border-gray-200">
              <td className="py-1">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
                    {avatarSrc
                      ? <img src={avatarSrc} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" width={24} height={24} />
                      : <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-500">{p.name?.[0] ?? '🙂'}</div>}
                  </div>
                  <span>{p.name}</span>
                </div>
              </td>
              <td className="py-1 text-gray-500">{p.position}</td>
              <td className="py-1">{scoreBy(p, criterion)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
