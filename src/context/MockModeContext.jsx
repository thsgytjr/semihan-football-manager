import React, { createContext, useContext } from 'react'

const MockModeContext = createContext()

export function MockModeProvider({ children, isMockMode }) {
  return (
    <MockModeContext.Provider value={{ isMockMode }}>
      {children}
    </MockModeContext.Provider>
  )
}

export function useMockMode() {
  const context = useContext(MockModeContext)
  if (!context) {
    throw new Error('useMockMode must be used within MockModeProvider')
  }
  return context.isMockMode
}
