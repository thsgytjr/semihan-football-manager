// src/services/googleSheets.js
// Google Identity Services (GIS) 사용 - gapi-script는 deprecated됨

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly'

let tokenClient = null
let accessToken = null
let gapiInitialized = false
let gisInitialized = false

/**
 * Check if Google API is initialized
 */
export const isGapiInitialized = () => gapiInitialized && gisInitialized

/**
 * Load Google API client library
 */
const loadGapiClient = () => {
  return new Promise((resolve, reject) => {
    if (window.gapi) {
      resolve()
      return
    }
    
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

/**
 * Load Google Identity Services library
 */
const loadGisClient = () => {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

/**
 * Initialize Google API client
 */
export const initializeGapi = async () => {
  if (gapiInitialized && gisInitialized) {
    return
  }

  try {
    // Load both libraries
    await Promise.all([loadGapiClient(), loadGisClient()])
    
    // Initialize gapi client
    await new Promise((resolve, reject) => {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
          })
          gapiInitialized = true
          resolve()
        } catch (error) {
          reject(error)
        }
      })
    })

    // Initialize GIS token client
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: '', // Will be set in signIn
    })
    
    gisInitialized = true
  } catch (error) {
    console.error('Error initializing Google APIs:', error)
    throw error
  }
}

/**
 * Sign in to Google
 */
export const signIn = async () => {
  try {
    if (!gapiInitialized || !gisInitialized) {
      await initializeGapi()
    }

    console.log('[GoogleSheets] Attempting sign in...')
    
    return new Promise((resolve, reject) => {
      tokenClient.callback = (response) => {
        if (response.error) {
          console.error('[GoogleSheets] Token error:', response)
          reject(new Error(response.error_description || response.error))
          return
        }
        
        accessToken = response.access_token
        window.gapi.client.setToken({ access_token: accessToken })
        console.log('[GoogleSheets] Sign in successful')
        resolve(true)
      }

      // Request access token
      tokenClient.requestAccessToken({ prompt: 'select_account' })
    })
  } catch (error) {
    console.error('[GoogleSheets] Error signing in:', error)
    console.error('[GoogleSheets] Error details:', {
      message: error.message,
      stack: error.stack
    })
    throw error
  }
}

/**
 * Sign out from Google
 */
export const signOut = async () => {
  try {
    if (accessToken) {
      window.google.accounts.oauth2.revoke(accessToken, () => {
        console.log('[GoogleSheets] Token revoked')
      })
      accessToken = null
      window.gapi.client.setToken(null)
    }
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
  return accessToken !== null
}

/**
 * Get current user info (GIS doesn't provide profile easily, return minimal info)
 */
export const getCurrentUser = () => {
  if (!isSignedIn()) return null
  // GIS doesn't provide user profile in the token response
  // You'd need to call a separate API for user info
  return {
    id: null,
    name: 'User',
    email: null,
    imageUrl: null,
  }
}

/**
 * Listen to sign-in state changes
 * Note: GIS doesn't have built-in state listener like gapi.auth2
 * Apps should manually update state after signIn/signOut
 */
export const onAuthChange = (callback) => {
  // GIS doesn't provide state change listener
  // Return no-op function for compatibility
  return () => {}
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

    const response = await window.gapi.client.sheets.spreadsheets.values.get({
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

    const response = await window.gapi.client.sheets.spreadsheets.values.update({
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

    const response = await window.gapi.client.sheets.spreadsheets.values.append({
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

    const response = await window.gapi.client.sheets.spreadsheets.get({
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
