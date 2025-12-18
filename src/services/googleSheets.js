// src/services/googleSheets.js
import { gapi } from 'gapi-script'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4']
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly'

let gapiInitialized = false
let authInitialized = false

/**
 * Check if Google API is initialized
 */
export const isGapiInitialized = () => gapiInitialized

/**
 * Initialize Google API client
 * API 키 없이 OAuth만 사용 - 관리자의 Google 계정으로 인증
 */
export const initializeGapi = () => {
  return new Promise((resolve, reject) => {
    if (gapiInitialized) {
      resolve()
      return
    }

    gapi.load('client:auth2', async () => {
      try {
        await gapi.client.init({
          clientId: CLIENT_ID,
          discoveryDocs: DISCOVERY_DOCS,
          scope: SCOPES,
        })
        gapiInitialized = true
        authInitialized = true
        resolve()
      } catch (error) {
        console.error('Error initializing GAPI:', error)
        reject(error)
      }
    })
  })
}

/**
 * Sign in to Google
 */
export const signIn = async () => {
  try {
    if (!gapiInitialized) {
      await initializeGapi()
    }
    const authInstance = gapi.auth2.getAuthInstance()
    if (!authInstance) {
      throw new Error('Google Auth instance not available. Google API may not be properly initialized.')
    }
    
    console.log('[GoogleSheets] Attempting sign in...')
    const result = await authInstance.signIn({
      prompt: 'select_account'
    })
    console.log('[GoogleSheets] Sign in successful')
    return true
  } catch (error) {
    console.error('[GoogleSheets] Error signing in:', error)
    console.error('[GoogleSheets] Error type:', typeof error)
    console.error('[GoogleSheets] Error keys:', Object.keys(error || {}))
    console.error('[GoogleSheets] Error details:', {
      error: error.error,
      details: error.details,
      message: error.message,
      stack: error.stack
    })
    
    // Google OAuth 특정 에러 처리
    if (error.error === 'popup_closed_by_user') {
      throw new Error('로그인 창이 닫혔습니다. 다시 시도해주세요.')
    } else if (error.error === 'access_denied') {
      throw new Error('접근이 거부되었습니다. Google 계정 권한을 확인해주세요.')
    } else if (error.error === 'immediate_failed') {
      throw new Error('자동 로그인 실패. 수동으로 로그인해주세요.')
    }
    
    throw error
  }
}

/**
 * Sign out from Google
 */
export const signOut = async () => {
  try {
    const authInstance = gapi.auth2.getAuthInstance()
    await authInstance.signOut()
    return true
  } catch (error) {
    console.error('Error signing out:', error)
    throw error
  }
}

/**
 * Check if user is signed in
 */
export const isSignedIn = () => {
  if (!authInitialized) return false
  const authInstance = gapi.auth2.getAuthInstance()
  return authInstance.isSignedIn.get()
}

/**
 * Get current user info
 */
export const getCurrentUser = () => {
  if (!isSignedIn()) return null
  const authInstance = gapi.auth2.getAuthInstance()
  const user = authInstance.currentUser.get()
  const profile = user.getBasicProfile()
  return {
    id: profile.getId(),
    name: profile.getName(),
    email: profile.getEmail(),
    imageUrl: profile.getImageUrl(),
  }
}

/**
 * Listen to sign-in state changes
 */
export const onAuthChange = (callback) => {
  if (!authInitialized) {
    console.warn('Auth not initialized yet')
    return () => {}
  }
  const authInstance = gapi.auth2.getAuthInstance()
  return authInstance.isSignedIn.listen(callback)
}

/**
 * Extract spreadsheet ID from Google Sheets URL
 */
export const extractSpreadsheetId = (url) => {
  if (!url) return null
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

/**
 * Load data from Google Sheets
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} range - The range to read (e.g., 'Sheet1!A1:Z100')
 */
export const loadSheetData = async (spreadsheetId, range = 'Sheet1') => {
  try {
    if (!isSignedIn()) {
      throw new Error('Not signed in')
    }

    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    })

    return response.result.values || []
  } catch (error) {
    console.error('Error loading sheet data:', error)
    throw error
  }
}

/**
 * Save data to Google Sheets
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} range - The range to write (e.g., 'Sheet1!A1')
 * @param {Array<Array>} values - 2D array of values to write
 */
export const saveSheetData = async (spreadsheetId, range, values) => {
  try {
    if (!isSignedIn()) {
      throw new Error('Not signed in')
    }

    const response = await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values,
      },
    })

    return response.result
  } catch (error) {
    console.error('Error saving sheet data:', error)
    throw error
  }
}

/**
 * Append data to Google Sheets
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} range - The range to append to (e.g., 'Sheet1!A1')
 * @param {Array<Array>} values - 2D array of values to append
 */
export const appendSheetData = async (spreadsheetId, range, values) => {
  try {
    if (!isSignedIn()) {
      throw new Error('Not signed in')
    }

    const response = await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values,
      },
    })

    return response.result
  } catch (error) {
    console.error('Error appending sheet data:', error)
    throw error
  }
}

/**
 * Get spreadsheet metadata
 * @param {string} spreadsheetId - The spreadsheet ID
 */
export const getSpreadsheetInfo = async (spreadsheetId) => {
  try {
    if (!isSignedIn()) {
      throw new Error('Not signed in')
    }

    const response = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId,
    })

    return {
      title: response.result.properties.title,
      sheets: response.result.sheets.map(sheet => ({
        sheetId: sheet.properties.sheetId,
        title: sheet.properties.title,
        index: sheet.properties.index,
      })),
    }
  } catch (error) {
    console.error('Error getting spreadsheet info:', error)
    throw error
  }
}

/**
 * Create a new spreadsheet
 * @param {string} title - The title of the new spreadsheet
 */
export const createSpreadsheet = async (title) => {
  try {
    if (!isSignedIn()) {
      throw new Error('Not signed in')
    }

    const response = await gapi.client.sheets.spreadsheets.create({
      resource: {
        properties: {
          title,
        },
      },
    })

    return {
      spreadsheetId: response.result.spreadsheetId,
      spreadsheetUrl: response.result.spreadsheetUrl,
    }
  } catch (error) {
    console.error('Error creating spreadsheet:', error)
    throw error
  }
}
