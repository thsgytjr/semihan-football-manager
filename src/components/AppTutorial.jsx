// src/components/AppTutorial.jsx
import React, { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Check, Home, Users, CalendarDays, ListChecks } from 'lucide-react'

// 페이지별 아이콘 매핑
const PAGE_ICONS = {
  '/': <Home className="w-4 h-4" />,
  'dashboard': <Home className="w-4 h-4" />,
  '/players': <Users className="w-4 h-4" />,
  'players': <Users className="w-4 h-4" />,
  '/match': <CalendarDays className="w-4 h-4" />,
  'planner': <CalendarDays className="w-4 h-4" />,
  '/stats': <ListChecks className="w-4 h-4" />,
  'stats': <ListChecks className="w-4 h-4" />,
  '/formation': (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="5" width="20" height="14" rx="2" ry="2"/>
      <line x1="12" y1="5" x2="12" y2="19"/>
      <circle cx="12" cy="12" r="2.8"/>
      <rect x="2" y="8" width="3.5" height="8"/>
      <rect x="18.5" y="8" width="3.5" height="8"/>
    </svg>
  ),
  'formation': (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="5" width="20" height="14" rx="2" ry="2"/>
      <line x1="12" y1="5" x2="12" y2="19"/>
      <circle cx="12" cy="12" r="2.8"/>
      <rect x="2" y="8" width="3.5" height="8"/>
      <rect x="18.5" y="8" width="3.5" height="8"/>
    </svg>
  )
}

// 페이지별 이름 매핑
const PAGE_NAMES = {
  '/': '대시보드',
  'dashboard': '대시보드',
  '/players': '선수 관리',
  'players': '선수 관리',
  '/match': '매치 플래너',
  'planner': '매치 플래너',
  '/stats': '기록 입력',
  'stats': '기록 입력',
  '/formation': '포메이션 보드',
  'formation': '포메이션 보드'
}

// 일반 유저용 튜토리얼
const USER_TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: '축구팀 관리 앱에 오신 것을 환영합니다!',
    icon: '⚽',
    content: '우리 팀의 경기 일정, 결과, 선수 통계를 확인할 수 있는 앱입니다. 주요 기능을 알아보세요.',
    target: null,
    position: 'center'
  },
  {
    id: 'navigation',
    title: '메인 메뉴',
    icon: 'menu',
    content: '상단 메뉴에서 대시보드와 포메이션 보드를 이용할 수 있습니다. 각 페이지에서 팀의 다양한 정보를 확인하세요.',
    target: 'header',
    position: 'bottom'
  },
  {
    id: 'dashboard',
    title: '대시보드',
    icon: 'dashboard',
    content: '대시보드에서는 다가오는 경기 일정, 최근 매치 결과, 현재 리더보드를 한눈에 확인할 수 있습니다.',
    target: null,
    position: 'center',
    page: '/'
  },
  {
    id: 'upcoming-matches',
    title: '예정된 경기',
    icon: 'dashboard',
    content: '다가오는 경기의 날짜, 시간, 장소를 확인하세요. 경기 전 미리 일정을 체크할 수 있습니다.',
    target: null,
    position: 'center',
    page: '/'
  },
  {
    id: 'recent-matches',
    title: '최근 경기 결과',
    icon: 'dashboard',
    content: '최근 진행된 매치의 결과와 각 팀 구성을 확인할 수 있습니다. 어떤 선수들이 함께 뛰었는지 살펴보세요.',
    target: null,
    position: 'center',
    page: '/'
  },
  {
    id: 'leaderboard',
    title: '리더보드',
    icon: 'dashboard',
    content: '대시보드 하단에서 득점, 도움, 출전 횟수 등 다양한 순위를 확인할 수 있습니다. 우리 팀의 스타 플레이어를 확인하세요!',
    target: null,
    position: 'center',
    page: '/'
  },
  {
    id: 'formation',
    title: '포메이션 보드(Beta)',
    icon: 'formation',
    content: '포메이션 보드에서는 저장된 매치들의 팀 구성과 포메이션을 확인할 수 있습니다. 각 선수가 어떤 포지션에서 뛰었는지 살펴보세요.',
    target: null,
    position: 'center',
    page: '/formation'
  },
  {
    id: 'formation-details',
    title: '선수 배치 확인',
    icon: 'formation',
    content: '경기장 그래픽에서 각 선수의 위치를 시각적으로 확인할 수 있습니다. 4-4-2, 4-3-3 등 다양한 포메이션을 살펴보세요.',
    target: null,
    position: 'center',
    page: '/formation'
  },
  {
    id: 'complete',
    title: '준비 완료!',
    icon: '🎉',
    content: '이제 앱에서 경기 일정, 결과, 리더보드를 확인할 수 있습니다. 궁금한 점이 있으면 관리자에게 문의하세요. 즐거운 축구 생활 되세요!',
    target: null,
    position: 'center'
  }
]

// 관리자용 튜토리얼
const ADMIN_TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: '축구팀 관리 앱에 오신 것을 환영합니다!',
    icon: '⚽',
    content: '관리자로서 축구팀을 완벽하게 관리할 수 있는 올인원 솔루션입니다. 선수 관리부터 경기 계획, 통계 분석, 앱 설정까지 모든 기능을 알아보세요.',
    target: null,
    position: 'center'
  },
  {
    id: 'admin-role',
    title: '관리자 권한',
    icon: '👑',
    content: '관리자는 모든 데이터를 생성, 수정, 삭제할 수 있습니다. 선수 추가/수정, 경기 생성, 팀 구성, 통계 입력, 앱 설정 변경 등 모든 권한이 있습니다.',
    target: null,
    position: 'center'
  },
  {
    id: 'navigation',
    title: '메인 메뉴',
    icon: 'menu',
    content: '상단 메뉴를 통해 대시보드, 선수, 경기, 팀, 통계 페이지로 이동할 수 있습니다. 각 페이지에서 데이터를 관리하고 수정할 수 있습니다.',
    target: 'header',
    position: 'bottom'
  },
  {
    id: 'settings',
    title: '앱 설정',
    icon: '⚙️',
    content: '헤더 우측의 설정 버튼을 통해 앱 이름을 변경할 수 있습니다. 변경사항은 모든 디바이스에 동기화됩니다.',
    target: null,
    position: 'center'
  },
  {
    id: 'dashboard',
    title: '대시보드',
    icon: 'dashboard',
    content: '다가오는 경기, 최근 매치 결과, 리더보드를 한눈에 확인할 수 있습니다. 팀의 전반적인 현황을 파악하세요.',
    target: null,
    position: 'center',
    page: '/'
  },
  {
    id: 'players',
    title: '선수 관리',
    icon: 'players',
    content: '선수 페이지에서 팀원을 추가하고 관리할 수 있습니다. "새 선수 추가" 버튼을 눌러 선수 정보와 능력치를 입력하세요.',
    target: null,
    position: 'center',
    page: '/players'
  },
  {
    id: 'player-stats',
    title: '선수 능력치 설정',
    icon: '📊',
    content: '각 선수의 스피드, 슈팅, 패스, 드리블, 수비, 피지컬 능력치를 0-99 사이로 설정할 수 있습니다. 이 데이터는 AI 매칭과 통계에 활용됩니다.',
    target: null,
    position: 'center',
    page: '/players'
  },
  {
    id: 'player-membership',
    title: '회원 구분',
    icon: '💎',
    content: '선수를 정회원 또는 게스트로 구분할 수 있습니다. 정회원은 정규 팀원이고, 게스트는 친선전이나 특별 경기에 참여하는 선수입니다.',
    target: null,
    position: 'center',
    page: '/players'
  },
  {
    id: 'player-view',
    title: '보기 모드',
    icon: '👁️',
    content: '카드 뷰와 리스트 뷰를 전환할 수 있습니다. 리스트 뷰에서 선수를 클릭하면 수정 또는 삭제할 수 있습니다.',
    target: null,
    position: 'center',
    page: '/players'
  },
  {
    id: 'match-planner',
    title: '경기 플래너',
    icon: 'planner',
    content: '경기 페이지에서 새로운 매치를 만들고, 팀을 구성하고, 포메이션을 설정할 수 있습니다. AI가 자동으로 균형잡힌 팀을 만들어줍니다.',
    target: null,
    position: 'center',
    page: '/match'
  },
  {
    id: 'formation',
    title: '포메이션 설정',
    icon: 'formation',
    content: '4-4-2, 4-3-3, 3-5-2 등 다양한 포메이션을 선택할 수 있습니다. 드래그 앤 드롭으로 선수 위치를 자유롭게 조정하세요.',
    target: null,
    position: 'center',
    page: '/match'
  },
  {
    id: 'ai-balance',
    title: 'AI 자동 밸런싱',
    icon: '🤖',
    content: 'AI 파워 기능으로 선수들의 능력치와 실제 경기 성적을 분석하여 공정한 팀을 자동으로 구성합니다.\n\n상세 계산 방식:\n\n1. 기본 능력치 점수 (70% 반영)\n   • 스피드, 슈팅, 패스, 드리블, 수비, 피지컬 6가지 능력치의 평균값\n   • 각 능력치는 0-99 사이 값으로 측정됩니다\n\n2. 리더보드 실적 점수 (30% 반영)\n   • 득점수: 골 1개당 +5점\n   • 어시스트: 도움 1개당 +3점\n   • 출전 횟수: 경기 1회당 +1점\n\n3. 최종 밸런싱\n   • 각 선수의 종합 점수 = (능력치 평균 × 0.7) + (실적 점수 × 0.3)\n   • 두 팀의 총점 차이가 5% 이내가 되도록 선수 배분\n   • 포지션별(공격수, 미드필더, 수비수, 골키퍼) 균형도 함께 고려',
    target: null,
    position: 'center',
    page: '/match'
  },
  {
    id: 'stats',
    title: '통계 입력',
    icon: 'stats',
    content: '경기 후 각 선수의 골, 어시스트, 경고, 퇴장 등의 기록을 입력할 수 있습니다. 이 데이터는 리더보드에 반영됩니다.',
    target: null,
    position: 'center',
    page: '/stats'
  },
  {
    id: 'leaderboard',
    title: '리더보드',
    icon: 'dashboard',
    content: '통계 페이지에서 득점왕, 도움왕, 최다 출전 선수 등 다양한 랭킹을 확인할 수 있습니다. 선수들의 경쟁심을 자극하세요!',
    target: null,
    position: 'center',
    page: '/stats'
  },
  {
    id: 'tips',
    title: '관리자 팁',
    icon: '💡',
    content: '• 정기적으로 선수 능력치를 업데이트하세요\n• 매치마다 통계를 입력하여 정확한 랭킹을 유지하세요\n• 다양한 포메이션을 시도해보세요\n• 게스트 선수도 추가하여 친선전을 즐기세요',
    target: null,
    position: 'center'
  },
  {
    id: 'complete',
    title: '시작할 준비가 되었습니다!',
    icon: '🎉',
    content: '이제 모든 기능을 자유롭게 사용하실 수 있습니다. 축구팀 관리의 즐거움을 느껴보세요! 문제가 있거나 도움이 필요하면 언제든지 튜토리얼을 다시 확인하세요.',
    target: null,
    position: 'center'
  }
];

export default function AppTutorial({ isOpen, onClose, isAdmin = false }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(false)

  // 관리자/일반 유저에 따라 다른 튜토리얼 스텝 사용
  const TUTORIAL_STEPS = isAdmin ? ADMIN_TUTORIAL_STEPS : USER_TUTORIAL_STEPS

  useEffect(() => {
    // 튜토리얼 완료 여부 확인 (관리자/일반 유저 구분)
    const storageKey = isAdmin ? 'adminTutorialCompleted' : 'userTutorialCompleted'
    const completed = localStorage.getItem(storageKey)
    setHasCompletedTutorial(completed === 'true')
  }, [isAdmin])

  const handleClose = () => {
    onClose()
    setCurrentStep(0)
  }

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = () => {
    const storageKey = isAdmin ? 'adminTutorialCompleted' : 'userTutorialCompleted'
    const autoShownKey = isAdmin ? 'adminTutorialAutoShown' : 'userTutorialAutoShown'
    
    // 완료 시에는 항상 다시 보이지 않도록 설정
    localStorage.setItem(storageKey, 'true')
    localStorage.setItem(autoShownKey, 'true')
    setHasCompletedTutorial(true)
    onClose()
    setCurrentStep(0)
  }

  const handleSkip = () => {
    const storageKey = isAdmin ? 'adminTutorialCompleted' : 'userTutorialCompleted'
    const autoShownKey = isAdmin ? 'adminTutorialAutoShown' : 'userTutorialAutoShown'
    
    // 건너뛰기도 영구적으로 다시 보이지 않도록 설정
    localStorage.setItem(storageKey, 'true')
    localStorage.setItem(autoShownKey, 'true')
    setHasCompletedTutorial(true)
    onClose()
    setCurrentStep(0)
  }

  if (!isOpen) return null

  const step = TUTORIAL_STEPS[currentStep]
  const progress = ((currentStep + 1) / TUTORIAL_STEPS.length) * 100

  // 아이콘 렌더링 함수
  const renderIcon = (iconId) => {
    if (!iconId) return null
    // 단일 문자면 이모지
    if (typeof iconId === 'string' && iconId.length <= 2) {
      return <span className="text-2xl">{iconId}</span>
    }
    // 아이콘 식별자면 컴포넌트 반환
    return PAGE_ICONS[iconId] || null
  }

  return (
    <div className="fixed inset-0 z-[400] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full h-[600px] flex flex-col animate-slideUp">
        {/* 헤더 */}
        <div className="relative px-6 py-5 border-b border-stone-200 flex-shrink-0">
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 p-2 rounded-full hover:bg-stone-100 transition-colors text-stone-500 hover:text-stone-700"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="pr-12">
            <div className="flex items-center gap-2 text-sm text-stone-500 mb-2">
              <span className="font-medium">단계 {currentStep + 1}</span>
              <span>/</span>
              <span>{TUTORIAL_STEPS.length}</span>
            </div>
            <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
              {renderIcon(step.icon)}
              {step.title}
            </h2>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-4 h-1.5 bg-stone-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 컨텐츠 - 스크롤 가능 */}
        <div className="flex-1 overflow-y-auto px-6 py-8 min-h-0">
          {step.page && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-sm text-blue-800 flex items-center gap-2">
                <span className="text-xl">💡</span>
                <span className="flex items-center gap-1.5">
                  이 기능은 
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 rounded-md font-semibold">
                    {PAGE_ICONS[step.page]}
                  </span>
                  페이지에서 사용할 수 있습니다.
                </span>
              </p>
            </div>
          )}

          <div className="prose prose-stone max-w-none">
            <p className="text-lg text-stone-700 leading-relaxed whitespace-pre-line">
              {step.content}
            </p>
          </div>
        </div>

        {/* 푸터 - 고정 */}
        <div className="px-6 py-5 border-t border-stone-200 bg-stone-50 rounded-b-3xl flex-shrink-0">
          <div className="flex items-center justify-between gap-3 mb-4">
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors whitespace-nowrap"
            >
              건너뛰기
            </button>

            <div className="flex items-center gap-3">
              {/* 이전 버튼 자리 확보 (보이지 않을 때도 공간 유지) */}
              <div className="w-[90px]">
                {currentStep > 0 && (
                  <button
                    onClick={handlePrev}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-stone-300 font-semibold text-stone-700 hover:bg-stone-100 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <ChevronLeft className="w-4 h-4 flex-shrink-0" />
                    <span>이전</span>
                  </button>
                )}
              </div>
              
              <button
                onClick={handleNext}
                className="px-6 py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-lg flex items-center gap-2 min-w-[100px] justify-center"
              >
                {currentStep === TUTORIAL_STEPS.length - 1 ? (
                  <>
                    <Check className="w-4 h-4" />
                    완료
                  </>
                ) : (
                  <>
                    다음
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 점 인디케이터 */}
          <div className="flex items-center justify-center gap-1.5">
            {TUTORIAL_STEPS.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`transition-all ${
                  idx === currentStep
                    ? 'w-8 h-2 bg-emerald-600 rounded-full'
                    : 'w-2 h-2 bg-stone-300 rounded-full hover:bg-stone-400'
                }`}
                aria-label={`${idx + 1}단계로 이동`}
              />
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
      `}</style>
    </div>
  )
}

// 튜토리얼 시작 버튼 컴포넌트
export function TutorialButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg"
      title="앱 가이드 보기"
    >
      <span className="text-lg">📚</span>
      <span className="hidden md:inline">가이드</span>
    </button>
  )
}

// 첫 방문자를 위한 자동 시작 훅
export function useAutoTutorial(isAdmin = false) {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false)

  useEffect(() => {
    const storageKey = isAdmin ? 'adminTutorialCompleted' : 'userTutorialCompleted'
    const tutorialCompleted = localStorage.getItem(storageKey)
    
    // 튜토리얼을 완료했거나 건너뛴 적이 있으면 자동으로 열지 않음
    if (tutorialCompleted === 'true') {
      return
    }
    
    // 자동으로 열린 적이 있으면 다시 열지 않음 (브라우저를 닫아도 유지)
    const autoShownKey = isAdmin ? 'adminTutorialAutoShown' : 'userTutorialAutoShown'
    const hasAutoShown = localStorage.getItem(autoShownKey)
    
    if (!hasAutoShown) {
      // 첫 방문이면 1초 후에 튜토리얼 자동 시작 (딱 한 번만)
      const timer = setTimeout(() => {
        setShouldShowTutorial(true)
        localStorage.setItem(autoShownKey, 'true')
      }, 1000)
      
      return () => clearTimeout(timer)
    }
  }, [isAdmin])

  return { shouldShowTutorial, setShouldShowTutorial }
}
