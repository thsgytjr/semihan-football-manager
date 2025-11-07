// src/pages/MatchPlanner.jsx
import React,{useEffect,useMemo,useRef,useState}from'react'
import ReactDOM from'react-dom'
import Card from'../components/Card'
import{mkMatch,decideMode,splitKTeams,hydrateMatch}from'../lib/match'
import{overall,isUnknownPlayer}from'../lib/players'
import{notify}from'../components/Toast'
import{logger}from'../lib/logger'
import PositionChips from'../components/PositionChips'
import{DndContext,DragOverlay,pointerWithin,PointerSensor,TouchSensor,useSensor,useSensors,useDroppable}from'@dnd-kit/core'
import{SortableContext,useSortable,verticalListSortingStrategy}from'@dnd-kit/sortable'
import{CSS}from'@dnd-kit/utilities'
import InitialAvatar from'../components/InitialAvatar'
import FreePitch from'../components/pitch/FreePitch'
import{assignToFormation,recommendFormation,countPositions}from'../lib/formation'
import{seededShuffle}from'../utils/random'
import SavedMatchesList from'../components/SavedMatchesList'
import { createUpcomingMatch, filterExpiredMatches } from '../lib/upcomingMatch'
import { calculateAIPower } from '../lib/aiPower'
import captainIcon from '../assets/Captain.PNG'
import { getMembershipBadge } from '../lib/membershipConfig'
import { getTagColorClass } from '../lib/constants'

/* ───────── 공통 유틸 ───────── */
const S=(v)=>v==null?'':String(v)
const isMember=(m)=>{const s=S(m).trim().toLowerCase();return s==='member'||s.includes('정회원')}

// 커스텀 멤버십 기반 배지 가져오기
const getBadgesWithCustom=(membership,isCaptain=false,customMemberships=[])=>{
  if(isCaptain)return['C']
  const badgeInfo = getMembershipBadge(membership, customMemberships)
  return badgeInfo ? [badgeInfo.badge] : []
}
/* ─────────────────────────────────────── */

/* ───────── 공통 요금 유틸 ───────── */
function calcFees({ total, memberCount, guestCount, guestSurcharge = 2 }) {
  total = Math.max(0, Number(total) || 0);
  const surcharge = Math.max(0, Number(guestSurcharge) || 0);
  const count = memberCount + guestCount;
  if (total <= 0 || count === 0) return { total, memberFee: 0, guestFee: 0 };

  // 게스트는 멤버 + surcharge
  // memberFee + surcharge = guestFee
  // total = memberFee * memberCount + guestFee * guestCount
  //      = memberFee * memberCount + (memberFee + surcharge) * guestCount
  //      = memberFee * (memberCount + guestCount) + surcharge * guestCount
  //      = memberFee * count + surcharge * guestCount
  // => memberFee = (total - surcharge * guestCount) / count
  let memberFee = (total - surcharge * guestCount) / count;
  // 0.5 단위로 반올림
  memberFee = Math.round(memberFee * 2) / 2;
  let guestFee = memberFee + surcharge;
  // 실제 합계가 total과 다를 수 있으니, total도 재계산해서 반환
  const sum = memberFee * memberCount + guestFee * guestCount;
  return { total, memberFee, guestFee, sum };
}

const nextSaturday0630Local=()=>{const n=new Date(),d=new Date(n),dow=n.getDay();let add=(6-dow+7)%7;if(add===0){const t=new Date(n);t.setHours(6,30,0,0);if(n>t)add=7}d.setDate(n.getDate()+add);d.setHours(6,30,0,0);const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0'),H=String(d.getHours()).padStart(2,'0'),M=String(d.getMinutes()).padStart(2,'0');return`${y}-${m}-${dd}T${H}:${M}`}
const POS_ORDER=['GK','DF','MF','FW','OTHER']

// 멀티 포지션 지원: positions 배열 또는 레거시 position 필드
const positionGroupOf=p=>{
  // positions 배열 사용 - 우선순위: DF > MF > FW > GK
  if (p.positions && Array.isArray(p.positions) && p.positions.length > 0) {
    const categories = p.positions.map(pos => {
      const upperPos = pos.toUpperCase()
      if (upperPos === 'GK') return 'GK'
      if (['CB','LB','RB','LWB','RWB','SW'].includes(upperPos)) return 'DF'
      if (['CDM','CM','CAM','LM','RM'].includes(upperPos)) return 'MF'
      if (['ST','CF','LW','RW'].includes(upperPos)) return 'FW'
      return null
    }).filter(Boolean)
    
    // 우선순위로 반환 (DF > MF > FW > GK)
    if (categories.includes('DF')) return 'DF'
    if (categories.includes('MF')) return 'MF'
    if (categories.includes('FW')) return 'FW'
    if (categories.includes('GK')) return 'GK'
  }
  
  // 레거시 position 필드
  const raw=String(p.position||p.pos||'').toUpperCase()
  if(raw==='GK'||raw.includes('GK'))return'GK'
  const df=['DF','CB','LB','RB','LWB','RWB','CBR','CBL','SW']
  const mf=['MF','CM','DM','AM','LM','RM','CDM','CAM','RDM','LDM','RCM','LCM']
  const fw=['FW','ST','CF','LW','RW','RF','LF']
  if(df.some(k=>raw.includes(k)))return'DF'
  if(mf.some(k=>raw.includes(k)))return'MF'
  if(fw.some(k=>raw.includes(k)))return'FW'
  return'OTHER'
}

const posIndex=p=>POS_ORDER.indexOf(positionGroupOf(p))
const sortByOVRDescWithSeed=(list,seed=0)=>seededShuffle(list.slice(),seed||0x9e3779b1).sort((a,b)=>{
  const ovrA=isUnknownPlayer(a)?0:(b.ovr??overall(b))
  const ovrB=isUnknownPlayer(b)?0:(b.ovr??overall(b))
  return ovrB-ovrA
})
function splitKTeamsPosAware(players,k,seed=0){const teams=Array.from({length:k},()=>[]),meta=Array.from({length:k},()=>({nonGkOVR:0,counts:{GK:0,DF:0,MF:0,FW:0,OTHER:0}})),gs={GK:players.filter(p=>positionGroupOf(p)==='GK'),DF:players.filter(p=>positionGroupOf(p)==='DF'),MF:players.filter(p=>positionGroupOf(p)==='MF'),FW:players.filter(p=>positionGroupOf(p)==='FW'),OTHER:players.filter(p=>positionGroupOf(p)==='OTHER')};for(const key of Object.keys(gs))gs[key]=sortByOVRDescWithSeed(gs[key],seed+key.length);const place=key=>{const list=gs[key];let dir=1;while(list.length){const ordered=[...Array(k).keys()].sort((i,j)=>{const ci=meta[i].counts[key],cj=meta[j].counts[key];return ci!==cj?ci-cj:meta[i].nonGkOVR-meta[j].nonGkOVR}),pick=dir===1?ordered:ordered.slice().reverse();for(const ti of pick){if(!list.length)break;const p=list.shift();teams[ti].push(p);meta[ti].counts[key]++;if(key!=='GK'&&!isUnknownPlayer(p))meta[ti].nonGkOVR+=(p.ovr??overall(p))}dir*=-1}};['DF','MF','FW','GK','OTHER'].forEach(place);return{teams}}

export default function MatchPlanner({
  players,
  matches,
  onSaveMatch,
  onDeleteMatch,
  onUpdateMatch,
  isAdmin,
  upcomingMatches = [],
  onSaveUpcomingMatch,
  onDeleteUpcomingMatch,
  onUpdateUpcomingMatch,
  membershipSettings = []
}){
  const customMemberships = membershipSettings.length > 0 ? membershipSettings : []
  const[dateISO,setDateISO]=useState(()=>nextSaturday0630Local()),[attendeeIds,setAttendeeIds]=useState([]),[criterion,setCriterion]=useState('overall'),[shuffleSeed,setShuffleSeed]=useState(0)
  const[locationPreset,setLocationPreset]=useState(''),[locationName,setLocationName]=useState(''),[locationAddress,setLocationAddress]=useState('')
  const[customBaseCost,setCustomBaseCost]=useState(0),[guestSurcharge,setGuestSurcharge]=useState(2),[teamCount,setTeamCount]=useState(2)
  const[manualTeams,setManualTeams]=useState(null),[activePlayerId,setActivePlayerId]=useState(null),[activeFromTeam,setActiveFromTeam]=useState(null)
  const[formations,setFormations]=useState([]),[placedByTeam,setPlacedByTeam]=useState([]),latestTeamsRef=useRef([])
  const[editorOpen,setEditorOpen]=useState(false),[editingTeamIdx,setEditingTeamIdx]=useState(0),[editingMatchId,setEditingMatchId]=useState(null),[editorPlayers,setEditorPlayers]=useState([])
  const[posAware,setPosAware]=useState(true),[dropHint,setDropHint]=useState({team:null,index:null})
  const[isDraftMode,setIsDraftMode]=useState(false)
  const[captainIds,setCaptainIds]=useState([]) // 각 팀의 주장 ID 배열 [team0CaptainId, team1CaptainId, ...]
  const[previousTeams,setPreviousTeams]=useState(null) // Revert를 위한 이전 팀 상태 저장
  const[showAIPower,setShowAIPower]=useState(false) // AI 파워 점수 표시 여부
  const[isAILoading,setIsAILoading]=useState(false) // AI 배정 로딩 상태
  const[linkedUpcomingMatchId,setLinkedUpcomingMatchId]=useState(null) // 현재 편집 중인 예정 매치 ID
  const[activeSortMode,setActiveSortMode]=useState(null) // 현재 활성화된 정렬 모드: 'name' | 'position' | 'ovr' | 'aipower' | null
  const[aiDistributedTeams,setAiDistributedTeams]=useState(null) // AI 배정 이전 상태 (Revert용)
  const[teamColors,setTeamColors]=useState([]) // Team colors: [{bg, text, border, label}, ...] - empty array means use default kit colors
  
  // Extract unique locations from saved matches (by name only, no duplicates)
  const locationOptions = useMemo(() => {
    const locMap = new Map()
    matches.forEach(m => {
      if (m.location?.name && !locMap.has(m.location.name)) {
        locMap.set(m.location.name, {
          name: m.location.name,
          address: m.location.address || '',
          cost: m.fees?.total || 0
        })
      }
    })
    return Array.from(locMap.values())
  }, [matches])
  
  const count=attendeeIds.length,autoSuggestion=decideMode(count),mode=autoSuggestion.mode
  const attendees=useMemo(()=>players.filter(p=>attendeeIds.includes(p.id)),[players,attendeeIds])
  
  // Determine team count from teamCount state, adjusting teams when it changes
  const teams = teamCount
  
  const autoSplit=useMemo(()=>posAware?splitKTeamsPosAware(attendees,teams,shuffleSeed):splitKTeams(attendees,teams,criterion),[attendees,teams,criterion,posAware,shuffleSeed])
  const skipAutoResetRef=useRef(false);useEffect(()=>{if(skipAutoResetRef.current){skipAutoResetRef.current=false;return}setManualTeams(null);setShuffleSeed(0)},[attendees,teams,criterion,posAware])
  
  // 팀 수 변경 시 기존 팀을 재배치
  useEffect(() => {
    if (manualTeams && manualTeams.length !== teams) {
      const allPlayers = manualTeams.flat()
      const newTeams = Array.from({length: teams}, () => [])
      allPlayers.forEach((player, idx) => {
        newTeams[idx % teams].push(player)
      })
      setManualTeams(newTeams)
      latestTeamsRef.current = newTeams
    }
    // 팀 수 변경 시 주장 정보 초기화
    setCaptainIds([])
    
    // Adjust teamColors array length to match team count (preserve existing colors, fill with null for new teams)
    setTeamColors(prev => {
      if (prev.length === teams) return prev
      const newColors = Array.from({length: teams}, (_, i) => prev[i] || null)
      return newColors
    })
  }, [teams]) // eslint-disable-line

  // Base cost from custom input or location history
  const baseCost=useMemo(()=>Math.max(0, parseFloat(customBaseCost)||0),[customBaseCost])

  const previewTeams=useMemo(()=>{let base=manualTeams??autoSplit.teams;if(!manualTeams&&shuffleSeed)base=base.map(list=>seededShuffle(list,shuffleSeed+list.length));return base},[manualTeams,autoSplit.teams,shuffleSeed]);useEffect(()=>{latestTeamsRef.current=previewTeams},[previewTeams])

  // ✅ 라이브 프리뷰 요금 (팀에 배정된 선수 기준으로 계산)
  const liveFees=useMemo(()=>{
    const assignedPlayers = previewTeams.flat().map(p => p.id)
    const assigned = players.filter(p => assignedPlayers.includes(p.id))
    const m = assigned.filter(p=>isMember(p.membership)).length
    const g = Math.max(0, assigned.length - m)
    return calcFees({ total: baseCost, memberCount: m, guestCount: g, guestSurcharge })
  },[previewTeams, players, baseCost, guestSurcharge])
  useEffect(()=>{setFormations(prev=>[...previewTeams].map((list,i)=>prev[i]||recommendFormation({count:list.length,mode,positions:countPositions(list)})));setPlacedByTeam(prev=>{const prevArr=Array.isArray(prev)?prev:[];return previewTeams.map((list,i)=>{const existed=Array.isArray(prevArr[i])?prevArr[i]:[],byId=new Map(existed.map(p=>[String(p.id),p]));const base=assignToFormation({players:list,formation:(formations[i]||recommendFormation({count:list.length,mode,positions:countPositions(list)}))});return base.map(d=>byId.get(String(d.id))||d)})})},[previewTeams,mode]) // eslint-disable-line

  // ✅ 저장 시 요금 계산 (calcFees 사용)
  const computeFeesAtSave = ({ baseCostValue, attendees, guestSurcharge }) => {
    const list = Array.isArray(attendees) ? attendees : []
    const m = list.filter(p => isMember(p.membership)).length
    const g = Math.max(0, list.length - m)
  return calcFees({ total: Math.max(0, parseFloat(baseCostValue) || 0), memberCount: m, guestCount: g, guestSurcharge: guestSurcharge || 2 })
  }

  // ✅ 지도 링크 계산 (프리셋 + Other URL)
  const mapLink = useMemo(()=>{
    if (/^https?:\/\//i.test(String(locationAddress||''))) return locationAddress
    return null
  },[locationAddress])

  function save(){
    if(!isAdmin){notify('Admin만 가능합니다.');return}
    const baseTeams=(latestTeamsRef.current&&latestTeamsRef.current.length)?latestTeamsRef.current:previewTeams
    const snapshot=baseTeams.map(team=>team.map(p=>p.id))
    const ids=snapshot.flat()
    const objs=players.filter(p=>ids.includes(p.id))
    const fees=computeFeesAtSave({baseCostValue:baseCost,attendees:objs,guestSurcharge})
    
    // 드래프트 모드일 때 추가 필드들
    const draftFields = isDraftMode ? {
      selectionMode: 'draft',
      draftMode: true,
      draft: true,
      captainIds: captainIds.slice(), // 현재 선택된 주장 ID들 저장
      // 주장이 선택되어 있다면 추가
      ...(baseTeams.length === 2 && {
        captains: [] // 나중에 주장 선택 기능에서 설정
      })
    } : {
      selectionMode: 'manual'
    }
    
    // datetime-local 형식(YYYY-MM-DDTHH:MM)을 ISO 8601로 변환
    const dateISOFormatted = dateISO ? new Date(dateISO + ':00').toISOString() : new Date().toISOString()
    
    const payload={
      ...mkMatch({
        id:crypto.randomUUID?.()||String(Date.now()),
        dateISO: dateISOFormatted,attendeeIds:ids,criterion:posAware?'pos-aware':criterion,players,
        teamCount:baseTeams.length,
        location:{preset:locationPreset,name:locationName,address:locationAddress},
        mode,snapshot,board:placedByTeam,formations,locked:true,videos:[],
        ...draftFields
      }),
      fees,
      // Only include teamColors if at least one team has a custom color
      ...(teamColors && teamColors.length > 0 && teamColors.some(c => c !== null && c !== undefined) ? { teamColors } : {})
    }
    onSaveMatch(payload);notify(`${isDraftMode ? '드래프트 ' : ''}매치가 저장되었습니다 ✅`)
  }

  function saveAsUpcomingMatch(){
    if(!isAdmin){notify('Admin만 가능합니다.');return}
    if(!onSaveUpcomingMatch){notify('예정 매치 저장 기능이 없습니다.');return}
    
    // 실제로 팀에 배정된 선수들의 ID 목록 가져오기
    const assignedPlayerIds = previewTeams.flat().map(p => p.id)
    
    if (assignedPlayerIds.length === 0) {
      notify('참가자를 먼저 선택해주세요.');return
    }

    // 팀 구성 스냅샷 저장 (선수 ID 배열)
    const teamsSnapshot = previewTeams.map(team => team.map(p => p.id))

    // datetime-local 형식(YYYY-MM-DDTHH:MM)을 ISO 8601로 변환
    const dateISOFormatted = dateISO ? new Date(dateISO + ':00').toISOString() : new Date().toISOString()

    const upcomingMatch = createUpcomingMatch({
      dateISO: dateISOFormatted,
      participantIds: assignedPlayerIds,
      location: {
        preset: locationPreset,
        name: locationName,
        address: locationAddress
      },
      totalCost: baseCost,
      isDraftMode,
      mode: decideMode(assignedPlayerIds.length).mode,
      teamCount: teams, // 팀 수 저장
      snapshot: teamsSnapshot, // 팀 구성 저장
      formations: formations, // 포메이션 저장
      captainIds: captainIds, // 주장 정보 저장
      criterion: posAware ? 'pos-aware' : criterion, // 배정 기준 저장
      // Only include teamColors if at least one team has a custom color
      ...(teamColors && teamColors.length > 0 && teamColors.some(c => c !== null && c !== undefined) ? { teamColors } : {})
    })

    onSaveUpcomingMatch(upcomingMatch)
    setLinkedUpcomingMatchId(upcomingMatch.id) // 저장 후 자동 연결
    notify(`${isDraftMode ? '드래프트 ' : ''}예정 매치로 저장되었습니다 ✅`)
  }

  // 주장 또는 팀 구성 변경 시 연결된 예정 매치 자동 업데이트
  useEffect(() => {
    if (!linkedUpcomingMatchId || !onUpdateUpcomingMatch) return
    
    const linkedMatch = upcomingMatches.find(m => m.id === linkedUpcomingMatchId)
    if (!linkedMatch) return

    // 팀 구성 스냅샷
    const teamsSnapshot = previewTeams.map(team => team.map(p => p.id))
    const assignedPlayerIds = previewTeams.flat().map(p => p.id)

    // 변경사항 자동 업데이트 (알림 없이 - silent mode)
    const updates = {
      snapshot: teamsSnapshot,
      participantIds: assignedPlayerIds,
      captainIds: captainIds,
      formations: formations,
      teamCount: teams,
      // Only include teamColors if at least one team has a custom color
      ...(teamColors && teamColors.length > 0 && teamColors.some(c => c !== null && c !== undefined) ? { teamColors } : {})
    }

    onUpdateUpcomingMatch(linkedUpcomingMatchId, updates, true) // silent=true
  }, [captainIds, previewTeams, formations, teamColors]) // 주장, 팀 구성, 포메이션, 팀 색상 변경 시 자동 업데이트

  // Drag and drop handlers
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:4}}),useSensor(TouchSensor,{activationConstraint:{delay:120,tolerance:6}}))
  const findTeamIndexByItemId=itemId=>previewTeams.findIndex(list=>list.some(p=>String(p.id)===String(itemId)))
  const onDragStartHandler=e=>{setActivePlayerId(e.active.id);setActiveFromTeam(findTeamIndexByItemId(e.active.id));document.body.classList.add('cursor-grabbing')}
  const onDragCancel=()=>{setActivePlayerId(null);setActiveFromTeam(null);setDropHint({team:null,index:null});document.body.classList.remove('cursor-grabbing')}
  function onDragOverHandler(e){const{over}=e;if(!over){setDropHint({team:null,index:null});return}const overId=String(over.id);let teamIndex,index;if(overId.startsWith('team-')){teamIndex=Number(overId.split('-')[1]);index=(previewTeams[teamIndex]||[]).length}else{teamIndex=findTeamIndexByItemId(overId);const list=previewTeams[teamIndex]||[],overIdx=list.findIndex(p=>String(p.id)===overId);index=Math.max(0,overIdx)}setDropHint({team:teamIndex,index})}
  function onDragEndHandler(e){const{active,over}=e;setActivePlayerId(null);document.body.classList.remove('cursor-grabbing');setDropHint({team:null,index:null});if(!over)return;const from=activeFromTeam,overId=String(over.id),to=overId.startsWith('team-')?Number(overId.split('-')[1]):findTeamIndexByItemId(overId);if(from==null||to==null||from<0||to<0)return;const base=manualTeams??previewTeams,next=base.map(l=>l.slice()),fromIdx=next[from].findIndex(p=>String(p.id)===String(active.id));if(fromIdx<0)return;const moving=next[from][fromIdx];next[from].splice(fromIdx,1);const hintIdx=dropHint.team===to&&dropHint.index!=null?dropHint.index:null,overIdx=hintIdx!=null?hintIdx:next[to].findIndex(p=>String(p.id)===overId);next[to].splice(overId.startsWith('team-')?next[to].length:(overIdx>=0?overIdx:next[to].length),0,moving);setManualTeams(next);latestTeamsRef.current=next;setActiveFromTeam(null);setShowAIPower(false);setActiveSortMode(null);setPlacedByTeam(prev=>{const arr=Array.isArray(prev)?[...prev]:[];const apply=(idx,list)=>{const existed=Array.isArray(arr[idx])?arr[idx]:[],byId=new Map(existed.map(p=>[String(p.id),p]));const basePlaced=assignToFormation({players:list,formation:formations[idx]||'4-3-3'});arr[idx]=basePlaced.map(d=>byId.get(String(d.id))||d)};apply(to,next[to]);apply(from,next[from]);return arr})}
  const openEditorSaved=(match,i)=>{const h=hydrateMatch(match,players);setFormations(Array.isArray(match.formations)?match.formations.slice():[]);setPlacedByTeam(Array.isArray(match.board)?match.board.map(a=>Array.isArray(a)?a.slice():[]):[]);setEditorPlayers(h.teams||[]);setEditingMatchId(match.id);setEditingTeamIdx(i);setEditorOpen(true)}
  const closeEditor=()=>setEditorOpen(false),setTeamFormation=(i,f)=>{setFormations(prev=>{const c=[...prev];c[i]=f;return c});setPlacedByTeam(prev=>{const c=Array.isArray(prev)?[...prev]:[];c[i]=assignToFormation({players:editorPlayers[i]||[],formation:f});return c})},autoPlaceTeam=i=>setPlacedByTeam(prev=>{const c=Array.isArray(prev)?[...prev]:[];const f=formations[i]||'4-3-3';c[i]=assignToFormation({players:editorPlayers[i]||[],formation:f});return c})
  
  // 선수 제거 핸들러
  const handleRemovePlayer = (playerId, teamIndex) => {
    const base = manualTeams ?? previewTeams
    const next = base.map((team, idx) => 
      idx === teamIndex ? team.filter(p => String(p.id) !== String(playerId)) : team
    )
    setManualTeams(next)
    latestTeamsRef.current = next
    setShowAIPower(false) // 수동 조작 시 AI 파워 숨김
    setActiveSortMode(null) // 수동 조작 시 정렬 모드 해제
  }
  
  // 주장 선택 핸들러
  const handleSetCaptain = (playerId, teamIndex) => {
    setCaptainIds(prev => {
      const newCaptains = [...prev]
      // 이미 주장이면 해제, 아니면 지정
      if (newCaptains[teamIndex] === playerId) {
        newCaptains[teamIndex] = null
        const playerName = players.find(p => p.id === playerId)?.name || '선수'
        notify(`팀 ${teamIndex + 1}의 주장 해제: ${playerName}`)
      } else {
        newCaptains[teamIndex] = playerId
        const playerName = players.find(p => p.id === playerId)?.name || '선수'
        notify(`팀 ${teamIndex + 1}의 주장: ${playerName}`)
      }
      return newCaptains
    })
  }
  
  // AI 자동 배정 (포지션 밸런스 + 평균 + 인원수 균등)
  const handleAIDistribute = () => {
    // 현재 상태 저장 (Revert용)
    const current = manualTeams ?? previewTeams
    setAiDistributedTeams(current.map(team => [...team]))
    
    // 팀에 배정된 모든 선수 수집
    const assignedPlayers = current.flat()
    
    if (assignedPlayers.length === 0) {
      notify('배정할 선수가 없습니다.')
      return
    }
    
    // AI 로딩 시작
    setIsAILoading(true)
    setShowAIPower(false)
    setActiveSortMode(null) // AI 배정 시 정렬 모드 해제
    
    // 로딩 애니메이션 효과 (1초 후 결과 표시)
    setTimeout(() => {
      // 개선된 AI 배정: 고정 시드로 항상 같은 결과 (선수 구성이 같으면)
      // 선수 ID들을 정렬하여 고정 시드 생성
      const playerIdsSorted = assignedPlayers.map(p => p.id).sort().join(',')
      const fixedSeed = playerIdsSorted.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      
      const newTeams = smartDistributeAdvanced(assignedPlayers, teams, fixedSeed)
      
      setManualTeams(newTeams)
      latestTeamsRef.current = newTeams
      setCaptainIds([]) // 주장 정보 초기화
      setIsAILoading(false)
      
      // 배정 완료 후 AI 파워 점수 표시 (페이드인 효과)
      setTimeout(() => {
        setShowAIPower(true)
        notify('AI가 모든 데이터를 분석하여 최적의 팀을 구성했습니다 ✨')
      }, 100)
    }, 1000)
  }
  
  // 똑똑한 팀 배정 알고리즘 (고급 버전 - 개선)
  const smartDistributeAdvanced = (players, teamCount, seed = 0) => {
    // 1. 각 선수의 종합 파워 계산
    const playersWithPower = players.map(p => ({
      ...p,
      power: calculateAIPower(p, matches),
      position: positionGroupOf(p)
    }))
    
    // 2. 포지션별로 그룹화 후 파워순 정렬 (고정된 순서)
    const byPosition = {
      GK: playersWithPower.filter(p => p.position === 'GK').sort((a, b) => b.power - a.power),
      DF: playersWithPower.filter(p => p.position === 'DF').sort((a, b) => b.power - a.power),
      MF: playersWithPower.filter(p => p.position === 'MF').sort((a, b) => b.power - a.power),
      FW: playersWithPower.filter(p => p.position === 'FW').sort((a, b) => b.power - a.power),
      OTHER: playersWithPower.filter(p => p.position === 'OTHER').sort((a, b) => b.power - a.power)
    }
    
    // 3. 팀 초기화
    const teams = Array.from({ length: teamCount }, () => [])
    const teamStats = Array.from({ length: teamCount }, () => ({
      totalPower: 0,
      count: 0,
      positions: { GK: 0, DF: 0, MF: 0, FW: 0, OTHER: 0 }
    }))
    
    // 4. 포지션별로 배정 (GK -> DF -> MF -> FW -> OTHER)
    // 골키퍼를 먼저 각 팀에 균등 배정
    const positionOrder = ['GK', 'DF', 'MF', 'FW', 'OTHER']
    
    positionOrder.forEach(pos => {
      const playerList = byPosition[pos]
      
      playerList.forEach((player, playerIndex) => {
        // 가장 적합한 팀 찾기
        const candidates = teamStats
          .map((stat, idx) => ({
            idx,
            count: stat.count,
            posCount: stat.positions[pos],
            avgPower: stat.count > 0 ? stat.totalPower / stat.count : 0
          }))
        
        // 정렬 기준 개선: 인원수 균등 최우선
        candidates.sort((a, b) => {
          // 1순위: 인원수가 적은 팀 (확실한 차이)
          if (a.count !== b.count) return a.count - b.count
          
          // 2순위: 해당 포지션이 적은 팀
          if (a.posCount !== b.posCount) return a.posCount - b.posCount
          
          // 3순위: 평균 파워가 낮은 팀
          if (Math.abs(a.avgPower - b.avgPower) > 1) {
            return a.avgPower - b.avgPower
          }
          
          // 4순위: 인덱스 순서 (같은 조건이면 순차 배정)
          return a.idx - b.idx
        })
        
        const bestTeamIdx = candidates[0].idx
        
        // 선수 배정
        teams[bestTeamIdx].push(player)
        teamStats[bestTeamIdx].totalPower += player.power
        teamStats[bestTeamIdx].count++
        teamStats[bestTeamIdx].positions[pos]++
      })
    })
    
    // 5. 최종 확인: 인원수가 너무 불균형하면 재조정
    const maxCount = Math.max(...teamStats.map(s => s.count))
    const minCount = Math.min(...teamStats.map(s => s.count))
    
    // 인원수 차이가 2명 이상이면 경고 (디버깅용)
    if (maxCount - minCount > 1) {
      logger.warn('AI 배정: 팀 인원수 불균형 감지', teamStats.map(s => s.count))
    }
    
    return teams
  }
  
  // 이전 상태로 되돌리기 (AI 배정 전으로만)
  const handleRevert = () => {
    if (!aiDistributedTeams) {
      notify('되돌릴 이전 상태가 없습니다.')
      return
    }
    
    setManualTeams(aiDistributedTeams.map(team => [...team]))
    latestTeamsRef.current = aiDistributedTeams
    setAiDistributedTeams(null)
    setShowAIPower(false) // Revert 시 AI 파워 숨김
    setActiveSortMode(null) // Revert 시 정렬 모드 해제
    
    notify('AI 배정 이전 상태로 되돌렸습니다 ↩️')
  }

  function loadSavedIntoPlanner(match){if(!match)return;skipAutoResetRef.current=true;const h=hydrateMatch(match,players),ts=h.teams||[];if(ts.length===0){notify('불러올 팀 구성이 없습니다.');return}const ids=ts.flat().map(p=>p.id);setTeamCount(ts.length);if(match.criterion)setCriterion(match.criterion);if(match.location){setLocationName(match.location.name||'');setLocationAddress(match.location.address||'')}if(match.dateISO)setDateISO(match.dateISO.slice(0,16));if(match.fees?.total)setCustomBaseCost(match.fees.total);setShuffleSeed(0);setManualTeams(ts);latestTeamsRef.current=ts;setShowAIPower(false);const baseFormations=Array.isArray(match.formations)&&match.formations.length===ts.length?match.formations.slice():ts.map(list=>recommendFormation({count:list.length,mode:match.mode||'11v11',positions:countPositions(list)}));setFormations(baseFormations);const baseBoard=Array.isArray(match.board)&&match.board.length===ts.length?match.board.map(a=>Array.isArray(a)?a.slice():[]):ts.map((list,i)=>assignToFormation({players:list,formation:baseFormations[i]||'4-3-3'}));setPlacedByTeam(baseBoard);if(match.selectionMode==='draft'){setIsDraftMode(true);if(Array.isArray(match.captainIds)){setCaptainIds(match.captainIds)}}else{setIsDraftMode(false);setCaptainIds([])};if(match.teamColors&&Array.isArray(match.teamColors)&&match.teamColors.length===ts.length){setTeamColors(match.teamColors)};notify('저장된 매치를 팀배정에 불러왔습니다 ✅')}

  function loadUpcomingMatchIntoPlanner(upcomingMatch) {
    if (!upcomingMatch) return
    skipAutoResetRef.current = true
    
    // 두 필드 모두 확인하여 참가자 ID 목록을 얻음
    const participantIds = upcomingMatch.participantIds || upcomingMatch.attendeeIds || []
    if (participantIds.length === 0) {
      notify('불러올 참가자가 없습니다.')
      return
    }

    // 예정된 매치 ID 연결 (자동 업데이트를 위해)
    setLinkedUpcomingMatchId(upcomingMatch.id)

    // Load basic match data
    if (upcomingMatch.dateISO) setDateISO(upcomingMatch.dateISO.slice(0, 16))
    if (upcomingMatch.location) {
      setLocationName(upcomingMatch.location.name || '')
      setLocationAddress(upcomingMatch.location.address || '')
    }
    
    // 팀 수 설정 (저장된 teamCount 또는 snapshot 길이 사용)
    const savedTeamCount = upcomingMatch.teamCount || upcomingMatch.snapshot?.length || 2
    setTeamCount(savedTeamCount)
    
    // 드래프트 모드 설정
    if (upcomingMatch.isDraftMode) {
      setIsDraftMode(true)
    }
    
    // 총 구장비 설정
    if (upcomingMatch.totalCost) {
      setCustomBaseCost(upcomingMatch.totalCost)
    }
    
    // 드래프트 완료된 경우 snapshot 사용
    if (upcomingMatch.isDraftComplete && upcomingMatch.snapshot && upcomingMatch.snapshot.length > 0) {
      const playersByIds = new Map(players.map(p => [p.id, p]))
      
      // snapshot에서 팀 구성 불러오기
      const snapshotTeams = upcomingMatch.snapshot.map(teamIds => 
        teamIds.map(id => playersByIds.get(id)).filter(Boolean)
      )
      
      // 주장 정보가 있으면 각 팀의 첫 번째로 배치
      if (upcomingMatch.captainIds && upcomingMatch.captainIds.length > 0) {
        snapshotTeams.forEach((team, teamIndex) => {
          const captainId = upcomingMatch.captainIds[teamIndex]
          const captainObj = playersByIds.get(captainId)
          
          if (captainObj) {
            // 주장을 팀의 첫 번째로 이동
            const teamWithoutCaptain = team.filter(p => p.id !== captainId)
            snapshotTeams[teamIndex] = [captainObj, ...teamWithoutCaptain]
          }
        })
        
        // 주장 ID 설정
        setCaptainIds(upcomingMatch.captainIds.slice())
      }
      
      setManualTeams(snapshotTeams)
      latestTeamsRef.current = snapshotTeams
      setShowAIPower(false)
      setShuffleSeed(0)
      
      // Load team colors if available
      if (upcomingMatch.teamColors && Array.isArray(upcomingMatch.teamColors) && upcomingMatch.teamColors.length === snapshotTeams.length) {
        setTeamColors(upcomingMatch.teamColors)
      }
      
      notify('드래프트 결과를 불러왔습니다 ✅')
    } else {
      // 드래프트가 완료되지 않은 경우
      const playersByIds = new Map(players.map(p => [p.id, p]))
      const attendeesInOrder = participantIds.map(id => playersByIds.get(id)).filter(Boolean)
      
      if (attendeesInOrder.length > 0) {
        // snapshot이 있으면 사용, 없으면 순차 배정
        if (upcomingMatch.snapshot && upcomingMatch.snapshot.length > 0) {
          const snapshotTeams = upcomingMatch.snapshot.map(teamIds => 
            teamIds.map(id => playersByIds.get(id)).filter(Boolean)
          )
          setManualTeams(snapshotTeams)
          latestTeamsRef.current = snapshotTeams
        } else {
          // 간단한 순차 배정으로 원래 순서 유지
          const teamCountVal = savedTeamCount
          const simpleTeams = Array.from({length: teamCountVal}, () => [])
          attendeesInOrder.forEach((player, index) => {
            simpleTeams[index % teamCountVal].push(player)
          })
          setManualTeams(simpleTeams)
          latestTeamsRef.current = simpleTeams
        }
        setShowAIPower(false)
        
        // 주장 정보가 있으면 불러오기 (드래프트 모드 여부와 관계없이)
        if (upcomingMatch.captainIds && upcomingMatch.captainIds.length > 0) {
          setCaptainIds(upcomingMatch.captainIds.slice())
        }
        
        // Load team colors if available
        if (upcomingMatch.teamColors && Array.isArray(upcomingMatch.teamColors)) {
          setTeamColors(upcomingMatch.teamColors)
        }
      } else {
        setManualTeams(null)
        setShowAIPower(false)
      }
      
      setShuffleSeed(0)
      notify('예정 매치를 불러왔습니다 ✅')
    }
  }

  return(
  <div className="grid gap-4 lg:grid-cols:[minmax(0,1fr)_600px]">
    <Card title="매치 설정">
      <div className="grid gap-4">
        <Row label="날짜/시간"><input type="datetime-local" value={dateISO} onChange={e=>setDateISO(e.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2"/></Row>
        <Row label="장소">
          <div className="grid gap-2">
            <select 
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm" 
              value={locationName} 
              onChange={e=>{
                const selected = locationOptions.find(loc => loc.name === e.target.value)
                if (selected) {
                  setLocationName(selected.name)
                  setLocationAddress(selected.address || '')
                  setCustomBaseCost(selected.cost || 0)
                } else if (e.target.value === 'other') {
                  setLocationName('')
                  setLocationAddress('')
                  setCustomBaseCost(0)
                }
              }}
            >
              <option value="">장소 선택...</option>
              {locationOptions.map((loc, idx) => (
                <option key={idx} value={loc.name}>{loc.name}</option>
              ))}
              <option value="other">+ 새 장소 추가</option>
            </select>

            {/* Custom location input */}
            {(!locationName || !locationOptions.find(loc => loc.name === locationName)) && (
              <div className="grid gap-2 sm:grid-cols-2">
                <input 
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" 
                  placeholder="장소 이름" 
                  value={locationName} 
                  onChange={e=>setLocationName(e.target.value)}
                />
                <input 
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm" 
                  placeholder="주소 (URL 또는 일반주소)" 
                  value={locationAddress} 
                  onChange={e=>setLocationAddress(e.target.value)}
                />
              </div>
            )}
            
            {/* Cost input */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-600">총 구장비:</label>
                <input 
                  type="number" 
                  min="0" 
                  step="0.5" 
                  placeholder="총 구장비 (예: 220, 330)" 
                  value={customBaseCost} 
                  onChange={e=>setCustomBaseCost(e.target.value)} 
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-600">게스트 추가 할증:</label>
                <input 
                  type="number" 
                  min="0" 
                  step="0.5" 
                  placeholder="게스트 추가 금액 (예: 2, 3)" 
                  value={guestSurcharge} 
                  onChange={e=>setGuestSurcharge(e.target.value)} 
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* 비용 안내 */}
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div><b>예상 구장비</b>: ${baseCost}</div>
              <div className="mt-1">
                배정된 선수: {previewTeams.flat().length}명 
                {previewTeams.flat().length > 0 && (
                  <span className="ml-2">
                    (정회원: ${liveFees.memberFee}/인 · 게스트: ${liveFees.guestFee}/인 +${guestSurcharge})
                  </span>
                )}
              </div>
            </div>

            {/* 지도 링크 프리뷰 */}
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
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={isDraftMode} onChange={()=>setIsDraftMode(v=>!v)}/>드래프트 모드</label>
          </div>
        </Row>

        {/* 빠른 선수 추가 - 상단 고정 */}
        <QuickAttendanceEditor players={players} snapshot={previewTeams.map(team=>team.map(p=>p.id))} onDraftChange={(newSnap)=>{const byId=new Map(players.map(p=>[String(p.id),p]));const newTeams=newSnap.map(ids=>ids.map(id=>byId.get(String(id))).filter(Boolean));setManualTeams(newTeams);latestTeamsRef.current=newTeams;setShowAIPower(false);setActiveSortMode(null)}} customMemberships={customMemberships}/>

        {/* 팀 배정 테이블 with 드래그 앤 드롭 */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
            {/* 왼쪽: 팀 배정 헤더 + 액션 버튼 */}
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-gray-700">팀 배정</div>
              <button 
                onClick={handleAIDistribute}
                className="rounded bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1.5 text-xs font-semibold hover:from-purple-600 hover:to-pink-600 shadow-sm"
                title="AI가 포지션과 평균을 고려해 자동 배정"
              >
                ✨ AI 배정
              </button>
              {aiDistributedTeams && (
                <button 
                  onClick={handleRevert}
                  className="rounded border border-gray-400 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  title="AI 배정 이전 상태로 되돌리기"
                >
                  Revert
                </button>
              )}
              {previewTeams.flat().length > 0 && (
                <button 
                  onClick={()=>{
                    if(window.confirm('모든 팀 배정을 초기화하시겠습니까?')) {
                      setAiDistributedTeams(manualTeams ?? previewTeams)
                      setManualTeams(Array.from({length: teams}, () => []))
                      setCaptainIds([])
                      setShowAIPower(false)
                      setActiveSortMode(null)
                      notify('팀 배정이 초기화되었습니다')
                    }
                  }} 
                  className="rounded border border-red-300 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  title="모든 선수를 팀에서 제거"
                >
                  초기화
                </button>
              )}
            </div>
            
            {/* 오른쪽: 정렬 버튼 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-600 font-medium">정렬:</span>
              <button 
                onClick={()=>{
                  if (activeSortMode === 'name') {
                    // 이미 활성화되어 있으면 해제 (정렬 해제는 없음, 그냥 표시만)
                    setActiveSortMode(null)
                  } else {
                    // 새로 활성화
                    const base = manualTeams ?? previewTeams
                    setManualTeams(base.map(list=>list.slice().sort((a,b)=>a.name.localeCompare(b.name))))
                    setActiveSortMode('name')
                  }
                }} 
                className={`rounded border px-2 py-1 text-xs transition-all ${
                  activeSortMode === 'name' 
                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' 
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                이름순
              </button>
              <button 
                onClick={()=>{
                  if (activeSortMode === 'position') {
                    // 이미 활성화되어 있으면 해제
                    setActiveSortMode(null)
                  } else {
                    // 새로 활성화
                    const base = manualTeams ?? previewTeams
                    // GK → DF → MF → FW → OTHER 순서로 정렬
                    setManualTeams(base.map(list=>list.slice().sort((a,b)=>{
                      const posA = positionGroupOf(a)
                      const posB = positionGroupOf(b)
                      const indexA = POS_ORDER.indexOf(posA)
                      const indexB = POS_ORDER.indexOf(posB)
                      return indexA - indexB
                    })))
                    setActiveSortMode('position')
                  }
                }} 
                className={`rounded border px-2 py-1 text-xs transition-all ${
                  activeSortMode === 'position' 
                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' 
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                포지션순
              </button>
              {isAdmin&&(
                <button 
                  onClick={()=>{
                    if (activeSortMode === 'ovr') {
                      // 이미 활성화되어 있으면 해제
                      setActiveSortMode(null)
                    } else {
                      // 새로 활성화
                      const base = manualTeams ?? previewTeams
                      setManualTeams(base.map(list=>list.slice().sort((a,b)=>{
                        const A=a.ovr??overall(a),B=b.ovr??overall(b);
                        return B-A
                      })))
                      setActiveSortMode('ovr')
                    }
                  }} 
                  className={`rounded border px-2 py-1 text-xs transition-all ${
                    activeSortMode === 'ovr' 
                      ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' 
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Overall순
                </button>
              )}
              {showAIPower&&isAdmin&&(
                <button 
                  onClick={()=>{
                    if (activeSortMode === 'aipower') {
                      // 이미 활성화되어 있으면 해제
                      setActiveSortMode(null)
                    } else {
                      // 새로 활성화
                      const base = manualTeams ?? previewTeams
                      
                      // 각 팀의 선수를 AI 파워순으로 정렬
                      const newTeams = base.map((list)=>{
                        // AI 파워 계산
                        const playersWithPower = list.map(player => ({
                          player: {...player}, // 새 객체 생성으로 참조 변경
                          power: calculateAIPower(player, matches)
                        }));
                        
                        // AI 파워 내림차순 정렬
                        playersWithPower.sort((a, b) => b.power - a.power);
                        
                        // 정렬된 선수만 반환
                        return playersWithPower.map(item => item.player);
                      });
                      
                      // 상태 업데이트
                      setManualTeams(newTeams);
                      latestTeamsRef.current = newTeams;
                      setActiveSortMode('aipower')
                    }
                  }} 
                  className={`rounded border px-2 py-1 text-xs font-medium transition-all ${
                    activeSortMode === 'aipower' 
                      ? 'border-purple-500 bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-sm' 
                      : 'border-purple-300 bg-gradient-to-r from-purple-50 to-purple-100 text-purple-700 hover:from-purple-100 hover:to-purple-200'
                  }`}
                >
                  ✨ AI파워순
                </button>
              )}
            </div>
          </div>
          
          <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStartHandler} onDragCancel={onDragCancel} onDragOver={onDragOverHandler} onDragEnd={onDragEndHandler}>
            <div className="relative">
              {/* AI 로딩 오버레이 */}
              {isAILoading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/95 backdrop-blur-sm rounded-lg">
                  <div className="text-center">
                    <div className="mb-4 animate-spin text-6xl">✨</div>
                    <div className="text-lg font-semibold text-purple-600 mb-2">AI가 팀을 구성 중...</div>
                    <div className="text-sm text-stone-600">모든 데이터를 분석하고 있습니다</div>
                  </div>
                </div>
              )}
              
              <div className="grid gap-3" style={{gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))'}}>
                {previewTeams.map((list,i)=>(
                  <div key={i} className="space-y-2">
                    <TeamColumn 
                      teamIndex={i} 
                      labelKit={kitForTeam(i)} 
                      players={list} 
                      showOVR={isAdmin} 
                      isAdmin={isAdmin} 
                      dropHint={dropHint}
                      isDraftMode={isDraftMode}
                      captainId={captainIds[i]}
                      onRemovePlayer={handleRemovePlayer}
                      onSetCaptain={handleSetCaptain}
                      matches={matches}
                      showAIPower={showAIPower}
                      customMemberships={customMemberships}
                      teamColor={teamColors[i]}
                      onColorChange={(newColor) => {
                        const updated = Array.from({length: previewTeams.length}, (_, idx) => 
                          idx === i ? newColor : (teamColors[idx] || null)
                        )
                        setTeamColors(updated)
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <DragOverlay>
              {activePlayerId?(<DragGhost player={players.find(p=>String(p.id)===String(activePlayerId))} showOVR={isAdmin} customMemberships={customMemberships}/>):null}
            </DragOverlay>
          </DndContext>
        </div>

        <div className="flex flex-wrap gap-2">
          {isAdmin&&(
            <div className="flex items-center gap-2">
              <button onClick={saveAsUpcomingMatch} className="rounded bg-blue-500 px-4 py-2 text-white font-semibold hover:bg-blue-600">예정 매치로 저장</button>
              <button onClick={save} className="rounded bg-emerald-500 px-4 py-2 text-white font-semibold hover:bg-emerald-600">매치 저장</button>
            </div>
          )}
        </div>
      </div>
    </Card>

    <div className="grid gap-4">
      {(() => {
        const activeMatches = filterExpiredMatches(upcomingMatches)
        
        // 만료된 매치가 있다면 자동으로 DB에서 제거
        if (activeMatches.length !== upcomingMatches.length && upcomingMatches.length > 0) {
          const expiredCount = upcomingMatches.length - activeMatches.length
          setTimeout(() => {
            // 비동기로 만료된 매치들을 DB에서 제거
            activeMatches.forEach((match, index) => {
              const originalMatch = upcomingMatches.find(m => m.id === match.id)
              if (originalMatch) {
                onUpdateUpcomingMatch(match.id, match)
              }
            })
            
            // 만료된 매치들 삭제
            upcomingMatches.forEach(match => {
              if (!activeMatches.find(m => m.id === match.id)) {
                onDeleteUpcomingMatch(match.id)
              }
            })
            
            if (expiredCount > 0) {
              notify(`${expiredCount}개의 만료된 예정 매치가 자동으로 제거되었습니다 🗑️`)
            }
          }, 100)
        }
        
        return activeMatches.length > 0 ? (
          <Card title="예정된 매치">
            <div className="space-y-2">
              {activeMatches.map(match => {
              const isDraftComplete = match.isDraftComplete || false
              return (
                <div key={match.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex-1">
                    <div className="font-medium text-sm">
                      {new Date(match.dateISO).toLocaleDateString('ko-KR', {
                        month: 'short',
                        day: 'numeric',
                        weekday: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                    <div className="text-xs text-gray-600 flex items-center flex-wrap gap-2">
                      <span>{match.location?.name || '장소 미정'} · {match.participantIds?.length || 0}명 참가 예정</span>
                      {match.isDraftMode && (
                        <span 
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] rounded-full font-semibold ${
                            isDraftComplete 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-yellow-100 text-yellow-800 draft-status-badge-enhanced'
                          }`}
                          style={!isDraftComplete ? {
                            position: 'relative',
                            overflow: 'hidden',
                            boxShadow: '0 0 12px rgba(245, 158, 11, 0.5), 0 0 24px rgba(245, 158, 11, 0.2)',
                            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fef3c7 100%)',
                            backgroundSize: '200% 100%',
                            border: '1px solid #fcd34d'
                          } : {}}
                        >
                          <span style={{zIndex: 1, position: 'relative', fontWeight: '600'}}>{isDraftComplete ? 'Draft Complete' : 'Draft in Progress'}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      {match.isDraftMode && (
                        <label className="inline-flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={isDraftComplete}
                            onChange={(e) => {
                              const updatedMatch = { ...match, isDraftComplete: e.target.checked }
                              onUpdateUpcomingMatch(match.id, updatedMatch)
                              notify(e.target.checked ? '드래프트가 완료로 표시되었습니다 ✅' : '드래프트가 진행중으로 표시되었습니다 ✅')
                            }}
                            className="w-3 h-3 text-emerald-600 bg-gray-100 border-gray-300 rounded focus:ring-emerald-500 focus:ring-2"
                          />
                          <span className="text-gray-700">완료</span>
                        </label>
                      )}
                      <button
                        onClick={() => loadUpcomingMatchIntoPlanner(match)}
                        className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        불러오기
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('이 예정된 매치를 삭제하시겠습니까?')) {
                            onDeleteUpcomingMatch(match.id)
                            notify('예정된 매치가 삭제되었습니다 ✅')
                          }
                        }}
                        className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                        title="예정된 매치 삭제"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
        ) : null
      })()}

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

/* 컬럼/플레이어 렌더 */
function TeamColumn({teamIndex,labelKit,players,showOVR,isAdmin,dropHint,isDraftMode,captainId,onRemovePlayer,onSetCaptain,matches,showAIPower,customMemberships=[],teamColor,onColorChange}){
  const id=`team-${teamIndex}`
  const {setNodeRef,isOver}=useDroppable({id})
  const [showColorPicker, setShowColorPicker] = React.useState(false)
  const [customColorHex, setCustomColorHex] = React.useState('#3b82f6')
  const [customLabel, setCustomLabel] = React.useState('')
  
  // Preset colors
  const presetColors = [
    { bg: '#ffffff', label: 'White' },
    { bg: '#1c1917', label: 'Black' },
    { bg: '#2563eb', label: 'Blue' },
    { bg: '#dc2626', label: 'Red' },
    { bg: '#059669', label: 'Green' },
    { bg: '#7c3aed', label: 'Purple' },
    { bg: '#f97316', label: 'Orange' },
    { bg: '#0d9488', label: 'Teal' },
    { bg: '#db2777', label: 'Pink' },
    { bg: '#facc15', label: 'Yellow' },
  ]
  
  // Calculate text color based on background brightness
  const getTextColor = (bgHex) => {
    const hex = bgHex.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    return brightness > 155 ? '#000000' : '#ffffff'
  }
  
  // Apply preset color
  const applyPresetColor = (preset) => {
    const textColor = getTextColor(preset.bg)
    const borderColor = preset.bg === '#ffffff' ? '#d1d5db' : preset.bg
    onColorChange({
      bg: preset.bg,
      text: textColor,
      border: borderColor,
      label: preset.label
    })
    setShowColorPicker(false)
  }
  
  // Apply custom color
  const applyCustomColor = () => {
    const textColor = getTextColor(customColorHex)
    const label = customLabel.trim() || 'Custom'
    onColorChange({
      bg: customColorHex,
      text: textColor,
      border: customColorHex,
      label: label
    })
    setShowColorPicker(false)
  }
  
  
  // 오직 GK 포지션만 있는 선수만 제외 (멀티 포지션 GK는 포함)
  const non=players.filter(p=>{
    // Unknown 선수는 제외
    if (isUnknownPlayer(p)) return false
    
    const positions = p.positions || (p.position ? [p.position] : [p.pos])
    
    // positions 배열이 있는 경우
    if (positions && Array.isArray(positions) && positions.length > 0) {
      // 오직 GK만 있으면 제외, 그 외는 포함 (GK + 다른 포지션 = 포함)
      return !(positions.length === 1 && positions[0] === 'GK')
    }
    
    // 레거시 position 필드 체크 (GK만 있으면 제외)
    return (p.position||p.pos) !== 'GK'
  })
  
  const sum=non.reduce((a,p)=>a+(p.ovr??overall(p)),0)
  const avg=non.length?Math.round(sum/non.length):0
  const showIndicator=dropHint?.team===teamIndex
  const indicator=(<li className="my-1 h-2 rounded bg-emerald-500/70 animate-pulse shadow-[0_0_0_2px_rgba(16,185,129,.35)]"/>)
  
  const rendered=[]
  for(let i=0;i<players.length;i++){
    if(showIndicator&&dropHint.index===i)rendered.push(<React.Fragment key={`hint-${i}`}>{indicator}</React.Fragment>)
    rendered.push(<PlayerRow key={players[i].id} player={players[i]} showOVR={showOVR} isAdmin={isAdmin} teamIndex={teamIndex} isDraftMode={isDraftMode} isCaptain={captainId===players[i].id} onRemove={onRemovePlayer} onSetCaptain={onSetCaptain} matches={matches} showAIPower={showAIPower} customMemberships={customMemberships}/>)
  }
  if(showIndicator&&dropHint.index===players.length)rendered.push(<React.Fragment key="hint-end">{indicator}</React.Fragment>)
  
  // Use teamColor for styling
  const headerStyle = teamColor ? {
    backgroundColor: teamColor.bg,
    color: teamColor.text,
    borderColor: teamColor.border,
  } : {}
  
  return(<div ref={setNodeRef} className={`rounded-lg border bg-white transition ${isOver?'border-emerald-500 ring-2 ring-emerald-200':'border-gray-200'}`}>
    <div 
      className={`mb-1 flex items-center justify-between px-3 py-2 text-xs ${!teamColor ? labelKit.headerClass : ''}`}
      style={teamColor ? headerStyle : {}}
    >
      <div className="font-semibold flex items-center gap-2">
        <span>팀 {teamIndex+1}</span>
      </div>
      <div className="opacity-80 flex items-center gap-2">
        <span>{teamColor ? teamColor.label : labelKit.label} · {players.length}명</span>
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
        {isAdmin && (
          <button
            onClick={() => setShowColorPicker(true)}
            className="ml-2 px-2 py-1 rounded-md text-[10px] font-medium border transition-all hover:shadow-md"
            style={{
              backgroundColor: teamColor ? teamColor.bg : '#f3f4f6',
              color: teamColor ? teamColor.text : '#374151',
              borderColor: teamColor ? teamColor.border : '#d1d5db'
            }}
            title="팀 색상 변경"
          >
            색상
          </button>
        )}
      </div>
    </div>
    
    {/* Color Picker Modal - Using Portal for proper z-index */}
    {showColorPicker && ReactDOM.createPortal(
      <div 
        className="fixed inset-0 bg-black/50 flex items-center justify-center" 
        style={{ zIndex: 9999 }}
        onClick={() => setShowColorPicker(false)}
      >
        <div 
          className="bg-white rounded-lg p-4 sm:p-6 max-w-md w-full mx-4 shadow-2xl" 
          onClick={e => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold mb-3">팀 {teamIndex+1} 색상 선택</h3>
          
          {/* Preset Colors */}
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">프리셋 색상</p>
            <div className="grid grid-cols-5 gap-2">
              {presetColors.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => applyPresetColor(preset)}
                  className="h-12 rounded-lg border-2 hover:scale-105 transition-transform shadow-sm"
                  style={{
                    backgroundColor: preset.bg,
                    borderColor: preset.bg === '#ffffff' ? '#d1d5db' : preset.bg
                  }}
                  title={preset.label}
                />
              ))}
            </div>
          </div>
          
          {/* Custom Color */}
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">커스텀 색상</p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">색상 선택</label>
                <input
                  type="color"
                  value={customColorHex}
                  onChange={(e) => setCustomColorHex(e.target.value)}
                  className="w-full h-10 rounded cursor-pointer border border-gray-300"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">색상 이름</label>
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="예: 하늘색"
                  className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
            </div>
            <button
              onClick={applyCustomColor}
              className="mt-2 w-full px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 transition font-medium"
            >
              커스텀 색상 적용
            </button>
          </div>
          
          <button
            onClick={() => setShowColorPicker(false)}
            className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition font-medium"
          >
            닫기
          </button>
        </div>
      </div>,
      document.body
    )}
    
    <SortableContext id={id} items={players.map(p=>String(p.id))} strategy={verticalListSortingStrategy}>
      <ul className="space-y-1 px-3 pb-3 text-sm min-h-[44px]">
        {isOver&&!showIndicator&&(<li className="rounded border-2 border-dashed border-emerald-400/70 bg-emerald-50/40 px-2 py-1 text-xs text-emerald-700">여기에 드롭</li>)}
        {rendered}
        {players.length===0&&!isOver&&(<li className="text-xs text-gray-400">팀원 없음 — 이 카드로 드래그해서 추가</li>)}
      </ul>
    </SortableContext>
  </div>)}

/* PlayerRow */
function PlayerRow({player,showOVR,isAdmin,teamIndex,isDraftMode,isCaptain,onRemove,onSetCaptain,matches,showAIPower,customMemberships=[]}){
  const{attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id:String(player.id)})
  const style={transform:CSS.Transform.toString(transform),transition,opacity:isDragging?0.7:1,boxShadow:isDragging?'0 6px 18px rgba(0,0,0,.12)':undefined,borderRadius:8,background:isDragging?'rgba(16,185,129,0.06)':undefined}
  const pos=positionGroupOf(player),isGK=pos==='GK',unknown=isUnknownPlayer(player),ovrVal=unknown?'?':player.ovr??overall(player)
  const member=isMember(player.membership)
  
  // 배지 정보 가져오기
  const badges = getBadgesWithCustom(player.membership, isCaptain, customMemberships)
  const badgeInfo = isCaptain ? null : getMembershipBadge(player.membership, customMemberships)
  
  // OVR 색상 함수
  const getOVRColor = (ovr) => {
    if (ovr >= 80) return 'from-emerald-500 to-emerald-600'
    if (ovr >= 70) return 'from-blue-500 to-blue-600'
    if (ovr >= 60) return 'from-amber-500 to-amber-600'
    return 'from-stone-500 to-stone-600'
  }
  
  // AI 파워 칩 색상 함수
  const aiPowerChipClass = (power) => {
    if (power >= 1300) return 'from-purple-500 to-purple-700'
    if (power >= 1100) return 'from-emerald-500 to-emerald-700'
    if (power >= 900) return 'from-blue-500 to-blue-700'
    if (power >= 700) return 'from-amber-500 to-amber-700'
    return 'from-stone-400 to-stone-600'
  }
  
  const aiPower = showAIPower ? calculateAIPower(player, matches) : null
  
  return(
    <li ref={setNodeRef} style={style} className="flex items-start gap-2 border-t border-gray-100 pt-1 first:border-0 first:pt-0 touch-manipulation cursor-grab active:cursor-grabbing" {...attributes}{...listeners}>
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <InitialAvatar id={player.id} name={player.name} size={24} badges={badges} photoUrl={player.photoUrl} customMemberships={customMemberships} badgeInfo={badgeInfo} />
        <span className="whitespace-normal break-words">{player.name}</span>
        <PositionChips positions={player.positions || []} size="sm" maxDisplay={2} />
      </span>

      {!isGK && showOVR && <span className={`ovr-chip shrink-0 rounded-lg bg-gradient-to-br ${unknown?'from-stone-400 to-stone-500':getOVRColor(ovrVal)} text-white text-[11px] px-2 py-[2px] font-semibold shadow-sm`} data-ovr>
        {unknown ? '?' : ovrVal}
      </span>}
      
      {/* AI 파워 점수 표시 (페이드인 애니메이션) */}
      {showAIPower && aiPower !== null && (
        <span 
          className={`shrink-0 rounded-lg bg-gradient-to-br ${aiPowerChipClass(aiPower)} text-white text-[11px] px-2 py-[2px] font-semibold shadow-sm animate-fadeIn`} 
          title="AI 파워 점수"
          style={{
            animation: 'fadeIn 0.5s ease-in-out'
          }}
        >
          AI {aiPower}
        </span>
      )}
      
      {/* Admin 버튼들 */}
      {isAdmin && (
        <span className="flex items-center gap-1 shrink-0">
          {isDraftMode && (
            <button
              className={`border-0 w-5 h-5 flex items-center justify-center p-0 transition-all ${
                isCaptain 
                  ? 'opacity-100 scale-110 ring-2 ring-yellow-400 ring-offset-1 rounded-full' 
                  : 'bg-transparent hover:opacity-80 hover:scale-110'
              }`}
              title={isCaptain ? "주장 해제" : "이 선수를 주장으로 지정"}
              onClick={(e)=>{
                e.stopPropagation();
                onSetCaptain&&onSetCaptain(player.id,teamIndex)
              }}
              aria-label={isCaptain ? "주장 해제" : "주장 지정"}
            >
              <img 
                src={captainIcon} 
                alt="주장" 
                className={`w-full h-full object-contain ${isCaptain ? 'brightness-110' : ''}`} 
              />
            </button>
          )}
          <button
            className="rounded-full border border-gray-300 bg-white w-5 h-5 flex items-center justify-center text-gray-700 hover:bg-gray-100 p-0"
            title="이 팀에서 제외"
            onClick={(e)=>{e.stopPropagation();onRemove&&onRemove(player.id,teamIndex)}}
            aria-label="팀에서 제외"
          >
            <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
          </button>
        </span>
      )}
    </li>
  )
}

/* … 나머지(DragGhost, kitForTeam, FullscreenModal 등) 기존 구현 유지 … */
function kitForTeam(i){return[
  {label:"White",headerClass:"bg-white text-stone-800 border-b border-stone-300"},
  {label:"Black",headerClass:"bg-stone-900 text-white border-b border-stone-900"},
  {label:"Blue",headerClass:"bg-blue-600 text-white border-b border-blue-700"},
  {label:"Red",headerClass:"bg-red-600 text-white border-b border-red-700"},
  {label:"Green",headerClass:"bg-emerald-600 text-white border-b border-emerald-700"},
  {label:"Purple",headerClass:"bg-violet-600 text-white border-b border-violet-700"},
  {label:"Orange",headerClass:"bg-orange-500 text-white border-b border-orange-600"},
  {label:"Teal",headerClass:"bg-teal-600 text-white border-b border-teal-700"},
  {label:"Pink",headerClass:"bg-pink-600 text-white border-b border-pink-700"},
  {label:"Yellow",headerClass:"bg-yellow-400 text-stone-900 border-b border-yellow-500"},
][i%10]}
function DragGhost({player,showOVR,customMemberships=[]}){
  if(!player)return null
  const pos=positionGroupOf(player),isGK=pos==='GK',unknown=isUnknownPlayer(player),ovrVal=unknown?'?':player.ovr??overall(player)
  const badges = getBadgesWithCustom(player.membership, false, customMemberships)
  const badgeInfo = getMembershipBadge(player.membership, customMemberships)
  
  return(
  <div className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 shadow-lg">
    <div className="flex items-center gap-2 text-sm">
  <InitialAvatar id={player.id} name={player.name} size={22} badges={badges} photoUrl={player.photoUrl} customMemberships={customMemberships} badgeInfo={badgeInfo} />
      <span className="truncate">{player.name}</span>
  {/* guest badge is shown on avatar */}
      <span className={`ml-1 inline-flex items-center rounded-full px-2 py-[2px] text-[11px] ${isGK?'bg-amber-100 text-amber-800':pos==='DF'?'bg-blue-100 text-blue-800':pos==='MF'?'bg-emerald-100 text-emerald-800':pos==='FW'?'bg-purple-100 text-purple-800':'bg-stone-100 text-stone-700'}`}>{pos}</span>
      {showOVR&&!isGK&&<span className="text-xs text-gray-600">OVR {ovrVal}</span>}
    </div>
  </div>
)}
function FullscreenModal({children,onClose}){return(<div className="fixed inset-0 z-50 bg-black/50 p-4 overflow-auto"><div className="mx-auto max-w-5xl rounded-lg bg-white p-4">{children}<div className="mt-3 text-right"><button onClick={onClose} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm">닫기</button></div></div></div>)}

/* 빠른 출석 편집 */
function QuickAttendanceEditor({ players, snapshot, onDraftChange, customMemberships=[] }){
  const [teamIdx,setTeamIdx]=useState(0)
  const [q,setQ]=useState("")
  const [showList,setShowList]=useState(false) // 선수 목록 표시 여부
  const [isComposing,setIsComposing]=useState(false) // 한글 입력 중 여부
  const [selectedTag,setSelectedTag]=useState("") // 선택된 태그 필터
  const [selectedMembership,setSelectedMembership]=useState("") // 선택된 멤버십 필터
  
  const notInMatch = useMemo(()=>{
    const inside=new Set(snapshot.flat().map(String))
    return players.filter(p=>!inside.has(String(p.id)))
  }, [players, snapshot])
  
  // 모든 사용 가능한 태그 목록 추출 (이름, 색상 포함) - 전체 선수에서 추출
  const allTags = useMemo(() => {
    const tagMap = new Map()
    players.forEach(p => {
      if (p.tags && Array.isArray(p.tags)) {
        p.tags.forEach(tag => {
          if (tag && tag.name) {
            // 같은 이름의 태그가 여러 색상으로 있을 수 있지만, 첫 번째 것을 사용
            if (!tagMap.has(tag.name)) {
              tagMap.set(tag.name, { name: tag.name, color: tag.color })
            }
          }
        })
      }
    })
    return Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [players])
  
  // 모든 사용 가능한 멤버십 목록 추출 - 전체 선수에서 추출
  const allMemberships = useMemo(() => {
    const membershipSet = new Set()
    players.forEach(p => {
      const membership = S(p.membership || '').trim()
      if (membership) {
        membershipSet.add(membership)
      }
    })
    // customMemberships 기반으로 정렬
    const membershipArray = Array.from(membershipSet)
    return membershipArray.sort((a, b) => {
      const badgeA = getMembershipBadge(a, customMemberships)
      const badgeB = getMembershipBadge(b, customMemberships)
      // 순서: customMemberships 순서 우선, 그 다음 알파벳
      const indexA = customMemberships.findIndex(m => m.name === a)
      const indexB = customMemberships.findIndex(m => m.name === b)
      if (indexA !== -1 && indexB !== -1) return indexA - indexB
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1
      return a.localeCompare(b)
    })
  }, [players, customMemberships])
  
  const filtered=useMemo(()=>{
    const t=q.trim().toLowerCase()
    let base = notInMatch
    
    // 태그 필터 적용
    if (selectedTag) {
      base = base.filter(p => 
        p.tags && Array.isArray(p.tags) && 
        p.tags.some(tag => tag.name === selectedTag)
      )
    }
    
    // 멤버십 필터 적용
    if (selectedMembership) {
      base = base.filter(p => {
        const membership = S(p.membership || '').trim()
        return membership === selectedMembership
      })
    }
    
    // 이름 필터 적용
    if (t) {
      base = base.filter(p => (p.name||"").toLowerCase().includes(t))
    }
    
    return base.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""))
  },[notInMatch,q,selectedTag,selectedMembership])
  
  // 검색어가 입력되면 자동으로 목록 표시
  const shouldShowList = showList || q.trim().length > 0
  
  // 클릭 시 바로 팀에 추가
  const addPlayerToTeam = (pid) => {
    const next = snapshot.map((arr,i)=>i===teamIdx?[...arr, pid]:arr)
    onDraftChange(next)
    setQ('') // 검색어 초기화
    const playerName = players.find(p => p.id === pid)?.name || '선수'
    notify(`${playerName}을(를) 팀 ${teamIdx + 1}에 추가했습니다 ✅`)
  }
  
  // 필터된 모든 선수를 팀에 추가
  const addAllFilteredToTeam = () => {
    if (filtered.length === 0) return
    const filteredIds = filtered.map(p => p.id)
    const next = snapshot.map((arr,i)=>i===teamIdx?[...arr, ...filteredIds]:arr)
    onDraftChange(next)
    setQ('') // 검색어 초기화
    setSelectedTag('') // 태그 필터 초기화
    setSelectedMembership('') // 멤버십 필터 초기화
    notify(`${filtered.length}명의 선수를 팀 ${teamIdx + 1}에 추가했습니다 ✅`)
  }
  
  // Enter 키로 1명일 때 바로 추가
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !isComposing && filtered.length === 1) {
      e.preventDefault()
      addPlayerToTeam(filtered[0].id)
    }
  }
  
  return (
    <div className="mt-3 rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="text-xs text-gray-600 font-medium">빠른 선수 추가</label>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
          <span className="text-xs text-emerald-700 font-medium">추가할 팀:</span>
          <select 
            className="rounded border-0 bg-transparent px-1.5 py-0.5 text-xs font-bold text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer" 
            value={teamIdx} 
            onChange={e=>setTeamIdx(Number(e.target.value))}
          >
            {snapshot.map((_,i)=><option key={i} value={i}>팀 {i+1}</option>)}
          </select>
        </div>
        <input 
          className="flex-1 min-w-[180px] rounded border border-gray-300 bg-white px-2 py-1.5 text-sm" 
          placeholder="이름 검색..."
          value={q}
          onChange={e=>setQ(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={()=>setIsComposing(true)}
          onCompositionEnd={()=>setIsComposing(false)}
        />
        {(selectedTag || selectedMembership || q.trim()) && (
          <button 
            onClick={()=>{setSelectedTag('');setSelectedMembership('');setQ('')}}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            title="필터 초기화"
          >
            ✕
          </button>
        )}
      </div>
      
      {allTags.length > 0 && (
        <div className="mb-2">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-xs text-gray-500">태그:</span>
            <button
              onClick={() => setSelectedTag('')}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                selectedTag === '' 
                  ? 'bg-stone-700 text-white shadow-sm' 
                  : 'bg-stone-100 text-stone-700 border border-stone-200 hover:bg-stone-200'
              }`}
            >
              전체
            </button>
            {allTags.map(tag => {
              const colorClass = getTagColorClass(tag.color)
              const isActive = selectedTag === tag.name
              const style = tag.color && tag.color.startsWith('#') 
                ? { 
                    backgroundColor: isActive ? tag.color : tag.color + '20', 
                    borderColor: tag.color + '40', 
                    color: isActive ? '#ffffff' : tag.color 
                  } 
                : {}
              return (
                <button
                  key={tag.name}
                  onClick={() => setSelectedTag(tag.name)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-all ${
                    isActive 
                      ? colorClass ? colorClass.replace('bg-', 'bg-').replace('-100', '-600').replace('text-', 'text-white border-') : 'shadow-sm'
                      : colorClass || 'bg-stone-100 text-stone-700 border-stone-200'
                  } ${!isActive && 'hover:opacity-80'}`}
                  style={Object.keys(style).length > 0 ? style : undefined}
                >
                  {tag.name}
                </button>
              )
            })}
          </div>
          
          {/* 멤버십 필터 */}
          {allMemberships.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-xs text-gray-500">멤버십:</span>
              <button
                onClick={() => setSelectedMembership('')}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                  selectedMembership === '' 
                    ? 'bg-stone-700 text-white shadow-sm' 
                    : 'bg-stone-100 text-stone-700 border border-stone-200 hover:bg-stone-200'
                }`}
              >
                전체
              </button>
              {allMemberships.map(membership => {
                const badgeInfo = getMembershipBadge(membership, customMemberships)
                const isActive = selectedMembership === membership
                return (
                  <button
                    key={membership}
                    onClick={() => setSelectedMembership(membership)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-all ${
                      isActive 
                        ? badgeInfo?.bgColor || 'bg-blue-600 text-white shadow-sm' 
                        : badgeInfo?.bgColor?.replace('bg-', 'bg-').replace('-600', '-100').replace('text-white', badgeInfo.textColor || 'text-stone-700') || 'bg-stone-100 text-stone-700 border-stone-200'
                    } ${!isActive && 'hover:opacity-80'}`}
                  >
                    {membership}
                  </button>
                )
              })}
            </div>
          )}
          
          {/* 전체 추가 버튼 */}
          {filtered.length > 0 && (
            <button
              onClick={addAllFilteredToTeam}
              className="w-full rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400 transition-all flex items-center justify-center gap-1.5"
              title={`${selectedTag ? `"${selectedTag}" 태그의 ` : ''}${selectedMembership ? `"${selectedMembership}" 멤버십의 ` : ''}모든 선수 (${filtered.length}명)를 팀 ${teamIdx + 1}에 추가`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>
                {selectedTag || selectedMembership ? `필터된 선수 모두 추가` : '전체 선수 모두 추가'}
                <span className="ml-1 text-emerald-600">({filtered.length}명)</span>
              </span>
            </button>
          )}
        </div>
      )}
      
      {notInMatch.length === 0 ? (
        <div className="text-xs text-gray-400 py-2">모든 선수가 팀에 배정되었습니다</div>
      ) : (
        <>
          {!shouldShowList ? (
            <div className="text-center py-2">
              <button 
                onClick={() => setShowList(true)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                + 전체 선수 더보기 ({notInMatch.length}명)
              </button>
            </div>
          ) : (
            <>
              {(selectedTag || selectedMembership || q.trim()) && (
                <div className="mb-2 text-xs text-gray-600">
                  필터된 선수: {filtered.length}명
                  {selectedTag && <span className="ml-1 font-medium">(태그: {selectedTag})</span>}
                  {selectedMembership && <span className="ml-1 font-medium">(멤버십: {selectedMembership})</span>}
                </div>
              )}
              <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {filtered.map(p => {
                    const badges = getBadgesWithCustom(p.membership, false, customMemberships)
                    const badgeInfo = getMembershipBadge(p.membership, customMemberships)
                    return (
                      <button 
                        key={p.id} 
                        onClick={() => addPlayerToTeam(p.id)}
                        className="group flex items-center gap-2 text-xs p-2 rounded hover:bg-white hover:shadow-sm cursor-pointer transition border border-transparent hover:border-emerald-300 relative"
                        title={`팀 ${teamIdx + 1}에 추가`}
                      >
                        <InitialAvatar id={p.id} name={p.name} size={28} badges={badges} photoUrl={p.photoUrl} customMemberships={customMemberships} badgeInfo={badgeInfo} />
                        <span className="truncate text-left flex-1">{p.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-emerald-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">팀{teamIdx + 1}</span>
                          <span className="text-emerald-600 text-lg leading-none">+</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="mt-2 text-center">
                <button 
                  onClick={() => setShowList(false)}
                  className="text-xs text-gray-600 hover:text-gray-700 font-medium"
                >
                  접기
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

<style>{`
  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }
  
  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
  

  
  @keyframes draftStatusPulse {
    0%, 100% {
      box-shadow: 0 0 12px rgba(245, 158, 11, 0.5), 0 0 24px rgba(245, 158, 11, 0.2);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 0 20px rgba(245, 158, 11, 0.7), 0 0 40px rgba(245, 158, 11, 0.3);
      transform: scale(1.05);
    }
  }
  
  @keyframes backgroundShift {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  }
  
  .draft-status-badge-enhanced {
    animation: 
      draftStatusPulse 2s infinite ease-in-out,
      backgroundShift 3s infinite ease-in-out;
    will-change: transform, box-shadow, background-position;
  }
  
  /* 접근성 - 애니메이션 감소 선호 사용자 */
  @media (prefers-reduced-motion: reduce) {
    .draft-status-badge-enhanced {
      animation: none !important;
    }
    
    .draft-status-badge-enhanced::before,
    .draft-status-badge-enhanced::after {
      animation: none !important;
    }
  }
`}</style>
