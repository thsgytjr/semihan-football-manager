import React,{useEffect,useMemo,useState,useCallback}from'react'
import{useTranslation}from'react-i18next'
import{Settings,BookOpen,CheckCircle2,Info,Shield,SlidersHorizontal,Sparkles}from'lucide-react'
import{notify}from'../components/Toast'
import{updateAppTitle}from'../lib/appSettings'
import{getBadgeTierRuleCatalog}from'../lib/playerBadgeEngine'

function buildBadgeTierFormState(catalog=[],overrides={}){
  const result={}
  if(!Array.isArray(catalog))return result
  catalog.forEach(rule=>{
    const overrideEntry=overrides?.[rule.slug]?.tiers||{}
    const tierValues={}
    ;(rule.tiers||[]).forEach(tierDef=>{
      const tierKey=tierDef.tier
      const overrideValue=overrideEntry?.[tierKey]
      const baseValue=tierDef.min??0
      const valueToUse=overrideValue??baseValue
      tierValues[tierKey]=valueToUse===''?'':String(valueToUse)
    })
    result[rule.slug]=tierValues
  })
  return result
}

function validateBadgeTierForm(catalog=[],values={}){
  const errors={}
  if(!Array.isArray(catalog))return errors
  catalog.forEach(rule=>{
    const tiers=[...(rule.tiers||[])].sort((a,b)=>a.tier-b.tier)
    let prev=null
    for(const tierDef of tiers){
      const raw=values?.[rule.slug]?.[tierDef.tier]
      const num=Number(raw)
      if(!Number.isFinite(num)||num<0){errors[rule.slug]='nonNumeric';break}
      if(prev!=null&&num<prev){errors[rule.slug]='ascending';break}
      prev=num
    }
  })
  return errors
}

function mergeBadgeTierOverridesForSave(catalog=[],values={},existing={}){
  if(!Array.isArray(catalog)||catalog.length===0){return typeof existing==='object'&&existing!==null?existing:{}}
  const preserved={}
  Object.entries(existing||{}).forEach(([slug,entry])=>{const known=catalog.some(rule=>rule.slug===slug);if(!known)preserved[slug]=entry})
  const payload={...preserved}
  catalog.forEach(rule=>{
    const baseMap={}
    ;(rule.tiers||[]).forEach(tierDef=>{baseMap[tierDef.tier]=Number(tierDef.min)})
    const userValues=values?.[rule.slug]||{}
    const diffs={}
    Object.entries(baseMap).forEach(([tier,baseValue])=>{const raw=userValues[tier];const num=Number(raw);if(!Number.isFinite(num))return;if(num!==baseValue){diffs[tier]=num}})
    if(Object.keys(diffs).length>0){payload[rule.slug]={tiers:diffs}} else {delete payload[rule.slug]}
  })
  return payload
}

export default function SettingsPage({appTitle,onTitleChange,seasonRecapEnabled,onSeasonRecapToggle,maintenanceMode,onMaintenanceModeToggle,featuresEnabled,onFeatureToggle,onLeaderboardToggle,badgeTierOverrides,onSaveBadgeTierOverrides,isAdmin,isAnalyticsAdmin,visits}){
  const{t}=useTranslation()
  const[newTitle,setNewTitle]=useState(appTitle)
  const[titleEditMode,setTitleEditMode]=useState(false)
  const badgeTierCatalog=useMemo(()=>{const catalog=getBadgeTierRuleCatalog();return Array.isArray(catalog)?catalog:[]},[])
  const[tierFormValues,setTierFormValues]=useState(()=>buildBadgeTierFormState(badgeTierCatalog,badgeTierOverrides||{}))
  const[tierDirty,setTierDirty]=useState(false)
  const[tierErrors,setTierErrors]=useState({})
  const[tierSaving,setTierSaving]=useState(false)
  const canEditBadgeTiers=Boolean(isAdmin&&badgeTierCatalog.length>0&&onSaveBadgeTierOverrides)
  const badgesFeatureOn=Boolean(featuresEnabled?.badges??true)

  const tabConfig=useMemo(()=>{
    const tabs=[{id:'app',label:'앱 기본',icon:Settings}]
    if(isAdmin){
      tabs.push({id:'feature',label:'기능 토글',icon:SlidersHorizontal})
      tabs.push({id:'leaderboard',label:'리더보드',icon:CheckCircle2})
      tabs.push({id:'cards',label:'카드 타입',icon:Shield})
    }
    if(canEditBadgeTiers&&badgesFeatureOn){tabs.push({id:'badge',label:'뱃지 티어',icon:Sparkles})}
    return tabs
  },[isAdmin,canEditBadgeTiers,badgesFeatureOn])

  const[activeTab,setActiveTab]=useState(()=>tabConfig[0]?.id||'app')

  useEffect(()=>{if(!tabConfig.some(tab=>tab.id===activeTab)&&tabConfig[0]){setActiveTab(tabConfig[0].id)}},[tabConfig,activeTab])

  useEffect(()=>{setNewTitle(appTitle);setTitleEditMode(false)},[appTitle])
  useEffect(()=>{setTierFormValues(buildBadgeTierFormState(badgeTierCatalog,badgeTierOverrides||{}));setTierDirty(false);setTierErrors({})},[badgeTierCatalog,badgeTierOverrides])

  const handleTitleUpdate=useCallback(()=>{
    if(!newTitle.trim())return
    if(updateAppTitle(newTitle.trim())){onTitleChange?.(newTitle.trim());setTitleEditMode(false);notify(t('settings.titleChanged'),'success')}else{notify(t('settings.titleChangeFailed'),'error')}
  },[newTitle,onTitleChange,t])

  const tierName=tier=>{
    switch(Number(tier)){
      case 5:return t('badges.tiers.diamond')
      case 4:return t('badges.tiers.platinum')
      case 3:return t('badges.tiers.gold')
      case 2:return t('badges.tiers.silver')
      case 1:return t('badges.tiers.bronze')
      default:return`Tier ${tier}`
    }
  }

  const resolveTierError=code=>{if(code==='ascending')return'상위 티어는 하위 티어보다 크거나 같아야 합니다.';return'0 이상의 숫자를 입력하세요.'}

  const handleTierInputChange=(slug,tier,value)=>{setTierDirty(true);setTierFormValues(prev=>({...prev,[slug]:{...(prev[slug]||{}),[tier]:value}}))}
  const handleTierReset=slug=>{const rule=badgeTierCatalog.find(r=>r.slug===slug);if(!rule)return;const defaults={};(rule.tiers||[]).forEach(tier=>{defaults[tier.tier]=String(tier.min)});setTierFormValues(prev=>({...prev,[slug]:defaults}));setTierDirty(true);setTierErrors(prev=>{const next={...prev};delete next[slug];return next})}
  const handleTierResetAll=()=>{setTierFormValues(buildBadgeTierFormState(badgeTierCatalog,{}));setTierDirty(true);setTierErrors({})}
  const handleTierSave=async()=>{if(!canEditBadgeTiers)return;const validation=validateBadgeTierForm(badgeTierCatalog,tierFormValues);setTierErrors(validation);if(Object.keys(validation).length>0)return;setTierSaving(true);const payload=mergeBadgeTierOverridesForSave(badgeTierCatalog,tierFormValues,badgeTierOverrides||{});const success=await onSaveBadgeTierOverrides(payload);setTierSaving(false);if(success){setTierDirty(false)}}

  const featureLabels={players:t('nav.players'),planner:t('nav.planner'),draft:t('nav.draft'),formation:t('nav.formation'),stats:t('nav.stats'),cards:'카드 기록 (Y/R/B)',mom:'MOM 투표/리더보드',badges:'챌린지 뱃지',playerStatsModal:'선수 기록 모달',accounting:t('nav.accounting'),analytics:t('nav.analytics')}
  const leaderboardLabels={pts:'AP(공격포인트)',g:'골',a:'어시스트',gp:'경기출전',cs:'클린시트',duo:'듀오(어→골)',cards:'카드(Y/R)'}
  const cardTypeLabels={yellow:'옐로우 카드 (Y)',red:'레드 카드 (R)',black:'블랙 카드 (B)'}

  return(
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8 space-y-6">
      <div id="settings-summary" className="rounded-2xl border border-stone-200 bg-white/90 shadow-sm backdrop-blur-sm p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Settings size={22}/>
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-stone-900">{t('settings.title')}</h1>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">Admin 전용</span>
            </div>
            <p className="text-sm text-stone-600">앱 타이틀부터 기능 토글, 뱃지 티어까지 탭으로 나눠 확인하세요. 필요한 탭만 열어 빠르게 설정할 수 있습니다.</p>
            <div className="flex flex-wrap gap-2 text-xs text-stone-600 pt-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1"><Info size={12}/> 유지보수: {maintenanceMode?'ON':'OFF'}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1"><BookOpen size={12}/> 시즌 리캡: {seasonRecapEnabled?'ON':'OFF'}</span>
              {typeof visits==='number'&&(
                <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1"><Shield size={12}/> 방문 {visits}회</span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <div className="flex w-full min-w-max gap-2">
            {tabConfig.map(tab=>{
              const Icon=tab.icon||Info
              const active=activeTab===tab.id
              return(
                <button key={tab.id} onClick={()=>setActiveTab(tab.id)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${active?'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm':'border-stone-200 bg-stone-50 text-stone-700 hover:bg-emerald-50 hover:border-emerald-200'}`}>
                  <Icon size={14}/>
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {activeTab==='app'&&(
        <div id="settings-app" className="rounded-2xl border border-stone-200 bg-white shadow-sm p-4 sm:p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase">App</p>
              <h2 className="text-base font-semibold text-stone-900">앱 기본 설정</h2>
              <p className="text-xs text-stone-500 mt-1">앱 타이틀과 시즌 리캡, 유지보수 모드를 관리합니다.</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-stone-700">{t('settings.appTitle')}</label>
                {!titleEditMode&&(
                  <button onClick={()=>setTitleEditMode(true)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">{t('common.edit')}</button>
                )}
              </div>
              {titleEditMode?(
                <div className="space-y-2">
                  <input type="text" value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="앱 타이틀 입력" className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" autoFocus/>
                  <div className="flex gap-2">
                    <button onClick={handleTitleUpdate} className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">저장</button>
                    <button onClick={()=>{setNewTitle(appTitle);setTitleEditMode(false)}} className="flex-1 px-3 py-2 text-sm font-semibold text-stone-700 bg-stone-200 hover:bg-stone-300 rounded-lg transition-colors">취소</button>
                  </div>
                </div>
              ):(
                <div className="px-3 py-2.5 text-sm rounded-lg border border-stone-200 bg-stone-50 text-stone-700 font-medium">{appTitle}</div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
                <div>
                  <p className="text-sm font-medium text-stone-800">{t('settings.seasonRecap')}</p>
                  <p className="text-xs text-stone-500">{t('settings.seasonRecapDesc')}</p>
                </div>
                <button onClick={()=>onSeasonRecapToggle(!seasonRecapEnabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${seasonRecapEnabled?'bg-emerald-600':'bg-stone-300'}`} role="switch" aria-checked={seasonRecapEnabled}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${seasonRecapEnabled?'translate-x-6':'translate-x-1'}`}/>
                </button>
              </div>

              {isAnalyticsAdmin&&(
                <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-stone-800">유지보수 모드 <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">개발자</span></p>
                    <p className="text-xs text-stone-500">일반 사용자에게 점검 페이지 표시</p>
                  </div>
                  <button onClick={()=>onMaintenanceModeToggle(!maintenanceMode)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${maintenanceMode?'bg-purple-600':'bg-stone-300'}`} role="switch" aria-checked={maintenanceMode}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${maintenanceMode?'translate-x-6':'translate-x-1'}`}/>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab==='feature'&&isAdmin&&(
        <div id="settings-feature" className="rounded-2xl border border-stone-200 bg-white shadow-sm p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-2">
            <SlidersHorizontal size={18} className="text-emerald-600"/>
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase">Features</p>
              <h2 className="text-base font-semibold text-stone-900">기능 토글</h2>
              <p className="text-xs text-stone-500 mt-1">탭 표시/숨김과 세부 기능을 제어합니다.</p>
            </div>
          </div>
          <div className="space-y-3">
            {Object.entries(featureLabels).map(([key,label])=>{
              if(key==='analytics'&&!isAnalyticsAdmin)return null
              const isOn=featuresEnabled?.[key]??true
              const badgesBlocked=key==='badges'&&!featuresEnabled?.playerStatsModal
              return(
                <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors">
                  <div className="flex flex-col text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-stone-700">{label}</span>
                      {key==='formation'&&<span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">모두</span>}
                      {key==='analytics'&&<span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">개발자</span>}
                      {key!=='formation'&&key!=='analytics'&&<span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Admin</span>}
                    </div>
                    {badgesBlocked&&<span className="mt-1 text-[11px] text-stone-500">선수 기록 모달을 켜야 이용할 수 있어요.</span>}
                  </div>
                  <button onClick={()=>{if(badgesBlocked){notify('선수 기록 모달을 활성화해야 챌린지 뱃지를 사용할 수 있어요.','info');return;} onFeatureToggle(key,!isOn)}} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${isOn?'bg-emerald-600':'bg-stone-300'} ${badgesBlocked?'cursor-not-allowed opacity-60':''}`} role="switch" aria-checked={isOn} aria-disabled={badgesBlocked}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isOn?'translate-x-5':'translate-x-1'}`}/>
                  </button>
                </div>
              )
            })}
          </div>
          <div className="text-xs text-stone-500 bg-blue-50 rounded-lg p-3 border border-blue-200 mt-3">ℹ️ 기능을 비활성화해도 저장된 매치와 선수 데이터는 유지됩니다. 기능을 다시 활성화하면 이전 데이터를 볼 수 있습니다.</div>
        </div>
      )}

      {activeTab==='leaderboard'&&isAdmin&&(
        <div id="settings-leaderboard" className="rounded-2xl border border-stone-200 bg-white shadow-sm p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={18} className="text-emerald-600"/>
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase">Leaderboard</p>
              <h2 className="text-base font-semibold text-stone-900">리더보드 카테고리</h2>
              <p className="text-xs text-stone-500 mt-1">숨겨도 데이터는 유지됩니다.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-emerald-900">리더보드 카드 전체</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800 font-medium">전체</span>
              </div>
              <button onClick={()=>{const current=featuresEnabled?.leaderboards?.visible;const isOn=current===undefined?true:!!current;onLeaderboardToggle?.('visible',!isOn)}} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${(featuresEnabled?.leaderboards?.visible===undefined?true:!!featuresEnabled?.leaderboards?.visible)?'bg-emerald-600':'bg-stone-300'}`} role="switch" aria-checked={featuresEnabled?.leaderboards?.visible===undefined?true:!!featuresEnabled?.leaderboards?.visible}>
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${(featuresEnabled?.leaderboards?.visible===undefined?true:!!featuresEnabled?.leaderboards?.visible)?'translate-x-5':'translate-x-1'}`}/>
              </button>
            </div>
            {Object.entries(leaderboardLabels).map(([key,label])=>{
              const current=featuresEnabled?.leaderboards?.[key]
              const isOn=current===undefined?true:!!current
              return(
                <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-stone-700">{label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-200 text-stone-700 font-medium">리더보드</span>
                  </div>
                  <button onClick={()=>onLeaderboardToggle?.(key,!isOn)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${isOn?'bg-emerald-600':'bg-stone-300'}`} role="switch" aria-checked={isOn}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isOn?'translate-x-5':'translate-x-1'}`}/>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeTab==='cards'&&isAdmin&&(
        <div id="settings-cards" className="rounded-2xl border border-stone-200 bg-white shadow-sm p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-2">
            <Shield size={18} className="text-emerald-600"/>
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase">Cards</p>
              <h2 className="text-base font-semibold text-stone-900">카드 타입 제어</h2>
              <p className="text-xs text-stone-500 mt-1">각 카드 타입을 개별적으로 켜고 끌 수 있습니다.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {Object.entries(cardTypeLabels).map(([key,label])=>{
              const current=featuresEnabled?.cardTypes?.[key]
              const isOn=current===undefined?true:!!current
              return(
                <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-stone-700">{label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">기록</span>
                  </div>
                  <button onClick={()=>onFeatureToggle(`cardTypes.${key}`,!isOn)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${isOn?'bg-emerald-600':'bg-stone-300'}`} role="switch" aria-checked={isOn}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isOn?'translate-x-5':'translate-x-1'}`}/>
                  </button>
                </div>
              )
            })}
          </div>
          <div className="text-xs text-stone-500 bg-amber-50 rounded-lg p-3 border border-amber-200 mt-3">ℹ️ 카드 타입을 비활성화하면 해당 카드의 기록 입력이 숨겨지지만, 기존 데이터는 유지됩니다.</div>
        </div>
      )}

      {activeTab==='badge'&&canEditBadgeTiers&&badgesFeatureOn&&(
        <div id="settings-badge" className="rounded-2xl border border-stone-200 bg-white shadow-sm p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-2">
            <Sparkles size={18} className="text-emerald-600"/>
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase">Badges</p>
              <h2 className="text-base font-semibold text-stone-900">뱃지 티어 기준</h2>
              <p className="text-xs text-stone-500 mt-1">브론즈~다이아몬드 임계값을 조정하여 팀 분위기에 맞게 커스터마이징하세요.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 text-[11px] text-stone-600">
                <div className="rounded-lg bg-stone-50 border border-stone-200 p-2">• 숫자는 0 이상, 낮은 티어 ≤ 높은 티어 순서를 유지하세요.</div>
                <div className="rounded-lg bg-stone-50 border border-stone-200 p-2">• 저장 후 모든 선수의 뱃지 계산에 즉시 반영됩니다.</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {badgeTierCatalog.map(rule=>(
              <div key={rule.slug} className="rounded-xl border border-stone-200 bg-white/80 p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-stone-900">{rule.name}</p>
                    <p className="text-[11px] uppercase tracking-wide text-stone-400">slug · {rule.slug}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {badgeTierOverrides?.[rule.slug]&&<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 ring-1 ring-emerald-200">커스텀</span>}
                    <button type="button" onClick={()=>handleTierReset(rule.slug)} className="text-xs font-semibold text-stone-500 hover:text-stone-700">기본값</button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {rule.tiers.slice().sort((a,b)=>a.tier-b.tier).map(tier=>(
                    <label key={`${rule.slug}-${tier.tier}`} className="flex flex-col gap-1 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2">
                      <span className="text-xs font-semibold text-stone-600">{tierName(tier.tier)}</span>
                      <input type="number" min="0" value={tierFormValues?.[rule.slug]?.[tier.tier]??''} onChange={e=>handleTierInputChange(rule.slug,tier.tier,e.target.value)} className="w-full rounded-md border border-stone-200 bg-white px-2 py-1 text-sm text-stone-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    </label>
                  ))}
                </div>
                {tierErrors[rule.slug]&&<p className="mt-2 text-xs font-semibold text-rose-600">{resolveTierError(tierErrors[rule.slug])}</p>}
              </div>
            ))}
          </div>

          <div className="sticky bottom-4 left-0 right-0 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={handleTierSave} disabled={!tierDirty||tierSaving} className={`flex-1 sm:flex-none rounded-lg px-3 py-2 text-sm font-semibold text-white ${(!tierDirty||tierSaving)?'bg-emerald-300 cursor-not-allowed':'bg-emerald-600 hover:bg-emerald-700'}`}>
              {tierSaving?'저장 중...':'티어 기준 저장'}
            </button>
            <button type="button" onClick={handleTierResetAll} className="sm:w-auto rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100">전체 기본값 복원</button>
          </div>
        </div>
      )}

      <div className="text-xs text-stone-500 bg-stone-50 rounded-lg p-3 border border-stone-200">💡 모든 설정은 데이터베이스에 저장되어 모든 디바이스에 동기화됩니다.</div>
    </div>
  )
}
