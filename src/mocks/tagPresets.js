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

export const tagPresetsHandlers = [
  // GET /rest/v1/tag_presets - List all tag presets for room
  http.get('*/rest/v1/tag_presets', async ({ request }) => {
    const url = new URL(request.url);
    const roomFilter = url.searchParams.get('room_id');
    
    logger.info('[MSW] GET /tag_presets', { roomFilter });
    
    // Filter by room_id and sort by sort_order
    const filtered = mockData.tagPresets
      .filter(t => !roomFilter || t.room_id === roomFilter)
      .sort((a, b) => a.sort_order - b.sort_order);
    
    return HttpResponse.json(filtered, { 
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }),

  // POST /rest/v1/tag_presets - Create new tag preset
  http.post('*/rest/v1/tag_presets', async ({ request }) => {
    const body = await request.json();
    logger.info('[MSW] POST /tag_presets', body);
    
    const newPreset = {
      id: mockData.tagPresets.length + 1,
  room_id: 'semihan-lite-room-1', // Mock env uses default semihan room
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...toSnakeCase(body),
    };
    
    mockData.tagPresets.push(newPreset);
    
    return HttpResponse.json(newPreset, { 
      status: 201,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }),

  // PATCH /rest/v1/tag_presets - Update tag preset
  http.patch('*/rest/v1/tag_presets', async ({ request }) => {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const body = await request.json();
    
    logger.info('[MSW] PATCH /tag_presets', { id, body });
    
    const index = mockData.tagPresets.findIndex(t => t.id === parseInt(id));
    if (index === -1) {
      return HttpResponse.json(
        { error: 'Tag preset not found' },
        { status: 404 }
      );
    }
    
    const updated = {
      ...mockData.tagPresets[index],
      ...toSnakeCase(body),
      updated_at: new Date().toISOString(),
    };
    
    mockData.tagPresets[index] = updated;
    
    return HttpResponse.json(updated, { 
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }),

  // DELETE /rest/v1/tag_presets - Delete all tag presets for room (for bulk replace)
  http.delete('*/rest/v1/tag_presets', async ({ request }) => {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const roomFilter = url.searchParams.get('room_id');
    
    logger.info('[MSW] DELETE /tag_presets', { id, roomFilter });
    
    if (id) {
      // Delete single preset by ID
      const index = mockData.tagPresets.findIndex(t => t.id === parseInt(id));
      if (index === -1) {
        return HttpResponse.json(
          { error: 'Tag preset not found' },
          { status: 404 }
        );
      }
      
      mockData.tagPresets.splice(index, 1);
    } else if (roomFilter) {
      // Delete all presets for room (for bulk replace)
      mockData.tagPresets = mockData.tagPresets.filter(t => t.room_id !== roomFilter);
    }
    
    return HttpResponse.json(null, { 
      status: 204,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }),
];
