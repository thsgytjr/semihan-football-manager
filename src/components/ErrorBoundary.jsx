import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // 에러 정보 저장
    this.setState({
      error,
      errorInfo,
    })

    // 개발 환경에서는 콘솔에 출력
    if (import.meta.env.DEV) {
      console.error('🔥 ErrorBoundary caught error:', error, errorInfo)
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
    
    // 커스텀 리셋 핸들러 실행
    if (this.props.onReset) {
      this.props.onReset()
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      // 커스텀 fallback UI가 있으면 사용
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          reset: this.handleReset,
        })
      }

      // 기본 에러 UI
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl border border-red-100 overflow-hidden">
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-red-500 to-orange-500 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-2xl">
                  ⚠️
                </div>
                <div>
                  <h1 className="text-xl font-bold">문제가 발생했습니다</h1>
                  <p className="text-sm text-red-50 mt-1">
                    {this.props.componentName || '페이지'}에서 오류가 발생했습니다
                  </p>
                </div>
              </div>
            </div>

            {/* 본문 */}
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 leading-relaxed">
                  일시적인 문제일 수 있습니다. 
                  {this.props.resetable !== false && ' 다시 시도하거나'}
                  {' '}페이지를 새로고침해주세요.
                </p>
              </div>

              {/* 개발 환경에서만 에러 상세 표시 */}
              {import.meta.env.DEV && this.state.error && (
                <details className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-red-700 hover:text-red-800">
                    🐛 개발자 정보 (프로덕션에서는 숨겨짐)
                  </summary>
                  <div className="mt-3 space-y-2">
                    <div>
                      <div className="text-xs font-semibold text-red-700 mb-1">에러:</div>
                      <pre className="text-xs bg-white p-2 rounded border border-red-200 overflow-x-auto">
                        {this.state.error.toString()}
                      </pre>
                    </div>
                    {this.state.errorInfo && (
                      <div>
                        <div className="text-xs font-semibold text-red-700 mb-1">스택:</div>
                        <pre className="text-xs bg-white p-2 rounded border border-red-200 overflow-x-auto max-h-40">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}

              {/* 액션 버튼 */}
              <div className="flex gap-3 pt-2">
                {this.props.resetable !== false && (
                  <button
                    onClick={this.handleReset}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-semibold shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-200"
                  >
                    🔄 다시 시도
                  </button>
                )}
                <button
                  onClick={this.handleReload}
                  className="flex-1 px-4 py-3 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-200 hover:border-gray-300 rounded-lg font-semibold shadow-sm hover:shadow active:scale-[0.98] transition-all duration-200"
                >
                  ↻ 새로고침
                </button>
              </div>

              {/* 문의 안내 */}
              <div className="pt-3 border-t">
                <p className="text-xs text-gray-500 text-center">
                  문제가 계속되면 관리자에게 문의해주세요
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
