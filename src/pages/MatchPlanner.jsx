// src/pages/MatchPlanner.jsx
import React,{useEffect,useMemo,useRef,useState}from'react'
import Card from'../components/Card'
import{mkMatch,decideMode,splitKTeams,hydrateMatch}from'../lib/match'
import{overall,isUnknownPlayer}from'../lib/players'
import{notify}from'../components/Toast'
import{DndContext,DragOverlay,pointerWithin,PointerSensor,TouchSensor,useSensor,useSensors,useDroppable}from'@dnd-kit/core'
import{SortableContext,useSortable,verticalListSortingStrategy}from'@dnd-kit/sortable'
import{CSS}from'@dnd-kit/utilities'
import InitialAvatar from'../components/InitialAvatar'
import FreePitch from'../components/pitch/FreePitch'
import{assignToFormation,recommendFormation,countPositions}from'../lib/formation'
import{seededShuffle}from'../utils/random'
import SavedMatchesList from'../components/SavedMatchesList'

/* ───────── 게스트 판별/뱃지 유틸 ───────── */
const S=(v)=>v==null?'':String(v)
const isMember=(m)=>{const s=S(m).trim().toLowerCase();return s==='member'||s.includes('정회원')}
const GuestBadge=()=>(
  <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200">G</span>
)
/* ─────────────────────────────────────── */

/* ───────── 공통 요금 유틸 ───────── */
function calcFees({ total, memberCount, guestCount }) {
  total = Math.max(0, Number(total) || 0);
  const count = memberCount + guestCount;
  if (total <= 0 || count === 0) return { total, memberFee: 0, guestFee: 0 };

  // 1) 최소 단가로 시작: floor((T - 2g) / (m + g))
  let baseEach = Math.floor((total - 2 * guestCount) / count);
  if (!Number.isFinite(baseEach) || baseEach < 0) baseEach = 0;

  // 2) 게스트는 항상 멤버 +$2
  let memberFee = baseEach;
  let guestFee  = baseEach + 2;

  // 3) 모자라면 $1씩만 올려 최소 초과로 맞춤 (정확히 나누어떨어지면 딱 맞음)
  let sum = memberCount * memberFee + guestCount * guestFee;
  while (sum < total) {
    memberFee += 1;
    guestFee  = memberFee + 2;
    sum = memberCount * memberFee + guestCount * guestFee;
  }

  return { total, memberFee, guestFee };
}

const nextSaturday0630Local=()=>{const n=new Date(),d=new Date(n),dow=n.getDay();let add=(6-dow+7)%7;if(add===0){const t=new Date(n);t.setHours(6,30,0,0);if(n>t)add=7}d.setDate(n.getDate()+add);d.setHours(6,30,0,0);const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0'),H=String(d.getHours()).padStart(2,'0'),M=String(d.getMinutes()).padStart(2,'0');return`${y}-${m}-${dd}T${H}:${M}`}
const POS_ORDER=['GK','DF','MF','FW','OTHER']
const positionGroupOf=p=>{const raw=String(p.position||p.pos||'').toUpperCase();if(raw==='GK'||raw.includes('GK'))return'GK';const df=['DF','CB','LB','RB','LWB','RWB','CBR','CBL','SW'],mf=['MF','CM','DM','AM','LM','RM','CDM','CAM','RDM','LDM','RCM','LCM'],fw=['FW','ST','CF','LW','RW','RF','LF'];if(df.some(k=>raw.includes(k)))return'DF';if(mf.some(k=>raw.includes(k)))return'MF';if(fw.some(k=>raw.includes(k)))return'FW';return'OTHER'}
const posIndex=p=>POS_ORDER.indexOf(positionGroupOf(p))
const sortByOVRDescWithSeed=(list,seed=0)=>seededShuffle(list.slice(),seed||0x9e3779b1).sort((a,b)=>{
  const ovrA=isUnknownPlayer(a)?0:(b.ovr??overall(b))
  const ovrB=isUnknownPlayer(b)?0:(b.ovr??overall(b))
  return ovrB-ovrA
})
function splitKTeamsPosAware(players,k,seed=0){const teams=Array.from({length:k},()=>[]),meta=Array.from({length:k},()=>({nonGkOVR:0,counts:{GK:0,DF:0,MF:0,FW:0,OTHER:0}})),gs={GK:players.filter(p=>positionGroupOf(p)==='GK'),DF:players.filter(p=>positionGroupOf(p)==='DF'),MF:players.filter(p=>positionGroupOf(p)==='MF'),FW:players.filter(p=>positionGroupOf(p)==='FW'),OTHER:players.filter(p=>positionGroupOf(p)==='OTHER')};for(const key of Object.keys(gs))gs[key]=sortByOVRDescWithSeed(gs[key],seed+key.length);const place=key=>{const list=gs[key];let dir=1;while(list.length){const ordered=[...Array(k).keys()].sort((i,j)=>{const ci=meta[i].counts[key],cj=meta[j].counts[key];return ci!==cj?ci-cj:meta[i].nonGkOVR-meta[j].nonGkOVR}),pick=dir===1?ordered:ordered.slice().reverse();for(const ti of pick){if(!list.length)break;const p=list.shift();teams[ti].push(p);meta[ti].counts[key]++;if(key!=='GK'&&!isUnknownPlayer(p))meta[ti].nonGkOVR+=(p.ovr??overall(p))}dir*=-1}};['GK','DF','MF','FW','OTHER'].forEach(place);return{teams}}

export default function MatchPlanner({players,matches,onSaveMatch,onDeleteMatch,onUpdateMatch,isAdmin}){
  const[dateISO,setDateISO]=useState(()=>nextSaturday0630Local()),[attendeeIds,setAttendeeIds]=useState([]),[criterion,setCriterion]=useState('overall'),[teamCount,setTeamCount]=useState(2),[hideOVR,setHideOVR]=useState(false),[shuffleSeed,setShuffleSeed]=useState(0)
  const[locationPreset,setLocationPreset]=useState('coppell-west'),[locationName,setLocationName]=useState('Coppell Middle School - West'),[locationAddress,setLocationAddress]=useState('2701 Ranch Trail, Coppell, TX 75019')
  const[feeMode,setFeeMode]=useState('preset'),[customBaseCost,setCustomBaseCost]=useState(0)
  const[manualTeams,setManualTeams]=useState(null),[activePlayerId,setActivePlayerId]=useState(null),[activeFromTeam,setActiveFromTeam]=useState(null)
  const[formations,setFormations]=useState([]),[placedByTeam,setPlacedByTeam]=useState([]),latestTeamsRef=useRef([])
  const[editorOpen,setEditorOpen]=useState(false),[editingTeamIdx,setEditingTeamIdx]=useState(0),[editingMatchId,setEditingMatchId]=useState(null),[editorPlayers,setEditorPlayers]=useState([])
  const[posAware,setPosAware]=useState(true),[dropHint,setDropHint]=useState({team:null,index:null})
  const count=attendeeIds.length,autoSuggestion=decideMode(count),mode=autoSuggestion.mode,teams=Math.max(2,Math.min(10,Number(teamCount)||2)),attendees=useMemo(()=>players.filter(p=>attendeeIds.includes(p.id)),[players,attendeeIds])
  const autoSplit=useMemo(()=>posAware?splitKTeamsPosAware(attendees,teams,shuffleSeed):splitKTeams(attendees,teams,criterion),[attendees,teams,criterion,posAware,shuffleSeed])
  const skipAutoResetRef=useRef(false);useEffect(()=>{if(skipAutoResetRef.current){skipAutoResetRef.current=false;return}setManualTeams(null);setShuffleSeed(0)},[attendees,teams,criterion,posAware])

  // ✅ 프리셋 총액: Indoor=220 / Coppell=330
  const baseCost=useMemo(()=>feeMode==='custom'
    ? Math.max(0,Number(customBaseCost)||0)
    : (locationPreset==='indoor-soccer-zone'?220:locationPreset==='coppell-west'?330:0),
  [feeMode,customBaseCost,locationPreset])

  // ✅ 라이브 프리뷰 요금 (calcFees 사용)
  const liveFees=useMemo(()=>{
    const m=attendees.filter(p=>isMember(p.membership)).length
    const g=Math.max(0,attendees.length-m)
    return calcFees({ total: baseCost, memberCount: m, guestCount: g })
  },[attendees,baseCost])

  const previewTeams=useMemo(()=>{let base=manualTeams??autoSplit.teams;if(!manualTeams&&shuffleSeed)base=base.map(list=>seededShuffle(list,shuffleSeed+list.length));return base},[manualTeams,autoSplit.teams,shuffleSeed]);useEffect(()=>{latestTeamsRef.current=previewTeams},[previewTeams])
  useEffect(()=>{setFormations(prev=>[...previewTeams].map((list,i)=>prev[i]||recommendFormation({count:list.length,mode,positions:countPositions(list)})));setPlacedByTeam(prev=>{const prevArr=Array.isArray(prev)?prev:[];return previewTeams.map((list,i)=>{const existed=Array.isArray(prevArr[i])?prevArr[i]:[],byId=new Map(existed.map(p=>[String(p.id),p]));const base=assignToFormation({players:list,formation:(formations[i]||recommendFormation({count:list.length,mode,positions:countPositions(list)}))});return base.map(d=>byId.get(String(d.id))||d)})})},[previewTeams,mode]) // eslint-disable-line
  
  const toggle=id=>setAttendeeIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])

  // ✅ 저장 시 요금 계산 (calcFees 사용)
  const computeFeesAtSave = ({ baseCostValue, attendees }) => {
    const list = Array.isArray(attendees) ? attendees : []
    const m = list.filter(p => isMember(p.membership)).length
    const g = Math.max(0, list.length - m)
    return calcFees({ total: Math.max(0, Number(baseCostValue) || 0), memberCount: m, guestCount: g })
  }

  // ✅ 지도 링크 계산 (프리셋 + Other URL)
  const mapLink = useMemo(()=>{
    if (locationPreset==='indoor-soccer-zone') return 'https://maps.app.goo.gl/cud8m52vVwZJEinN8?g_st=ic'
    if (locationPreset==='coppell-west') return 'https://maps.app.goo.gl/vBLE84hRB3ez1BJy5?g_st=ic'
    if (locationPreset==='other' && /^https?:\/\//i.test(String(locationAddress||''))) return locationAddress
    return null
  },[locationPreset,locationAddress])

  function save(){
    if(!isAdmin){notify('Admin만 가능합니다.');return}
    const baseTeams=(latestTeamsRef.current&&latestTeamsRef.current.length)?latestTeamsRef.current:previewTeams
    const snapshot=baseTeams.map(team=>team.map(p=>p.id))
    const ids=snapshot.flat()
    const objs=players.filter(p=>ids.includes(p.id))
    const fees=computeFeesAtSave({baseCostValue:baseCost,attendees:objs})
    const payload={
      ...mkMatch({
        id:crypto.randomUUID?.()||String(Date.now()),
        dateISO,attendeeIds:ids,criterion:posAware?'pos-aware':criterion,players,
        selectionMode:'manual',teamCount:baseTeams.length,
        location:{preset:locationPreset,name:locationName,address:locationAddress},
        mode,snapshot,board:placedByTeam,formations,locked:true,videos:[]
      }),
      fees
    }
    onSaveMatch(payload);notify('매치가 저장되었습니다 ✅')
  }

  const allSelected=attendeeIds.length===players.length&&players.length>0
  const toggleSelectAll=()=>allSelected?setAttendeeIds([]):setAttendeeIds(players.map(p=>p.id))
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:4}}),useSensor(TouchSensor,{activationConstraint:{delay:120,tolerance:6}}))
  const findTeamIndexByItemId=itemId=>previewTeams.findIndex(list=>list.some(p=>String(p.id)===String(itemId))),findIndexInTeam=(teamIdx,id)=>(previewTeams[teamIdx]||[]).findIndex(p=>String(p.id)===String(id))
  const onDragStartHandler=e=>{setActivePlayerId(e.active.id);setActiveFromTeam(findTeamIndexByItemId(e.active.id));document.body.classList.add('cursor-grabbing')}
  const onDragCancel=()=>{setActivePlayerId(null);setActiveFromTeam(null);setDropHint({team:null,index:null});document.body.classList.remove('cursor-grabbing')}
  function onDragOverHandler(e){const{over}=e;if(!over){setDropHint({team:null,index:null});return}const overId=String(over.id);let teamIndex,index;if(overId.startsWith('team-')){teamIndex=Number(overId.split('-')[1]);index=(previewTeams[teamIndex]||[]).length}else{teamIndex=findTeamIndexByItemId(overId);const list=previewTeams[teamIndex]||[],overIdx=list.findIndex(p=>String(p.id)===overId);index=Math.max(0,overIdx)}setDropHint({team:teamIndex,index})}
  function onDragEndHandler(e){const{active,over}=e;setActivePlayerId(null);document.body.classList.remove('cursor-grabbing');setDropHint({team:null,index:null});if(!over)return;const from=activeFromTeam,overId=String(over.id),to=overId.startsWith('team-')?Number(overId.split('-')[1]):findTeamIndexByItemId(overId);if(from==null||to==null||from<0||to<0)return;const base=manualTeams??previewTeams,next=base.map(l=>l.slice()),fromIdx=next[from].findIndex(p=>String(p.id)===String(active.id));if(fromIdx<0)return;const moving=next[from][fromIdx];next[from].splice(fromIdx,1);const hintIdx=dropHint.team===to&&dropHint.index!=null?dropHint.index:null,overIdx=hintIdx!=null?hintIdx:next[to].findIndex(p=>String(p.id)===overId);next[to].splice(overId.startsWith('team-')?next[to].length:(overIdx>=0?overIdx:next[to].length),0,moving);setManualTeams(next);latestTeamsRef.current=next;setActiveFromTeam(null);setPlacedByTeam(prev=>{const arr=Array.isArray(prev)?[...prev]:[];const apply=(idx,list)=>{const existed=Array.isArray(arr[idx])?arr[idx]:[],byId=new Map(existed.map(p=>[String(p.id),p]));const basePlaced=assignToFormation({players:list,formation:formations[idx]||'4-3-3'});arr[idx]=basePlaced.map(d=>byId.get(String(d.id))||d)};apply(to,next[to]);apply(from,next[from]);return arr})}
  const openEditorSaved=(match,i)=>{const h=hydrateMatch(match,players);setFormations(Array.isArray(match.formations)?match.formations.slice():[]);setPlacedByTeam(Array.isArray(match.board)?match.board.map(a=>Array.isArray(a)?a.slice():[]):[]);setEditorPlayers(h.teams||[]);setEditingMatchId(match.id);setEditingTeamIdx(i);setEditorOpen(true)}
  const closeEditor=()=>setEditorOpen(false),setTeamFormation=(i,f)=>{setFormations(prev=>{const c=[...prev];c[i]=f;return c});setPlacedByTeam(prev=>{const c=Array.isArray(prev)?[...prev]:[];c[i]=assignToFormation({players:editorPlayers[i]||[],formation:f});return c})},autoPlaceTeam=i=>setPlacedByTeam(prev=>{const c=Array.isArray(prev)?[...prev]:[];const f=formations[i]||'4-3-3';c[i]=assignToFormation({players:editorPlayers[i]||[],formation:f});return c})
  const showOVR=isAdmin&&!hideOVR

  function loadSavedIntoPlanner(match){if(!match)return;skipAutoResetRef.current=true;const h=hydrateMatch(match,players),ts=h.teams||[];if(ts.length===0){notify('불러올 팀 구성이 없습니다.');return}const ids=ts.flat().map(p=>p.id);setAttendeeIds(ids);setTeamCount(ts.length);if(match.criterion)setCriterion(match.criterion);if(match.location){setLocationPreset(match.location.preset||'other');setLocationName(match.location.name||'');setLocationAddress(match.location.address||'')}if(match.dateISO)setDateISO(match.dateISO.slice(0,16));setShuffleSeed(0);setManualTeams(ts);latestTeamsRef.current=ts;const baseFormations=Array.isArray(match.formations)&&match.formations.length===ts.length?match.formations.slice():ts.map(list=>recommendFormation({count:list.length,mode:match.mode||'11v11',positions:countPositions(list)}));setFormations(baseFormations);const baseBoard=Array.isArray(match.board)&&match.board.length===ts.length?match.board.map(a=>Array.isArray(a)?a.slice():[]):ts.map((list,i)=>assignToFormation({players:list,formation:baseFormations[i]||'4-3-3'}));setPlacedByTeam(baseBoard);notify('저장된 매치를 팀배정에 불러왔습니다 ✅')}

  return(
  <div className="grid gap-4 lg:grid-cols:[minmax(0,1fr)_600px]">
    <Card title="매치 설정">
      <div className="grid gap-4">
        <Row label="날짜/시간"><input type="datetime-local" value={dateISO} onChange={e=>setDateISO(e.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2"/></Row>
        <Row label="장소">
          <div className="grid gap-2">
            <select className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm" value={locationPreset} onChange={e=>{const v=e.target.value;setLocationPreset(v);if(v==='coppell-west'){setLocationName('Coppell Middle School - West');setLocationAddress('2701 Ranch Trail, Coppell, TX 75019')}else if(v==='indoor-soccer-zone'){setLocationName('Indoor Soccer Zone');setLocationAddress('2323 Crown Rd, Dallas, TX 75229')}else{setLocationName('');setLocationAddress('')}}}>
              <option value="coppell-west">Coppell Middle School - West</option>
              <option value="indoor-soccer-zone">Indoor Soccer Zone</option>
              <option value="other">Other (Freeform)</option>
            </select>

            {/* 요금 모드 */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="inline-flex items-center gap-2"><input type="radio" name="feeMode" value="preset" checked={feeMode==='preset'} onChange={()=>setFeeMode('preset')}/>자동(장소별 고정)</label>
              <label className="inline-flex items-center gap-2"><input type="radio" name="feeMode" value="custom" checked={feeMode==='custom'} onChange={()=>setFeeMode('custom')}/>커스텀</label>
              {feeMode==='custom'&&(<input type="number" min="0" placeholder="총 구장비(예: 220 또는 340)" value={customBaseCost} onChange={e=>setCustomBaseCost(e.target.value)} className="w-40 rounded border border-gray-300 bg-white px-3 py-1.5"/>)}
            </div>

            {/* 비용 안내 */}
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div><b>예상 구장비</b>: ${baseCost} {feeMode==='preset'?<span className="ml-2 opacity-70">(장소별 고정 금액)</span>:<span className="ml-2 opacity-70">(사용자 지정 금액)</span>}</div>
            </div>

            {/* Freeform 입력 */}
            {locationPreset==='other'&&(
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="장소 이름" value={locationName} onChange={e=>setLocationName(e.target.value)}/>
                <input className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="주소 (URL 또는 일반주소)" value={locationAddress} onChange={e=>setLocationAddress(e.target.value)}/>
              </div>
            )}

            {/* 지도 링크 프리뷰 (프리셋 또는 Other-URL) */}
            {mapLink && (
              <div className="text-xs">
                <a href={mapLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                  Google Maps 열기 ↗
                </a>
              </div>
            )}
          </div>
        </Row>

        <Row label="팀 수">
          <div className="flex items-center gap-3">
            <select className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" value={teams} onChange={e=>setTeamCount(Number(e.target.value))}>{Array.from({length:9},(_,i)=>i+2).map(n=><option key={n} value={n}>{n}팀</option>)}</select>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={posAware} onChange={()=>setPosAware(v=>!v)}/>포지션 고려 매칭</label>
          </div>
        </Row>

        <Row label={<span className="flex items-center gap-2">참석 ({attendeeIds.length}명){attendees.filter(p=>isUnknownPlayer(p)).length>0&&<span className="text-xs text-amber-600 font-medium">({attendees.filter(p=>isUnknownPlayer(p)).length}명 Unknown - 팀파워 계산 제외)</span>}<button type="button" onClick={toggleSelectAll} className="ml-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100">{allSelected?'모두 해제':'모두 선택'}</button></span>}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {players.map(p=>{
              const mem=String(p.membership||'').trim().toLowerCase()
              const member=(mem==='member'||mem.includes('정회원'))
              const unknown=isUnknownPlayer(p)
              return(
                <label key={p.id} className={`flex items-center gap-2 rounded border px-3 py-2 ${attendeeIds.includes(p.id)?'border-emerald-400 bg-emerald-50':'border-gray-200 bg-white hover:bg-gray-50'} ${unknown?'opacity-60':''}`}>
                  <input type="checkbox" checked={attendeeIds.includes(p.id)} onChange={()=>toggle(p.id)}/>
                  <InitialAvatar id={p.id} name={p.name} size={24} badges={!member?['G']:[]} />
                  <span className="text-sm flex-1 whitespace-normal break-words">
                    {p.name}{unknown&&<em className="ml-1 text-xs text-amber-600">(Unknown)</em>}
                  </span>
                  {isAdmin&&!hideOVR&&<span className="text-xs text-gray-500 shrink-0">OVR {unknown?'?':p.ovr??overall(p)}</span>}
                </label>
              )
            })}
          </div>
        </Row>

        <div className="flex flex-wrap gap-2">
          {isAdmin&&(<button onClick={save} className="rounded bg-emerald-500 px-4 py-2 text-white font-semibold">매치 저장</button>)}
        </div>
      </div>
    </Card>

    <div className="grid gap-4">
      <Card title="팀 배정 미리보기 (드래그 & 드랍 커스텀 가능)" right={<div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">기준: {posAware?'포지션 분산':criterion} · <span className="font-medium">GK 평균 제외</span></div>}>
        <Toolbar isAdmin={isAdmin} hideOVR={hideOVR} setHideOVR={setHideOVR}
          reshuffleTeams={()=>{const seed=(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0;setShuffleSeed(seed);if(posAware)setManualTeams(null);else setManualTeams(prev=>(prev??autoSplit.teams).map(list=>seededShuffle(list,seed+list.length)))}}
          sortTeamsByOVR={(order='desc')=>{const base=manualTeams??previewTeams;setManualTeams(base.map(list=>list.slice().sort((a,b)=>{const A=a.ovr??overall(a),B=b.ovr??overall(b);return order==='asc'?A-B:B-A})))}}
          sortTeamsByPosition={(dir='asc')=>{const base=manualTeams??previewTeams,mul=dir==='asc'?1:-1;setManualTeams(base.map(list=>list.slice().sort((a,b)=>{const ia=posIndex(a),ib=posIndex(b);if(ia!==ib)return(ia-ib)*mul;const A=a.ovr??overall(a),B=b.ovr??overall(b);return(B-A)})))}}
          resetManual={()=>{setManualTeams(null);setShuffleSeed(0)}} manualTeams={manualTeams}/>
        
        {/* 표기 안내 */}
        <div className="mb-2 flex items-center justify-end text-[11px] text-gray-500">
          표기: <span className="ml-1 inline-flex items-center gap-1"><GuestBadge/> 게스트</span>
        </div>

        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStartHandler} onDragCancel={onDragCancel} onDragOver={onDragOverHandler} onDragEnd={onDragEndHandler}>
          <div className="grid gap-4" style={{gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))'}}>
            {previewTeams.map((list,i)=>(
              <div key={i} className="space-y-2">
                <TeamColumn teamIndex={i} labelKit={kitForTeam(i)} players={list} showOVR={isAdmin&&!hideOVR} isAdmin={isAdmin} dropHint={dropHint}/>
              </div>
            ))}
          </div>
          <DragOverlay>
            {activePlayerId?(<DragGhost player={players.find(p=>String(p.id)===String(activePlayerId))} showOVR={isAdmin&&!hideOVR}/>):null}
          </DragOverlay>
        </DndContext>
      </Card>

      <Card title="저장된 매치" right={<div className="text-xs text-gray-500"><span className="font-medium">GK 평균 제외</span></div>}>
        <SavedMatchesList matches={matches} players={players} isAdmin={isAdmin} enableLoadToPlanner={true} onLoadToPlanner={loadSavedIntoPlanner} onDeleteMatch={onDeleteMatch} onUpdateMatch={onUpdateMatch} showTeamOVRForAdmin={true} hideOVR={true}/>
      </Card>
    </div>

    {editorOpen&&(
      <FullscreenModal onClose={closeEditor}>
        {/* … 포메이션 편집 모달 … */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">팀 {editingTeamIdx+1} · 포메이션 편집</h3>
          <div className="flex items-center gap-2">
            <select className="rounded border border-gray-300 bg-white px-2 py-1 text-sm" value={formations[editingTeamIdx]||'4-3-3'} onChange={e=>setTeamFormation(editingTeamIdx,e.target.value)}>
              <option value="4-3-3">4-3-3</option><option value="4-4-2">4-4-2</option><option value="3-5-2">3-5-2</option>
              <option value="3-3-2">9v9 · 3-3-2</option><option value="3-2-3">9v9 · 3-2-3</option><option value="2-3-1">7v7 · 2-3-1</option>
            </select>
            <button onClick={()=>{ /* 자동 배치 */ }} className="rounded bg-emerald-500 px-3 py-1 text-sm font-semibold text-white">자동 배치</button>
            <button onClick={()=>{onUpdateMatch(editingMatchId,{formations,board:placedByTeam});setEditorOpen(false);notify('포메이션이 저장되었습니다 ✅')}} className="rounded bg-stone-900 px-3 py-1 text-sm font-semibold text-white">저장</button>
            <button onClick={closeEditor} className="rounded border border-gray-300 bg-white px-3 py-1 text-sm">닫기</button>
          </div>
        </div>
        <FreePitch players={(editorPlayers[editingTeamIdx]||[])} placed={Array.isArray(placedByTeam[editingTeamIdx])?placedByTeam[editingTeamIdx]:[]} setPlaced={(next)=>{setPlacedByTeam(prev=>{const copy=Array.isArray(prev)?[...prev]:[],cur=Array.isArray(copy[editingTeamIdx])?copy[editingTeamIdx]:[],res=(typeof next==='function')?next(cur):next;copy[editingTeamIdx]=Array.isArray(res)?res:[];return copy})}} height={620}/>
        <div className="mt-2 text-xs text-gray-500">* 자유 배치 · GK는 하단 골키퍼 존(80~98%)만 이동</div>
      </FullscreenModal>
    )}
  </div>)
}

function Row({label,children}){return(<div className="grid items-start gap-2 sm:grid-cols-[120px_minmax(0,1fr)]"><label className="mt-1 text-sm text-gray-600">{label}</label><div>{children}</div></div>)}
function Toolbar({isAdmin,hideOVR,setHideOVR,reshuffleTeams,sortTeamsByOVR,sortTeamsByPosition,resetManual,manualTeams}){const[ovrOrder,setOvrOrder]=useState('desc'),[posOrder,setPosOrder]=useState('asc');return(
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2">
    <button onClick={reshuffleTeams} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">랜덤 섞기</button>
    {isAdmin&&(<button onClick={()=>{const next=ovrOrder==='desc'?'asc':'desc';sortTeamsByOVR(next);setOvrOrder(next)}} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">팀 OVR 정렬 ({ovrOrder==='desc'?'↓':'↑'})</button>)}
    <button onClick={()=>{const next=posOrder==='asc'?'desc':'asc';sortTeamsByPosition(next);setPosOrder(next)}} className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-100">포지션 정렬 ({posOrder==='asc'?'GK→FW':'FW→GK'})</button>
    {isAdmin&&(<button type="button" aria-pressed={hideOVR} onClick={()=>setHideOVR(v=>!v)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${hideOVR?'border-emerald-500 text-emerald-700 bg-emerald-50':'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}><span className={`inline-block h-2.5 w-2.5 rounded-full ${hideOVR?'bg-emerald-500':'bg-gray-300'}`}></span>OVR 숨기기</button>)}
    <button onClick={resetManual} disabled={!manualTeams} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">수동 편집 초기화</button>
  </div></div>)}

/* 컬럼/플레이어 렌더 */
function TeamColumn({teamIndex,labelKit,players,showOVR,isAdmin,dropHint}){const id=`team-${teamIndex}`,{setNodeRef,isOver}=useDroppable({id}),non=players.filter(p=>(p.position||p.pos)!=='GK'&&!isUnknownPlayer(p)),sum=non.reduce((a,p)=>a+(p.ovr??overall(p)),0),avg=non.length?Math.round(sum/non.length):0,showIndicator=dropHint?.team===teamIndex,indicator=(<li className="my-1 h-2 rounded bg-emerald-500/70 animate-pulse shadow-[0_0_0_2px_rgba(16,185,129,.35)]"/>);const rendered=[];for(let i=0;i<players.length;i++){if(showIndicator&&dropHint.index===i)rendered.push(<React.Fragment key={`hint-${i}`}>{indicator}</React.Fragment>);rendered.push(<PlayerRow key={players[i].id} player={players[i]} showOVR={showOVR}/>)}if(showIndicator&&dropHint.index===players.length)rendered.push(<React.Fragment key="hint-end">{indicator}</React.Fragment>)
  return(<div ref={setNodeRef} className={`rounded-lg border bg-white transition ${isOver?'border-emerald-500 ring-2 ring-emerald-200':'border-gray-200'}`}>
    <div className={`mb-1 flex items-center justify-between px-3 py-2 text-xs ${labelKit.headerClass}`}>
      <div className="font-semibold">팀 {teamIndex+1}</div>
      <div className="opacity-80 flex items-center gap-2">
        <span>{labelKit.label} · {players.length}명</span>
        {isAdmin&&(
            <span
            className="
              block sm:inline
              text-[11px] mt-0.5 sm:mt-0
              sm:before:content-['·']
              sm:before:mx-1
            "
          >
            <b>팀파워</b> {sum} · 평균 {avg}
            </span>
          )}
      </div>
    </div>
    <SortableContext id={id} items={players.map(p=>String(p.id))} strategy={verticalListSortingStrategy}>
      <ul className="space-y-1 px-3 pb-3 text-sm min-h-[44px]">
        {isOver&&!showIndicator&&(<li className="rounded border-2 border-dashed border-emerald-400/70 bg-emerald-50/40 px-2 py-1 text-xs text-emerald-700">여기에 드롭</li>)}
        {rendered}
        {players.length===0&&!isOver&&(<li className="text-xs text-gray-400">팀원 없음 — 이 카드로 드래그해서 추가</li>)}
      </ul>
    </SortableContext>
  </div>)}

/* PlayerRow */
function PlayerRow({player,showOVR}){
  const{attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id:String(player.id)})
  const style={transform:CSS.Transform.toString(transform),transition,opacity:isDragging?0.7:1,boxShadow:isDragging?'0 6px 18px rgba(0,0,0,.12)':undefined,borderRadius:8,background:isDragging?'rgba(16,185,129,0.06)':undefined}
  const pos=positionGroupOf(player),isGK=pos==='GK',unknown=isUnknownPlayer(player),ovrVal=unknown?'?':player.ovr??overall(player)
  const member=isMember(player.membership)
  return(
    <li ref={setNodeRef} style={style} className="flex items-start gap-2 border-t border-gray-100 pt-1 first:border-0 first:pt-0 touch-manipulation cursor-grab active:cursor-grabbing" {...attributes}{...listeners}>
      <span className="flex items-center gap-2 min-w-0 flex-1">
  <InitialAvatar id={player.id} name={player.name} size={24} badges={!member?['G']:[]} />
        <span className="whitespace-normal break-words">{player.name}</span>
        <span
          className={`ml-1 inline-flex items-center rounded-full px-2 py-[2px] text-[11px] ${
            isGK ? 'bg-amber-100 text-amber-800'
                 : pos==='DF' ? 'bg-blue-100 text-blue-800'
                 : pos==='MF' ? 'bg-emerald-100 text-emerald-800'
                 : pos==='FW' ? 'bg-purple-100 text-purple-800'
                 : 'bg-stone-100 text-stone-700'
          }`}
        >
          {pos}
        </span>
  {/* guest badge is shown on avatar */}
      </span>

      {!isGK && showOVR && <span className={`ovr-chip shrink-0 rounded-full text-[11px] px-2 py-[2px] ${unknown?'bg-stone-300 text-stone-700':'bg-stone-900 text-white'}`} data-ovr>
        {unknown ? '?' : `OVR ${ovrVal}`}
      </span>}
    </li>
  )
}

/* … 나머지(DragGhost, kitForTeam, FullscreenModal 등) 기존 구현 유지 … */
function kitForTeam(i){return[
  {label:"화이트",headerClass:"bg-white text-stone-800 border-b border-stone-300"},
  {label:"블랙",headerClass:"bg-stone-900 text-white border-b border-stone-900"},
  {label:"블루",headerClass:"bg-blue-600 text-white border-b border-blue-700"},
  {label:"레드",headerClass:"bg-red-600 text-white border-b border-red-700"},
  {label:"그린",headerClass:"bg-emerald-600 text-white border-b border-emerald-700"},
  {label:"퍼플",headerClass:"bg-violet-600 text-white border-b border-violet-700"},
  {label:"오렌지",headerClass:"bg-orange-500 text-white border-b border-orange-600"},
  {label:"티얼",headerClass:"bg-teal-600 text-white border-b border-teal-700"},
  {label:"핑크",headerClass:"bg-pink-600 text-white border-b border-pink-700"},
  {label:"옐로",headerClass:"bg-yellow-400 text-stone-900 border-b border-yellow-500"},
][i%10]}
function DragGhost({player,showOVR}){if(!player)return null;const pos=positionGroupOf(player),isGK=pos==='GK',unknown=isUnknownPlayer(player),ovrVal=unknown?'?':player.ovr??overall(player);const member=isMember(player.membership);return(
  <div className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 shadow-lg">
    <div className="flex items-center gap-2 text-sm">
  <InitialAvatar id={player.id} name={player.name} size={22} badges={!member?['G']:[]} />
      <span className="truncate">{player.name}</span>
  {/* guest badge is shown on avatar */}
      <span className={`ml-1 inline-flex items-center rounded-full px-2 py-[2px] text-[11px] ${isGK?'bg-amber-100 text-amber-800':pos==='DF'?'bg-blue-100 text-blue-800':pos==='MF'?'bg-emerald-100 text-emerald-800':pos==='FW'?'bg-purple-100 text-purple-800':'bg-stone-100 text-stone-700'}`}>{pos}</span>
      {showOVR&&!isGK&&<span className="text-xs text-gray-600">OVR {ovrVal}</span>}
    </div>
  </div>
)}
function FullscreenModal({children,onClose}){return(<div className="fixed inset-0 z-50 bg-black/50 p-4 overflow-auto"><div className="mx-auto max-w-5xl rounded-lg bg-white p-4">{children}<div className="mt-3 text-right"><button onClick={onClose} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm">닫기</button></div></div></div>)}
