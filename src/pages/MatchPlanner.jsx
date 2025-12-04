// src/pages/MatchPlanner.jsx
import React,{useEffect,useMemo,useRef,useState}from'react'
import ReactDOM from'react-dom'
import Card from'../components/Card'
import ConfirmDialog from'../components/ConfirmDialog'
import{mkMatch,decideMode,splitKTeams,hydrateMatch}from'../lib/match'
import { extractSeason } from '../lib/matchUtils'
import { localDateTimeToISO, getCurrentLocalDateTime } from '../lib/dateUtils'
// ...other imports...

// 포지션 고려 팀 분배 함수 (splitKTeamsPosAware)
function splitKTeamsPosAware(players = [], k = 2, shuffleSeed = 0) {
  const createSeededRandom = (seed) => {
    let s = Number(seed) || 0;
    if (s <= 0) s = 1;
    const MOD = 2147483647;
    return () => {
      s = (s * 16807) % MOD;
      return (s - 1) / (MOD - 1);
    };
  };

  const randomFn = shuffleSeed ? createSeededRandom(shuffleSeed) : () => Math.random();

  // 포지션별로 그룹화
  const grouped = { GK: [], DF: [], MF: [], FW: [], OTHER: [] };
  for (const p of players) {
    const positions = p.positions || (p.position ? [p.position] : [p.pos]);
    let cat = 'OTHER';
    if (positions.some(pos => /GK/i.test(pos))) cat = 'GK';
    else if (positions.some(pos => /DF|CB|LB|RB|WB|RWB|LWB/i.test(pos))) cat = 'DF';
    else if (positions.some(pos => /MF|CAM|CDM|CM|LM|RM/i.test(pos))) cat = 'MF';
    else if (positions.some(pos => /FW|ST|CF|LW|RW/i.test(pos))) cat = 'FW';
    grouped[cat].push(p);
  }

  const fisherYatesShuffle = (list) => {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const shuffled = {};
  Object.keys(grouped).forEach(cat => {
    shuffled[cat] = fisherYatesShuffle(grouped[cat]);
  });

  // 팀별로 균등하게 분배
  const teams = Array.from({ length: k }, () => []);
  let idx = 0;
  for (const cat of ['GK', 'DF', 'MF', 'FW', 'OTHER']) {
    for (const p of shuffled[cat]) {
      teams[idx % k].push(p);
      idx++;
    }
  }
  return { teams };
}
import{overall,isUnknownPlayer}from'../lib/players'
import{notify}from'../components/Toast'
import{logger}from'../lib/logger'
import PositionChips from'../components/PositionChips'
import{DndContext,DragOverlay,pointerWithin,PointerSensor,TouchSensor,useSensor,useSensors,useDroppable}from'@dnd-kit/core'
import{SortableContext,useSortable,verticalListSortingStrategy}from'@dnd-kit/sortable'
import{CSS}from'@dnd-kit/utilities'
import InitialAvatar from'../components/InitialAvatar'
import { getBadgesWithCustom } from '../lib/matchUtils'
import FreePitch from'../components/pitch/FreePitch'
import{assignToFormation,recommendFormation,countPositions}from'../lib/formation'
import{seededShuffle}from'../utils/random'
import SavedMatchesList from'../components/SavedMatchesList'
import { createUpcomingMatch, filterExpiredMatches, getNextSaturday630 } from '../lib/upcomingMatch'
import { calculateAIPower } from '../lib/aiPower'
import * as MatchHelpers from '../lib/matchHelpers'
import captainIcon from '../assets/Captain.PNG'
import { getMembershipBadge } from '../lib/membershipConfig'
import { getTagColorClass, migratePositionToPositions, getPositionCategory, getPrimaryCategory } from '../lib/constants'
import { toStr, isMember } from '../lib/matchUtils'
import { calcFees, isMember as isMemberFee } from '../lib/fees'
import { upsertMatchPayment } from '../lib/accounting'
import { getTextColor } from '../utils/color'
import DateTimePicker from '../components/DateTimePicker'
import Select from '../components/Select'

/* ───────── 공통 유틸 ───────── */
const S = toStr
const POS_ORDER = ["GK","DF","MF","FW","OTHER",""] // 포지션 정렬 순서

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
  const[dateISO,setDateISO]=useState(()=>getCurrentLocalDateTime()),[attendeeIds,setAttendeeIds]=useState([]),[criterion,setCriterion]=useState('overall'),[shuffleSeed,setShuffleSeed]=useState(0)
  const[enablePitchFee,setEnablePitchFee]=useState(true) // 구장비 사용 여부 토글
  const[dateError,setDateError]=useState(null) // 과거 날짜 오류 메시지
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
  // 표기 토글: 포지션칩, Overall, AI 파워칩
  const[showPositions,setShowPositions]=useState(true)
  const[showOverallChip,setShowOverallChip]=useState(!!isAdmin)
  const[showAIPowerChip,setShowAIPowerChip]=useState(false)
  const[isAILoading,setIsAILoading]=useState(false) // AI 배정 로딩 상태
  const[linkedUpcomingMatchId,setLinkedUpcomingMatchId]=useState(null) // 현재 편집 중인 예정 매치 ID
  const[upcomingDirty,setUpcomingDirty]=useState(false) // 불러온 예정 매치 편집 후 변경 여부 표시
  const[activeSortMode,setActiveSortMode]=useState(null) // 현재 활성화된 정렬 모드: 'name' | 'position' | 'ovr' | 'aipower' | null
  const[aiDistributedTeams,setAiDistributedTeams]=useState(null) // AI 배정 이전 상태 (Revert용)
  const[teamColors,setTeamColors]=useState([]) // Team colors: [{bg, text, border, label}, ...] - empty array means use default kit colors
  const[confirmDelete,setConfirmDelete]=useState({open:false,id:null,kind:null})
  
  // 시즌 필터 상태
  const [selectedSeason, setSelectedSeason] = useState('all')
  const activeUpcomingMatches = useMemo(() => filterExpiredMatches(upcomingMatches), [upcomingMatches])
  
  // 시즌 옵션 생성
  const seasonOptions = useMemo(() => {
    const seasons = new Set()
    for (const m of matches) {
      const season = extractSeason(m)
      if (season) seasons.add(season)
    }
    return ['all', ...Array.from(seasons).sort().reverse()]
  }, [matches])

  useEffect(() => {
    if (!seasonOptions || seasonOptions.length === 0) return
    setSelectedSeason((prev) => {
      // 유지 가능한 선택이면 그대로 둠
      if (prev && seasonOptions.includes(prev) && (prev !== 'all' || !seasonOptions.some(opt => opt !== 'all'))) {
        return prev
      }
      const preferred = seasonOptions.find((opt) => opt !== 'all')
      if (preferred) return preferred
      return 'all'
    })
  }, [seasonOptions])
  
  // 시즌별 필터링된 매치
  const seasonFilteredMatches = useMemo(() => {
    if (!selectedSeason || selectedSeason === 'all') return matches
    return matches.filter(m => extractSeason(m) === selectedSeason)
  }, [matches, selectedSeason])
  
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

  useEffect(() => {
    if (!Array.isArray(upcomingMatches) || upcomingMatches.length === 0) return
    if (typeof onDeleteUpcomingMatch !== 'function') return
    const activeIds = new Set(activeUpcomingMatches.map(m => m.id))
    const expired = upcomingMatches.filter(m => !activeIds.has(m.id))
    if (expired.length === 0) return
    expired.forEach(match => onDeleteUpcomingMatch(match.id))
    notify(`${expired.length}개의 만료된 예정 매치가 자동으로 제거되었습니다 🗑️`)
  }, [upcomingMatches, activeUpcomingMatches, onDeleteUpcomingMatch])
  
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
    // 팀 수 변경 시 주장 정보 조정 (기존 주장 유지, 새 팀은 null 추가)
    setCaptainIds(prev => {
      if (prev.length === teams) return prev
      const newCaptains = Array.from({length: teams}, (_, i) => prev[i] || null)
      return newCaptains
    })
    
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

  // 아직 어떤 팀에도 배정되지 않은 선수 목록 (컴팩트 추가용)
  const availablePlayers = useMemo(() => {
    const assigned = new Set(previewTeams.flat().map(p => String(p.id)))
    return players.filter(p => !assigned.has(String(p.id)))
  }, [players, previewTeams])

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

  const isPastDate = useMemo(()=>{
    if(!dateISO) return false
    try {
      // dateISO 형식: YYYY-MM-DDTHH:MM
      const dt = new Date(dateISO + (dateISO.length===16?':00':''))
      return dt.getTime() < Date.now() - 60_000
    } catch (e) { return false }
  },[dateISO])

  useEffect(()=>{ setDateError(isPastDate ? '과거 시점은 저장할 수 없습니다.' : null) },[isPastDate])

  function save(){
    if(!isAdmin){notify('Admin만 가능합니다.');return}
    let baseTeams=(latestTeamsRef.current&&latestTeamsRef.current.length)?latestTeamsRef.current:previewTeams
    
    // 주장을 각 팀의 맨 앞으로 정렬
    baseTeams = baseTeams.map((team, teamIdx) => {
      const capId = captainIds[teamIdx]
      if (!capId || !team || team.length === 0) return team
      
      // 주장을 찾아서 맨 앞으로 이동
      const capIdStr = String(capId)
      const captainIndex = team.findIndex(p => String(p.id) === capIdStr)
      if (captainIndex <= 0) return team // 이미 첫번째거나 없으면 그대로
      
      const newTeam = [...team]
      const captain = newTeam.splice(captainIndex, 1)[0]
      newTeam.unshift(captain)
      return newTeam
    })
    
    const snapshot=baseTeams.map(team=>team.map(p=>p.id))
    const ids=snapshot.flat()
    const objs=players.filter(p=>ids.includes(p.id))
  const fees= enablePitchFee ? computeFeesAtSave({baseCostValue:baseCost,attendees:objs,guestSurcharge}) : null
    
    // 드래프트 모드일 때 추가 필드들
    const draftFields = isDraftMode ? {
      selectionMode: 'draft',
      draftMode: true,
      draft: {
        captains: captainIds.slice() // 주장 정보는 draft 객체에 저장
      }
    } : {
      selectionMode: 'manual',
      // 일반 모드에서도 주장 정보 저장
      draft: {
        captains: captainIds.slice()
      }
    }
    
    // 날짜 문자열을 타임존 정보와 함께 ISO 형식으로 변환
  const dateISOFormatted = dateISO && dateISO.length >= 16 
    ? localDateTimeToISO(dateISO.slice(0,16)) 
    : localDateTimeToISO(getCurrentLocalDateTime())
    
    const payload={
      ...mkMatch({
        id:crypto.randomUUID?.()||String(Date.now()),
        dateISO: dateISOFormatted,attendeeIds:ids,criterion:posAware?'pos-aware':criterion,players,
        teamCount:baseTeams.length,
        location:{preset:locationPreset,name:locationName,address:locationAddress},
        mode,snapshot,board:placedByTeam,formations,locked:true,videos:[],
        ...draftFields
      }),
      ...(enablePitchFee && fees ? { fees } : { feesDisabled:true }),
      // Only include teamColors if at least one team has a custom color
      ...(teamColors && teamColors.length > 0 && teamColors.some(c => c !== null && c !== undefined) ? { teamColors } : {})
    }
    onSaveMatch(payload);notify(`${isDraftMode ? '드래프트 ' : ''}매치가 저장되었습니다 ✅`)
  }

  function saveAsUpcomingMatch(){
    if(!isAdmin){notify('Admin만 가능합니다.');return}
    if(!onSaveUpcomingMatch){notify('예정 매치 저장 기능이 없습니다.');return}
    if(isPastDate){ return }
    
    // 실제로 팀에 배정된 선수들의 ID 목록 가져오기
    const assignedPlayerIds = previewTeams.flat().map(p => p.id)
    
    if (assignedPlayerIds.length === 0) {
      notify('참가자를 먼저 선택해주세요.');return
    }

    // 팀 구성 스냅샷 저장 (선수 ID 배열)
    const teamsSnapshot = previewTeams.map(team => team.map(p => p.id))

    // 날짜 문자열을 타임존 정보와 함께 ISO 형식으로 변환
  const dateISOFormatted = dateISO && dateISO.length >= 16 
    ? localDateTimeToISO(dateISO.slice(0,16)) 
    : localDateTimeToISO(getCurrentLocalDateTime())

    const fees = enablePitchFee ? computeFeesAtSave({ baseCostValue: baseCost, attendees: assignedPlayerIds.map(id => players.find(p=>p.id===id)).filter(Boolean), guestSurcharge }) : null
    const upcomingMatch = createUpcomingMatch({
      dateISO: dateISOFormatted,
      participantIds: assignedPlayerIds,
      location: {
        preset: locationPreset,
        name: locationName,
        address: locationAddress
      },
      totalCost: enablePitchFee ? baseCost : 0,
      ...(enablePitchFee && fees ? { fees: { ...fees } } : {}),
      feesDisabled: !enablePitchFee,
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
  // live-sync 기능 제거: 수동 저장만 허용하여 자동 변형 방지
    notify(`${isDraftMode ? '드래프트 ' : ''}예정 매치로 저장되었습니다 ✅`)

    // 매치별 구장비 예상 금액을 match_payments에 반영 (멤버/게스트 구분)
    if (enablePitchFee && fees) {
      const memberFee = fees.memberFee || 0
      const guestFee = fees.guestFee || (memberFee + (fees.guestSurcharge || 2))
      const playerMap = new Map(players.map(p => [p.id, p]))
      Promise.all(
        assignedPlayerIds.map(pid => {
          const p = playerMap.get(pid)
          const expected = isMemberFee(p?.membership) ? memberFee : guestFee
          return upsertMatchPayment({
            matchId: upcomingMatch.id,
            playerId: pid,
            expectedAmount: expected,
            paymentStatus: 'pending'
          })
        })
      ).catch(()=>{})
    }
  }

  // 주장 또는 팀 구성 변경 시 연결된 예정 매치 자동 업데이트
  // 불러온 예정 매치 변경 감지 (자동 저장 없음 → dirty 플래그만)
  useEffect(() => {
    if(!linkedUpcomingMatchId) return
    if(dirtyGuardRef.current>0){ dirtyGuardRef.current--; return }
    setUpcomingDirty(true)
  }, [previewTeams, captainIds, formations, teamColors, dateISO, locationName, locationAddress, isDraftMode, baseCost, enablePitchFee])

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

  // 컴팩트 입력에서 팀에 선수 추가
  const handleAddPlayerToTeam = (playerId, teamIndex) => {
    const player = players.find(p => String(p.id) === String(playerId))
    if (!player) return
    const base = manualTeams ?? previewTeams
    const next = base.map((team, idx) => {
      if (idx !== teamIndex) return team
      // 중복 방지
      if (team.some(p => String(p.id) === String(playerId))) return team
      return [...team, player]
    })
    setManualTeams(next)
    latestTeamsRef.current = next
    setShowAIPower(false)
    setActiveSortMode(null)
    const playerName = player.name || '선수'
    notify(`${playerName}을(를) 팀 ${teamIndex + 1}에 추가했습니다 ✅`)
  }

  // 여러 명을 한 번에 팀에 추가 (노티는 호출측에서 처리)
  const handleAddManyPlayersToTeam = (playerIds, teamIndex) => {
    if (!Array.isArray(playerIds) || playerIds.length === 0) return
    const idSet = new Set(playerIds.map(id => String(id)))
    const playerMap = new Map(players.map(p => [String(p.id), p]))
    const toAdd = Array.from(idSet).map(id => playerMap.get(id)).filter(Boolean)
    if (toAdd.length === 0) return
    const base = manualTeams ?? previewTeams
    const next = base.map((team, idx) => {
      if (idx !== teamIndex) return team
      const existing = new Set(team.map(p => String(p.id)))
      const merged = [...team]
      toAdd.forEach(p => { if (!existing.has(String(p.id))) merged.push(p) })
      return merged
    })
    setManualTeams(next)
    latestTeamsRef.current = next
    setShowAIPower(false)
    setActiveSortMode(null)
  }

  const resetTeams = () => {
    setManualTeams(null)
    latestTeamsRef.current = []
    setCaptainIds(Array.from({ length: teams }, () => null))
    setShowAIPower(false)
    setActiveSortMode(null)
    setAiDistributedTeams(null)
    setPlacedByTeam([])
    setFormations([])
    notify('팀 배정이 초기화되었습니다 ♻️')
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
      position: getPrimaryCategory(p.positions || [])
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

  function loadSavedIntoPlanner(match){
    if(!match)return
    skipAutoResetRef.current=true
    const h=hydrateMatch(match,players),ts=h.teams||[]
    if(ts.length===0){notify('불러올 팀 구성이 없습니다.');return}
    const ids=ts.flat().map(p=>p.id)
    setTeamCount(ts.length)
    if(match.criterion)setCriterion(match.criterion)
    if(match.location){setLocationName(match.location.name||'');setLocationAddress(match.location.address||'')}
    if(match.dateISO)setDateISO(match.dateISO.slice(0,16))
    if(match.fees?.total)setCustomBaseCost(match.fees.total)
    setShuffleSeed(0)
    setManualTeams(ts)
    latestTeamsRef.current=ts
    setShowAIPower(false)
    const baseFormations=Array.isArray(match.formations)&&match.formations.length===ts.length?match.formations.slice():ts.map(list=>recommendFormation({count:list.length,mode:match.mode||'11v11',positions:countPositions(list)}))
    setFormations(baseFormations)
    const baseBoard=Array.isArray(match.board)&&match.board.length===ts.length?match.board.map(a=>Array.isArray(a)?a.slice():[]):ts.map((list,i)=>assignToFormation({players:list,formation:baseFormations[i]||'4-3-3'}))
    setPlacedByTeam(baseBoard)
    
    // ✅ 헬퍼 사용 - 드래프트 모드 및 주장 로드
    if(MatchHelpers.isDraftMatch(match)){
      setIsDraftMode(true)
      const caps = MatchHelpers.getCaptains(match)
      if(caps.length > 0) setCaptainIds(caps)
    }else{
      setIsDraftMode(false)
      setCaptainIds([])
    }
    
    if(match.teamColors&&Array.isArray(match.teamColors)&&match.teamColors.length===ts.length){setTeamColors(match.teamColors)}
    notify('저장된 매치를 팀배정에 불러왔습니다 ✅')
  }

  const dirtyGuardRef = useRef(0)

  function loadUpcomingMatchIntoPlanner(upcomingMatch) {
    if (!upcomingMatch) return
    skipAutoResetRef.current = true
    
    // 두 필드 모두 확인하여 참가자 ID 목록을 얻음
    const participantIds = upcomingMatch.participantIds || upcomingMatch.attendeeIds || []
    if (participantIds.length === 0) {
      notify('불러올 참가자가 없습니다.')
      return
    }

    // 예정된 매치 ID 연결 (보수적 모드: 자동 저장 없음)
    setLinkedUpcomingMatchId(upcomingMatch.id)
    // 초기 로드 변경 감지 스킵 (2회)
    dirtyGuardRef.current = 2
    setUpcomingDirty(false)

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
        {/* 컴팩트 매치 설정 바 - 스타일 개선 */}
        <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-blue-50 to-emerald-50 p-3 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-4 items-stretch">
            {/* 날짜/시간 */}
            <div className="rounded-lg bg-white border border-gray-200 p-2 flex flex-col gap-1 shadow-xs">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600 font-semibold">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M3 11h18M5 19h14a2 2 0 002-2V7H3v10a2 2 0 002 2z"/></svg>
                날짜/시간
              </div>
              <DateTimePicker
                value={dateISO}
                onChange={setDateISO}
                label={null}
                className="text-sm"
              />
            </div>

            {/* 장소 선택 */}
            <div className="rounded-lg bg-white border border-gray-200 p-2 flex flex-col gap-1 shadow-xs">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600 font-semibold">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5 9 6.343 9 8s1.343 3 3 3z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8c0 7.5-7.5 12-7.5 12S4.5 15.5 4.5 8a7.5 7.5 0 1115 0z"/></svg>
                장소
              </div>
              <select 
                className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm" 
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
                <option value="">선택...</option>
                {locationOptions.map((loc, idx) => (
                  <option key={idx} value={loc.name}>{loc.name}</option>
                ))}
                <option value="other">+ 새</option>
              </select>
            </div>

            {/* 팀 수 */}
            <div className="rounded-lg bg-white border border-gray-200 p-2 flex flex-col gap-1 shadow-xs">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600 font-semibold">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10M7 16h6"/></svg>
                팀
              </div>
              <select className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm" value={teams} onChange={e=>setTeamCount(Number(e.target.value))}>{Array.from({length:9},(_,i)=>i+2).map(n=><option key={n} value={n}>{n}</option>)}</select>
            </div>

            {/* 드래프트 모드 토글 */}
            <div className="rounded-lg bg-white border border-gray-200 p-2 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600 font-semibold">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v8m-4-4h8"/></svg>
                Draft Match
              </div>
              <button
                type="button"
                onClick={()=>setIsDraftMode(v=>!v)}
                className={`relative inline-flex h-6 w-11 rounded-full transition-colors shadow-sm border ${isDraftMode? 'bg-purple-500 border-purple-600':'bg-gray-200 border-gray-300'}`}
                aria-pressed={isDraftMode}
                aria-label="드래프트 모드 토글"
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-all duration-300 ${isDraftMode? 'translate-x-5':'translate-x-0.5'} mt-0.5`}/>
              </button>
            </div>
          </div>

          {/* 커스텀 장소 입력 */}
          {(!locationName || !locationOptions.find(loc => loc.name === locationName)) && (
            <div className="mt-2 pt-2 border-t border-gray-200 grid gap-2 sm:grid-cols-2">
              <input 
                className="rounded border border-gray-300 bg-white px-2 py-1 text-sm" 
                placeholder="장소명" 
                value={locationName} 
                onChange={e=>setLocationName(e.target.value)}
              />
              <input 
                className="rounded border border-gray-300 bg-white px-2 py-1 text-sm" 
                placeholder="주소/URL" 
                value={locationAddress} 
                onChange={e=>setLocationAddress(e.target.value)}
              />
            </div>
          )}

          {/* 구장비 설정 */}
          <div className="mt-2 pt-2 border-t border-gray-200 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-4.418 0-8 1.79-8 4s3.582 4 8 4 8-1.79 8-4-3.582-4-8-4z"/></svg>
                구장비
              </span>
              <button
                type="button"
                onClick={()=>setEnablePitchFee(v=>!v)}
                className={`relative inline-flex h-5 w-10 rounded-full transition-colors shadow-sm border ${enablePitchFee? 'bg-emerald-500 border-emerald-600':'bg-gray-200 border-gray-300'}`}
                aria-pressed={enablePitchFee}
                aria-label="구장비 토글"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-all duration-300 ${enablePitchFee? 'translate-x-4':'translate-x-0.5'} mt-0.5`}/>
              </button>
            </div>

            {enablePitchFee && (
              <>
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[11px] text-gray-600">$총액</label>
                    <input 
                      type="number" 
                      min="0" 
                      step="0.5" 
                      placeholder="220" 
                      value={customBaseCost} 
                      onChange={e=>setCustomBaseCost(e.target.value)} 
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm w-20"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[11px] text-gray-600">할증(+$)</label>
                    <input 
                      type="number" 
                      min="0" 
                      step="0.5" 
                      placeholder="2" 
                      value={guestSurcharge} 
                      onChange={e=>setGuestSurcharge(e.target.value)} 
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm w-16"
                    />
                  </div>
                </div>

                {/* 비용 요약 */}
                <div className="flex items-center gap-2 text-xs text-amber-700 ml-auto">
                  <span className="font-medium">예상: ${baseCost}</span>
                  {previewTeams.flat().length > 0 && (
                    <span className="text-gray-600">· {previewTeams.flat().length}명</span>
                  )}
                </div>
              </>
            )}

            {/* 지도 링크 */}
            {mapLink && (
              <a href={mapLink} target="_blank" rel="noreferrer" className="ml-auto text-xs text-blue-600 hover:text-blue-700 font-medium underline">
                Maps ↗
              </a>
            )}
          </div>
        </div>

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
                  onClick={()=> setConfirmDelete({ open: true, id: '__reset_teams__', kind: 'reset-teams' })} 
                  className="rounded border border-red-300 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  title="모든 선수를 팀에서 제거"
                >
                  초기화
                </button>
              )}
            </div>
            
            {/* 오른쪽: 정렬 버튼 */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* 표기 토글 - 앱 스타일 세그먼트 버튼 */}
              <div className="flex items-center gap-1 p-1 rounded-full border border-gray-200 bg-white shadow-sm">
                <button
                  onClick={()=>setShowPositions(v=>!v)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition-all ${showPositions ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow' : 'text-gray-700 hover:bg-gray-100'}`}
                  title="포지션 칩 표시"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4"/></svg>
                  포지션
                </button>
                <button
                  onClick={()=>setShowOverallChip(v=>!v)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition-all ${showOverallChip ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow' : 'text-gray-700 hover:bg-gray-100'}`}
                  title="Overall 칩 표시"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v8m-4-4h8"/></svg>
                  Overall
                </button>
                <button
                  onClick={()=>setShowAIPowerChip(v=>!v)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition-all ${showAIPowerChip ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow' : 'text-gray-700 hover:bg-gray-100'}`}
                  title="AI 파워 칩 표시"
                >
                  <span className="text-[11px]">✨</span>
                  AI
                </button>
              </div>

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
                      const posA = getPrimaryCategory(a.positions || [])
                      const posB = getPrimaryCategory(b.positions || [])
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
                      showOVR={!!showOverallChip} 
                      isAdmin={isAdmin} 
                      dropHint={dropHint}
                      isDraftMode={isDraftMode}
                      captainId={captainIds[i]}
                      onRemovePlayer={handleRemovePlayer}
                      onSetCaptain={handleSetCaptain}
                      matches={matches}
                      showAIPower={!!showAIPowerChip}
                      showPositions={!!showPositions}
                      customMemberships={customMemberships}
                      teamColor={teamColors[i]}
                      availablePlayers={availablePlayers}
                      onAddPlayer={handleAddPlayerToTeam}
                      onAddMany={handleAddManyPlayersToTeam}
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

        <div className="flex flex-wrap gap-2 items-center">
          {isAdmin&&(
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button onClick={saveAsUpcomingMatch} disabled={isPastDate} className={`rounded px-4 py-2 text-white font-semibold ${isPastDate?'bg-blue-300 cursor-not-allowed':'bg-blue-500 hover:bg-blue-600'}`}>예정 매치로 저장</button>
                {linkedUpcomingMatchId && upcomingDirty && (
                  <button
                    onClick={()=>{
                      // 수동 저장 동작 - 모든 필드 포함 (날짜, 장소, Draft 모드 등)
                      const teamsSnapshot = previewTeams.map(team => team.map(p => p.id))
                      const assignedPlayerIds = previewTeams.flat().map(p => p.id)
                      
                      // 날짜 문자열을 타임존 정보와 함께 ISO 형식으로 변환
                      const dateISOFormatted = dateISO && dateISO.length >= 16 
                        ? localDateTimeToISO(dateISO.slice(0,16)) 
                        : localDateTimeToISO(getNextSaturday630())
                      
                      const attendeeObjs = previewTeams.flat().map(p => p)
                      const fees = enablePitchFee ? computeFeesAtSave({ baseCostValue: baseCost, attendees: attendeeObjs, guestSurcharge }) : null
                      const updates = {
                        dateISO: dateISOFormatted,
                        snapshot: teamsSnapshot,
                        participantIds: assignedPlayerIds,
                        captainIds: captainIds,
                        formations: formations,
                        teamCount: teams,
                        isDraftMode: isDraftMode,
                        location: {
                          preset: locationPreset,
                          name: locationName,
                          address: locationAddress
                        },
                        totalCost: enablePitchFee ? baseCost : 0,
                        ...(enablePitchFee && fees ? { fees: { ...fees } } : {}),
                        feesDisabled: !enablePitchFee,
                        ...(teamColors && teamColors.length > 0 && teamColors.some(c => c !== null && c !== undefined) ? { teamColors } : {})
                      }
                      onUpdateUpcomingMatch(linkedUpcomingMatchId, updates, false)
                      setUpcomingDirty(false)
                      notify('불러온 예정 매치에 변경사항을 저장했습니다 💾')

                      // match_payments 업데이트 (예상 금액 반영)
                      if (enablePitchFee && fees) {
                        const memberFee = fees.memberFee || 0
                        const guestFee = fees.guestFee || (memberFee + (fees.guestSurcharge || 2))
                        const playerMap = new Map(players.map(p => [p.id, p]))
                        Promise.all(
                          assignedPlayerIds.map(pid => {
                            const p = playerMap.get(pid)
                            const expected = isMemberFee(p?.membership) ? memberFee : guestFee
                            return upsertMatchPayment({
                              matchId: linkedUpcomingMatchId,
                              playerId: pid,
                              expectedAmount: expected,
                              paymentStatus: 'pending'
                            })
                          })
                        ).catch(()=>{})
                      }
                    }}
                    className="rounded px-4 py-2 text-white font-semibold bg-indigo-500 hover:bg-indigo-600"
                    title="변경사항 저장"
                  >불러온 예정 매치 저장</button>
                )}
                <button onClick={save} className="rounded px-4 py-2 text-white font-semibold bg-emerald-500 hover:bg-emerald-600">매치 저장</button>
              </div>
              {isPastDate && (
                <span className="text-xs text-amber-600 ml-1">⚠️ 과거 시점은 예정 매치로 저장 불가 (매치 저장만 가능)</span>
              )}
            </div>
          )}
        </div>

  {/* 빠른 선수 추가 (팀 컬럼 내 컴팩트 입력으로 대체) */}
      </div>
    </Card>

    <div className="grid gap-4">
      {(() => {
        const activeMatches = activeUpcomingMatches
        
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
                              // 부분 업데이트만 수행 (전체 객체 머지 금지)
                              onUpdateUpcomingMatch(match.id, { isDraftComplete: e.target.checked })
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
                        onClick={()=>setConfirmDelete({open:true,id:match.id, kind:'delete-upcoming'})}
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

      <Card 
        title="저장된 매치"
        right={
          <div className="flex items-center gap-2">
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold shadow-sm hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 transition-all"
            >
              {seasonOptions.map(v => (
                <option key={v} value={v}>
                  {v === 'all' ? '🏆 전체 시즌' : `${v}년`}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">
              <span className="font-medium">GK 평균 제외</span>
            </span>
          </div>
        }
      >
        <SavedMatchesList matches={seasonFilteredMatches} players={players} isAdmin={isAdmin} enableLoadToPlanner={true} onLoadToPlanner={loadSavedIntoPlanner} onDeleteMatch={onDeleteMatch} onUpdateMatch={onUpdateMatch} showTeamOVRForAdmin={true} hideOVR={true} customMemberships={customMemberships}/>
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
    <ConfirmDialog
      open={confirmDelete.open}
      title={confirmDelete.kind==='reset-teams'?'팀 배정 초기화':'예정된 매치 삭제'}
      message={confirmDelete.kind==='reset-teams'?'모든 팀 배정을 초기화하시겠습니까?':'이 예정된 매치를 삭제하시겠습니까?'}
      confirmLabel={confirmDelete.kind==='reset-teams'?'초기화':'삭제하기'}
      cancelLabel="취소"
      tone="danger"
      onCancel={()=>setConfirmDelete({open:false,id:null,kind:null})}
      onConfirm={()=>{
        if(confirmDelete.kind==='reset-teams'){
          resetTeams()
        }else if(confirmDelete.id){
          onDeleteUpcomingMatch(confirmDelete.id);notify('예정된 매치가 삭제되었습니다 ✅')
        }
        setConfirmDelete({open:false,id:null,kind:null})
      }}
    />
  </div>)
}

function Row({label,children}){return(<div className="grid items-start gap-2 sm:grid-cols-[120px_minmax(0,1fr)]"><label className="mt-1 text-sm text-gray-600">{label}</label><div>{children}</div></div>)}

/* 컬럼/플레이어 렌더 */
function TeamColumn({teamIndex,labelKit,players,showOVR,isAdmin,dropHint,isDraftMode,captainId,onRemovePlayer,onSetCaptain,matches,showAIPower,showPositions=true,customMemberships=[],teamColor,onColorChange,availablePlayers=[],onAddPlayer,onAddMany}){
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
  
  // text color calc moved to utils/color
  
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
  rendered.push(<PlayerRow key={players[i].id} player={players[i]} showOVR={showOVR} isAdmin={isAdmin} teamIndex={teamIndex} isDraftMode={isDraftMode} isCaptain={captainId===players[i].id} onRemove={onRemovePlayer} onSetCaptain={onSetCaptain} matches={matches} showAIPower={showAIPower} customMemberships={customMemberships} showPositions={showPositions}/>)
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
      className={`mb-1 px-3 py-2 text-xs h-[60px] grid grid-cols-[1fr_auto] gap-y-1 ${!teamColor ? labelKit.headerClass : ''}`}
      style={teamColor ? headerStyle : {}}
    >
      {/* 첫 번째 줄: 팀 번호 + 색상 버튼 자리 */}
      <span className="font-semibold leading-none">팀 {teamIndex+1}</span>
      {isAdmin ? (
        <button
          onClick={() => setShowColorPicker(true)}
          className="justify-self-end px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all hover:shadow-md"
          style={{
            backgroundColor: teamColor ? teamColor.bg : '#f3f4f6',
            color: teamColor ? teamColor.text : '#374151',
            borderColor: teamColor ? teamColor.border : '#d1d5db'
          }}
          title="팀 색상 변경"
        >
          색상
        </button>
      ) : (
        <span className="justify-self-end text-[10px] opacity-0 select-none">색상</span>
      )}

      {/* 두 번째 줄: 색상 라벨 · 인원 수 / 팀파워 정보 */}
      <span className="text-[11px] opacity-80 flex items-center gap-1">
        <span className="font-medium">{teamColor ? teamColor.label : labelKit.label}</span>
        <span>·</span>
        <span>{players.length}명</span>
      </span>
      {isAdmin ? (
        <span className="text-[11px] opacity-80 whitespace-nowrap justify-self-end">
          팀파워 {sum} · 평균 {avg}
        </span>
      ) : (
        <span className="text-[11px] opacity-0 select-none">placeholder</span>
      )}
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

    {/* 컴팩트 선수 추가 영역 */}
    {availablePlayers.length > 0 && (
      <div className="border-t border-gray-100 px-3 py-2 bg-gradient-to-r from-emerald-50 to-blue-50">
        <CompactAddPlayer
          teamIndex={teamIndex}
          players={availablePlayers}
          onAdd={(pid)=>onAddPlayer&&onAddPlayer(pid, teamIndex)}
          onAddMany={(ids)=>onAddMany&&onAddMany(ids, teamIndex)}
          customMemberships={customMemberships}
        />
      </div>
    )}
  </div>)}

/* Compact add-player input for each team */
function CompactAddPlayer({ teamIndex, players, onAdd, onAddMany, customMemberships = [] }){
  const [q, setQ] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState(()=>new Set())
  const [selectedTag, setSelectedTag] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const [dropdownRect, setDropdownRect] = useState(null)

  // 태그 목록 (사용 가능 선수 기준) + 멤버십 태그 포함
  const allTags = useMemo(() => {
    const map = new Map()
    const memColor = (m) => {
      const s = (m || '').toString().trim()
      if (!s) return 'stone'
      if (/정회원|member/i.test(s)) return 'emerald'
      if (/게스트|guest/i.test(s)) return 'red'
      if (/준회원|associate/i.test(s)) return 'blue'
      return 'stone'
    }
    players.forEach(p => {
      // custom tags
      if (Array.isArray(p.tags)) {
        p.tags.forEach(t => {
          if (t && t.name && !map.has(t.name)) map.set(t.name, { name: t.name, color: t.color })
        })
      }
      // membership tag
      const m = p.membership
      if (m) {
        const key = `MEM:${String(m)}`
        if (!map.has(key)) {
          map.set(key, { name: `멤버십:${String(m)}`, color: memColor(m), _isMembership: true, _match: String(m) })
        }
      }
    })
    return Array.from(map.values()).sort((a,b)=>a.name.localeCompare(b.name))
  }, [players])

  // 태그별 카운트
  const tagCounts = useMemo(() => {
    const counts = new Map()
    players.forEach(p => {
      if (Array.isArray(p.tags)) {
        p.tags.forEach(t => { if (t && t.name) counts.set(t.name, (counts.get(t.name)||0)+1) })
      }
      const m = p.membership
      if (m) {
        const key = `멤버십:${String(m)}`
        counts.set(key, (counts.get(key)||0)+1)
      }
    })
    return counts
  }, [players])

  const tagOptions = useMemo(() => {
    const opts = [{ label: '전체', value: '' }]
    for (const tag of allTags) {
      const count = tagCounts.get(tag.name) || 0
      opts.push({ label: `${tag.name} (${count})`, value: tag.name })
    }
    return opts
  }, [allTags, tagCounts])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    let base = players
    if (selectedTag) {
      if (selectedTag.startsWith('멤버십:')) {
        const mem = selectedTag.replace('멤버십:', '')
        base = base.filter(p => String(p.membership || '').trim() === mem)
      } else {
        base = base.filter(p => Array.isArray(p.tags) && p.tags.some(tag => tag.name === selectedTag))
      }
    }
    if (t) base = base.filter(p => (p.name || '').toLowerCase().includes(t))
    return base.slice().sort((a,b)=> (a.name||'').localeCompare(b.name||''))
  }, [players, q, selectedTag])

  // 외부 클릭/ESC 닫기
  useEffect(() => {
    const onDocClick = (e) => {
      if (!containerRef.current) return
      // 포탈 드롭다운 내부 클릭은 닫지 않음
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return
      if (!containerRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // 드롭다운 위치 계산 (포탈 렌더)
  const updateRect = () => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const top = r.bottom
    const left = r.left
    const width = r.width
    const maxHeight = Math.max(160, Math.min(480, window.innerHeight - top - 8))
    setDropdownRect({ top, left, width, maxHeight })
  }
  useEffect(() => {
    if (!open) return
    updateRect()
    const onResize = () => updateRect()
    // 스크롤 시: 드롭다운 내부 스크롤은 무시, 페이지/컨테이너 스크롤은 위치만 재계산
    const onScroll = (e) => {
      if (dropdownRef.current && e && e.target && (dropdownRef.current === e.target || dropdownRef.current.contains(e.target))) {
        return
      }
      updateRect()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const handleEnter = (e) => {
    if (e.key === 'Enter' && !isComposing) {
      e.preventDefault()
      if (filtered.length >= 1) {
        const pid = filtered[0].id
        if (onAdd) onAdd(pid)
        setQ('')
  // 드롭다운 닫기 (UX 개선)
  setOpen(false)
      }
    }
  }

  const toggleSelect = (pid) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid); else next.add(pid)
      return next
    })
  }

  const bulkAdd = () => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    if (onAddMany) onAddMany(ids)
    notify(`${ids.length}명을 팀 ${teamIndex+1}에 추가했습니다 ✅`)
    setSelectedIds(new Set())
    setQ('')
  setOpen(false)
  }

  const addAllFiltered = () => {
    if (!filtered || filtered.length === 0) return
    const ids = filtered.map(p => p.id)
    if (onAddMany) onAddMany(ids)
    notify(`필터된 전체 ${ids.length}명을 팀 ${teamIndex+1}에 추가했습니다 ✅`)
    setSelectedIds(new Set())
    setQ('')
  setOpen(false)
    // 만약 현재 태그/검색으로 걸러진 모든 선수를 추가하여 리스트가 비게 될 경우 태그를 자동 초기화
    // (필터 유지 시 드롭다운이 다시 열리지 않는 UX 문제 해결)
    if (selectedTag && filtered.length === ids.length) {
      setSelectedTag('')
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            className="w-full rounded-md border border-gray-300 bg-white pl-8 pr-2 py-2 text-xs placeholder-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            placeholder="선수 검색 또는 선택"
            value={q}
            onChange={(e)=>{setQ(e.target.value); setOpen(true)}}
            onKeyDown={handleEnter}
            onFocus={()=>setOpen(true)}
            onCompositionStart={()=>setIsComposing(true)}
            onCompositionEnd={()=>setIsComposing(false)}
          />
        </div>
        <span className="text-[11px] text-gray-500 whitespace-nowrap">대기 {players.length}명</span>
      </div>

      {open && dropdownRect && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[999] rounded-lg border border-gray-200 bg-white shadow-2xl"
          style={{ 
            top: dropdownRect.top + 'px', 
            left: window.innerWidth <= 640 ? '8px' : dropdownRect.left + 'px', 
            width: window.innerWidth <= 640 ? 'calc(100vw - 16px)' : dropdownRect.width + 'px',
            maxWidth: window.innerWidth <= 640 ? 'calc(100vw - 16px)' : '600px'
          }}
          onMouseDown={(e)=>e.stopPropagation()}
        >
          {/* 태그 필터 바 - 간결한 Select */}
          {allTags.length > 0 && (
            <div className="px-3 py-2.5 border-b border-gray-200 bg-gradient-to-b from-gray-50 to-white sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-700 font-medium shrink-0">태그</span>
                <div className="flex-1 min-w-0">
                  <Select
                    value={selectedTag}
                    onChange={(v)=>setSelectedTag(v)}
                    options={tagOptions}
                    placeholder="전체"
                  />
                </div>
                {selectedTag && (
                  <button className="text-xs text-emerald-600 hover:text-emerald-700 font-medium px-2 py-1 rounded hover:bg-emerald-50" onClick={()=>setSelectedTag('')}>초기화</button>
                )}
              </div>
            </div>
          )}

          {/* 목록 (단일 리스트 스타일) */}
          <div className="max-h-[60vh] overflow-y-auto overscroll-contain" style={{ maxHeight: dropdownRect.maxHeight }}>
            <div>
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                필터 결과가 없습니다{selectedTag ? ' — 태그를 변경하거나 초기화하세요' : ''}
              </div>
            )}
            {filtered.map(p => {
              const badges = getBadgesWithCustom(p.membership, customMemberships)
              const badgeInfo = getMembershipBadge(p.membership, customMemberships)
              const checked = selectedIds.has(p.id)
              return (
                <div key={p.id} className={'flex items-center gap-3 px-3 py-2.5 text-sm border-b border-gray-50 last:border-0 hover:bg-emerald-50 active:bg-emerald-100 transition-colors'}>
                  <input type="checkbox" className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500 cursor-pointer" checked={checked} onChange={(e)=>{e.stopPropagation(); toggleSelect(p.id)}} />
                  <button
                    onClick={(e)=>{e.preventDefault(); e.stopPropagation(); toggleSelect(p.id)}}
                    className="flex-1 flex items-center gap-2 text-left"
                    title={`선택 토글`}
                  >
                    <InitialAvatar id={p.id} name={p.name} size={28} badges={badges} photoUrl={p.photoUrl} customMemberships={customMemberships} badgeInfo={badgeInfo} />
                    <span className="truncate text-sm font-medium">{p.name}</span>
                  </button>
                  <button
                    onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); onAdd ? onAdd(p.id) : (onAddMany && onAddMany([p.id])); setOpen(false) }}
                    className="ml-auto text-xs text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 px-3 py-1.5 rounded-md font-semibold shadow-sm transition-colors"
                    title={`팀 ${teamIndex+1}에 바로 추가`}
                  >
                    + 추가
                  </button>
                </div>
              )
            })}
            </div>
          </div>

          {/* 액션 바 */}
          <div className="sticky bottom-0 flex items-center gap-2 px-3 py-3 bg-gradient-to-t from-white to-gray-50 border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.05)]">
            <button
              onClick={bulkAdd}
              disabled={selectedIds.size===0}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${selectedIds.size>0? 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-md hover:shadow-lg':'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
            >
              선택 {selectedIds.size}명 추가
            </button>
            <button
              onClick={addAllFiltered}
              disabled={filtered.length===0}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${filtered.length>0? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-md hover:shadow-lg':'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
            >
              전체 {filtered.length}명
            </button>
            {(selectedIds.size>0 || q || selectedTag) && (
              <button onClick={()=>{setSelectedIds(new Set()); setQ(''); setSelectedTag('')}} className="px-3 py-2.5 text-xs text-gray-600 hover:text-gray-800 font-medium rounded-lg hover:bg-gray-100">
                초기화
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

/* PlayerRow */
function PlayerRow({player,showOVR,isAdmin,teamIndex,isDraftMode,isCaptain,onRemove,onSetCaptain,matches,showAIPower,customMemberships=[],showPositions=true}){
  const{attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id:String(player.id)})
  const style={transform:CSS.Transform.toString(transform),transition,opacity:isDragging?0.7:1,boxShadow:isDragging?'0 6px 18px rgba(0,0,0,.12)':undefined,borderRadius:8,background:isDragging?'rgba(16,185,129,0.06)':undefined}
  const pos=getPrimaryCategory(player.positions||[]),isGK=pos==='GK',unknown=isUnknownPlayer(player),ovrVal=unknown?'?':player.ovr??overall(player)
  const member=isMember(player.membership)
  
  // 배지 정보 가져오기
  const badges = getBadgesWithCustom(player.membership, customMemberships)
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
  <span className="whitespace-normal break-words notranslate" translate="no">{player.name}</span>
        {showPositions && (
          <PositionChips positions={player.positions || []} size="sm" maxDisplay={2} />
        )}
      </span>

      {showOVR && <span className={`ovr-chip shrink-0 rounded-lg bg-gradient-to-br ${unknown?'from-stone-400 to-stone-500':getOVRColor(ovrVal)} text-white text-[11px] px-2 py-[2px] font-semibold shadow-sm`} data-ovr>
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
          {/* 주장 지정 버튼 - 드래프트 모드 여부와 무관하게 표시 */}
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
  const pos=getPrimaryCategory(player.positions||[]),isGK=pos==='GK',unknown=isUnknownPlayer(player),ovrVal=unknown?'?':player.ovr??overall(player)
  const badges = getBadgesWithCustom(player.membership, customMemberships)
  const badgeInfo = getMembershipBadge(player.membership, customMemberships)
  
  return(
  <div className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 shadow-lg">
    <div className="flex items-center gap-2 text-sm">
  <InitialAvatar id={player.id} name={player.name} size={22} badges={badges} photoUrl={player.photoUrl} customMemberships={customMemberships} badgeInfo={badgeInfo} />
  <span className="truncate notranslate" translate="no">{player.name}</span>
  {/* guest badge is shown on avatar */}
      <span className={`ml-1 inline-flex items-center rounded-full px-2 py-[2px] text-[11px] ${isGK?'bg-amber-100 text-amber-800':pos==='DF'?'bg-blue-100 text-blue-800':pos==='MF'?'bg-emerald-100 text-emerald-800':pos==='FW'?'bg-purple-100 text-purple-800':'bg-stone-100 text-stone-700'}`}>{pos}</span>
      {showOVR&&<span className="text-xs text-gray-600">OVR {ovrVal}</span>}
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
    <div className="rounded-lg border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-blue-50 p-4 shadow-sm">
      {/* 헤더 섹션 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-800">선수 추가</h3>
          <span className="text-xs text-gray-500">({notInMatch.length}명 대기 중)</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 shadow-sm">
          <span className="text-xs text-gray-600 font-medium">추가할 팀:</span>
          <select 
            className="border-0 bg-transparent px-1 py-0 text-sm font-bold text-emerald-700 focus:outline-none focus:ring-0 cursor-pointer" 
            value={teamIdx} 
            onChange={e=>setTeamIdx(Number(e.target.value))}
          >
            {snapshot.map((_,i)=><option key={i} value={i}>팀 {i+1}</option>)}
          </select>
        </div>
      </div>

      {/* 검색 & 필터 초기화 */}
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            className="w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 py-2 text-sm placeholder-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all" 
            placeholder="이름으로 검색... (Enter로 빠른 추가)"
            value={q}
            onChange={e=>setQ(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={()=>setIsComposing(true)}
            onCompositionEnd={()=>setIsComposing(false)}
          />
        </div>
        {(selectedTag || selectedMembership || q.trim()) && (
          <button 
            onClick={()=>{setSelectedTag('');setSelectedMembership('');setQ('')}}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-all font-medium"
            title="필터 초기화"
          >
            ✕ 초기화
          </button>
        )}
      </div>
      
      {/* 태그 & 멤버십 필터 */}
      {allTags.length > 0 && (
        <div className="mb-3 rounded-lg bg-white p-3 border border-gray-200">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-gray-700 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              태그
            </span>
            <button
              onClick={() => setSelectedTag('')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                selectedTag === '' 
                  ? 'bg-gray-800 text-white shadow-sm' 
                  : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
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
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                    isActive 
                      ? colorClass ? colorClass.replace('bg-', 'bg-').replace('-100', '-600').replace('text-', 'text-white border-') : 'shadow-sm'
                      : colorClass || 'bg-gray-100 text-gray-700 border-gray-200'
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
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
              <span className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
                멤버십
              </span>
              <button
                onClick={() => setSelectedMembership('')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  selectedMembership === '' 
                    ? 'bg-gray-800 text-white shadow-sm' 
                    : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
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
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                      isActive 
                        ? badgeInfo?.bgColor || 'bg-blue-600 text-white shadow-sm' 
                        : badgeInfo?.bgColor?.replace('bg-', 'bg-').replace('-600', '-100').replace('text-white', badgeInfo.textColor || 'text-gray-700') || 'bg-gray-100 text-gray-700 border-gray-200'
                    } ${!isActive && 'hover:opacity-80'}`}
                  >
                    {membership}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
      
      {/* 일괄 추가 버튼 */}
      {filtered.length > 0 && (
        <button
          onClick={addAllFilteredToTeam}
          className="w-full mb-3 rounded-lg border-2 border-dashed border-emerald-400 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 hover:border-emerald-500 transition-all flex items-center justify-center gap-2 shadow-sm"
          title={`${selectedTag ? `"${selectedTag}" 태그의 ` : ''}${selectedMembership ? `"${selectedMembership}" 멤버십의 ` : ''}모든 선수 (${filtered.length}명)를 팀 ${teamIdx + 1}에 추가`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>
            {selectedTag || selectedMembership ? `필터된 선수 모두 추가` : '전체 선수 모두 추가'}
            <span className="ml-1 font-bold text-emerald-600">({filtered.length}명)</span>
          </span>
        </button>
      )}
      
      {/* 선수 목록 */}
      {notInMatch.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-500 bg-white rounded-lg border border-gray-200">
          <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          모든 선수가 팀에 배정되었습니다
        </div>
      ) : (
        <>
          {!shouldShowList ? (
            <div className="text-center py-4 bg-white rounded-lg border-2 border-dashed border-gray-300">
              <button 
                onClick={() => setShowList(true)}
                className="text-sm text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-2 mx-auto"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                전체 선수 목록 보기 ({notInMatch.length}명)
              </button>
            </div>
          ) : (
            <>
              {(selectedTag || selectedMembership || q.trim()) && (
                <div className="mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    <span className="font-medium text-blue-900">필터 결과: {filtered.length}명</span>
                    {selectedTag && <span className="px-2 py-0.5 bg-white rounded text-xs font-medium text-blue-700 border border-blue-300">태그: {selectedTag}</span>}
                    {selectedMembership && <span className="px-2 py-0.5 bg-white rounded text-xs font-medium text-blue-700 border border-blue-300">멤버십: {selectedMembership}</span>}
                  </div>
                </div>
              )}
              <div className="max-h-[500px] overflow-y-auto border-2 border-gray-300 rounded-lg p-2 bg-white shadow-inner">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {filtered.map(p => {
                    const badges = getBadgesWithCustom(p.membership, customMemberships)
                    const badgeInfo = getMembershipBadge(p.membership, customMemberships)
                    return (
                      <button 
                        key={p.id} 
                        onClick={() => addPlayerToTeam(p.id)}
                        className="group flex items-center gap-2 text-sm p-2.5 rounded-lg hover:bg-emerald-50 cursor-pointer transition-all border-2 border-transparent hover:border-emerald-400 hover:shadow-md relative"
                        title={`팀 ${teamIdx + 1}에 추가`}
                      >
                        <InitialAvatar id={p.id} name={p.name} size={32} badges={badges} photoUrl={p.photoUrl} customMemberships={customMemberships} badgeInfo={badgeInfo} />
                        <span className="truncate text-left flex-1 font-medium text-gray-800">{p.name}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-xs text-emerald-700 font-semibold">+팀{teamIdx + 1}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="mt-2 text-center">
                <button 
                  onClick={() => setShowList(false)}
                  className="text-sm text-gray-600 hover:text-gray-800 font-medium flex items-center gap-1 mx-auto"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                  목록 접기
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
