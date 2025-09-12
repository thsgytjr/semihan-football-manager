import React from "react"
export default function PitchLines(){
  return (
    <>
      <div className="absolute rounded-md border border-white/80" style={{ inset: "1%" }}/>
      <div className="absolute left-[1%] right-[1%] top-1/2 h-px bg-white/70"/>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80" style={{ width: "18%", height: "18%" }}/>
      <div className="absolute left-1/2 -translate-x-1/2 top-[1%] border border-white/80" style={{ width: "60%", height: "22%" }}/>
      <div className="absolute left-1/2 -translate-x-1/2 top-[1%] border border-white/80" style={{ width: "24%", height: "7%" }}/>
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[1%] border border-white/80" style={{ width: "60%", height: "22%" }}/>
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[1%] border border-white/80" style={{ width: "24%", height: "7%" }}/>
    </>
  )
}
