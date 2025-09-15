import React from "react"

export default function PitchLines(){
  return (
    <>
      {/* 바깥 라인 */}
      <div className="absolute rounded-md border border-white/80" style={{ inset: "1%" }}/>

      {/* 하프 라인 */}
      <div className="absolute left-[1%] right-[1%] top-1/2 h-px bg-white/70"/>

      {/* 센터 서클 - 언제나 완전한 원 */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80"
        style={{ width: "18%", aspectRatio: "1 / 1" }}
      />

      {/* 페널티 박스 (상/하) */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[1%] border border-white/80" style={{ width: "60%", height: "22%" }}/>
      <div className="absolute left-1/2 -translate-x-1/2 top-[1%] border border-white/80" style={{ width: "24%", height: "7%" }}/>
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[1%] border border-white/80" style={{ width: "60%", height: "22%" }}/>
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[1%] border border-white/80" style={{ width: "24%", height: "7%" }}/>
    </>
  )
}
