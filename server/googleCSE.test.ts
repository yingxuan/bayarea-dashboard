/**
 * Test Google CSE API credentials
 */

import { describe, it, expect } from 'vitest';
import { searchGoogle } from './googleCSE';

describe('Google CSE API', () => {
  it('should successfully search for SPY price', async () => {
    const results = await searchGoogle('SPY price today', 3);
    
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    
    // Check result structure
    const firstResult = results[0];
    expect(firstResult).toHaveProperty('title');
    expect(firstResult).toHaveProperty('link');
    expect(firstResult).toHaveProperty('snippet');
    expect(firstResult).toHaveProperty('displayLink');
    
    console.log('✓ Google CSE API credentials are valid');
    console.log(`  Found ${results.length} results for "SPY price today"`);
    console.log(`  First result: ${firstResult.title}`);
  }, 30000); // 30 second timeout for API call
});
