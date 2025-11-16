import { http, HttpResponse } from 'msw';
import { mockData } from './data.js';
import { logger } from '../lib/logger.js';

/**
 * Convert camelCase object to snake_case for database
 */
function toSnakeCase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  
  const result = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = obj[key];
  }
  return result;
}

/**
 * Convert snake_case object to camelCase for application
 */
function toCamelCase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  
  const result = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

export const upcomingMatchesHandlers = [
  // GET /rest/v1/upcoming_matches - List all upcoming matches for room
  http.get('*/rest/v1/upcoming_matches', async ({ request }) => {
    const url = new URL(request.url);
    const roomFilter = url.searchParams.get('room_id');
    
    logger.info('[MSW] GET /upcoming_matches', { roomFilter });
    
    // Filter by room_id
    const filtered = mockData.upcomingMatches.filter(m => 
      !roomFilter || m.room_id === roomFilter
    );
    
    return HttpResponse.json(filtered, { 
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }),

  // POST /rest/v1/upcoming_matches - Create new upcoming match
  http.post('*/rest/v1/upcoming_matches', async ({ request }) => {
    const body = await request.json();
    logger.info('[MSW] POST /upcoming_matches', body);
    
    const newMatch = {
      id: mockData.upcomingMatches.length + 1,
  room_id: 'semihan-lite-room-1', // Mock env uses default semihan room
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...toSnakeCase(body),
    };
    
    mockData.upcomingMatches.push(newMatch);
    
    return HttpResponse.json(newMatch, { 
      status: 201,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }),

  // PATCH /rest/v1/upcoming_matches - Update upcoming match
  http.patch('*/rest/v1/upcoming_matches', async ({ request }) => {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const body = await request.json();
    
    logger.info('[MSW] PATCH /upcoming_matches', { id, body });
    
    const index = mockData.upcomingMatches.findIndex(m => m.id === parseInt(id));
    if (index === -1) {
      return HttpResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }
    
    const updated = {
      ...mockData.upcomingMatches[index],
      ...toSnakeCase(body),
      updated_at: new Date().toISOString(),
    };
    
    mockData.upcomingMatches[index] = updated;
    
    return HttpResponse.json(updated, { 
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }),

  // DELETE /rest/v1/upcoming_matches - Delete upcoming match
  http.delete('*/rest/v1/upcoming_matches', async ({ request }) => {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    
    logger.info('[MSW] DELETE /upcoming_matches', { id });
    
    const index = mockData.upcomingMatches.findIndex(m => m.id === parseInt(id));
    if (index === -1) {
      return HttpResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }
    
    mockData.upcomingMatches.splice(index, 1);
    
    return HttpResponse.json(null, { 
      status: 204,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }),
];
