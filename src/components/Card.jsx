import React from 'react'

export default function Card({ title, right, children }){
  return (
    <section className="relative z-10 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <h2 className="text-sm font-bold tracking-wide text-gray-600">{title}</h2>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}
