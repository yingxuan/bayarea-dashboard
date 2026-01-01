/**
 * PHASE 3 - FIXED EXTRACTION LOGIC
 * Context-aware regex patterns for accurate price extraction
 */

/**
 * Extract SPY price from snippet
 * SPY prices are typically $400-$800
 * Avoid matching "500" from "S&P 500"
 */
function extractSPYPrice(text: string): number | null {
  const cleaned = text.replace(/,/g, '');
  
  // Pattern 1: Look for price with $ symbol and 2 decimal places
  const dollarPattern = /\$([4-8][\d]{2}\.[\d]{2})/;
  const dollarMatch = cleaned.match(dollarPattern);
  if (dollarMatch) {
    const price = parseFloat(dollarMatch[1]);
    if (price >= 400 && price <= 800) {
      return price;
    }
  }
  
  // Pattern 2: Look for 3-digit number with decimals (not "500" alone)
  const pricePattern = /([4-8][\d]{2}\.[\d]{1,2})/;
  const priceMatch = cleaned.match(pricePattern);
  if (priceMatch) {
    const price = parseFloat(priceMatch[1]);
    if (price >= 400 && price <= 800) {
      return price;
    }
  }
  
  // Pattern 3: Look for "SPY" followed by price
  const spyAfterPattern = /SPY.*?([4-8][\d]{2}\.[\d]{1,2})/i;
  const spyAfterMatch = cleaned.match(spyAfterPattern);
  if (spyAfterMatch) {
    const price = parseFloat(spyAfterMatch[1]);
    if (price >= 400 && price <= 800) {
      return price;
    }
  }
  
  return null;
}

/**
 * Extract Gold price from snippet
 * Gold prices are typically $2,000-$5,000 per oz
 * Avoid matching "26" from "Feb 26" or other dates
 */
function extractGoldPrice(text: string): number | null {
  const cleaned = text.replace(/,/g, '');
  
  // Pattern 1: Look for 4-digit price in gold range with $ symbol
  const dollarPattern = /\$([2-5][\d]{3}\.[\d]{1,2})/;
  const dollarMatch = cleaned.match(dollarPattern);
  if (dollarMatch) {
    const price = parseFloat(dollarMatch[1]);
    if (price >= 2000 && price <= 5000) {
      return price;
    }
  }
  
  // Pattern 2: Look for 4-digit number in gold range
  const pricePattern = /([2-5][\d]{3}\.[\d]{1,2})/;
  const priceMatch = cleaned.match(pricePattern);
  if (priceMatch) {
    const price = parseFloat(priceMatch[1]);
    if (price >= 2000 && price <= 5000) {
      return price;
    }
  }
  
  // Pattern 3: Look for "gold" followed by 4-digit price
  const goldAfterPattern = /gold.*?([2-5][\d]{3}\.[\d]{1,2})/i;
  const goldAfterMatch = cleaned.match(goldAfterPattern);
  if (goldAfterMatch) {
    const price = parseFloat(goldAfterMatch[1]);
    if (price >= 2000 && price <= 5000) {
      return price;
    }
  }
  
  // Pattern 4: Look for price before "gold"
  const goldBeforePattern = /([2-5][\d]{3}\.[\d]{1,2}).*?gold/i;
  const goldBeforeMatch = cleaned.match(goldBeforePattern);
  if (goldBeforeMatch) {
    const price = parseFloat(goldBeforeMatch[1]);
    if (price >= 2000 && price <= 5000) {
      return price;
    }
  }
  
  return null;
}

/**
 * Extract Bitcoin price from snippet
 * Bitcoin prices are typically $10,000-$150,000
 */
function extractBitcoinPrice(text: string): number | null {
  const cleaned = text.replace(/,/g, '');
  
  // Pattern 1: Look for 5-6 digit price with $ symbol
  const dollarPattern = /\$([\d]{5,6}\.[\d]{1,2})/;
  const dollarMatch = cleaned.match(dollarPattern);
  if (dollarMatch) {
    const price = parseFloat(dollarMatch[1]);
    if (price >= 10000 && price <= 150000) {
      return price;
    }
  }
  
  // Pattern 2: Look for 5-6 digit number
  const pricePattern = /([\d]{5,6}\.[\d]{1,2})/;
  const priceMatch = cleaned.match(pricePattern);
  if (priceMatch) {
    const price = parseFloat(priceMatch[1]);
    if (price >= 10000 && price <= 150000) {
      return price;
    }
  }
  
  // Pattern 3: Look for "bitcoin" or "BTC" followed by price
  const btcAfterPattern = /(?:bitcoin|BTC).*?([\d]{5,6}\.[\d]{1,2})/i;
  const btcAfterMatch = cleaned.match(btcAfterPattern);
  if (btcAfterMatch) {
    const price = parseFloat(btcAfterMatch[1]);
    if (price >= 10000 && price <= 150000) {
      return price;
    }
  }
  
  return null;
}

/**
 * Extract Powerball jackpot from snippet
 * Format: "$485 million" or "$1.2 billion"
 */
function extractPowerballJackpot(text: string): number | null {
  // Pattern 1: Billion format
  const billionPattern = /\$?([\d,]+(?:\.[\d]+)?)\s*(?:billion|B)/i;
  const billionMatch = text.match(billionPattern);
  if (billionMatch) {
    const amount = parseFloat(billionMatch[1].replace(/,/g, '')) * 1000000000;
    if (amount >= 100000000 && amount <= 10000000000) {
      return amount;
    }
  }
  
  // Pattern 2: Million format
  const millionPattern = /\$?([\d,]+(?:\.[\d]+)?)\s*(?:million|M)/i;
  const millionMatch = text.match(millionPattern);
  if (millionMatch) {
    const amount = parseFloat(millionMatch[1].replace(/,/g, '')) * 1000000;
    if (amount >= 100000000 && amount <= 10000000000) {
      return amount;
    }
  }
  
  // Pattern 3: Look for "jackpot" followed by amount
  const jackpotPattern = /jackpot.*?\$?([\d,]+)\s*(?:million|M)/i;
  const jackpotMatch = text.match(jackpotPattern);
  if (jackpotMatch) {
    const amount = parseFloat(jackpotMatch[1].replace(/,/g, '')) * 1000000;
    if (amount >= 100000000 && amount <= 10000000000) {
      return amount;
    }
  }
  
  return null;
}

/**
 * Extract mortgage rate from snippet
 * Format: "6.9%" or "6.90%"
 * Returns as decimal (e.g., 0.069 for 6.9%)
 */
function extractMortgageRate(text: string): number | null {
  // Pattern 1: Look for percentage with % symbol
  const percentPattern = /([\d]+\.[\d]{1,2})%/;
  const percentMatch = text.match(percentPattern);
  if (percentMatch) {
    const rate = parseFloat(percentMatch[1]) / 100;
    // Mortgage rates typically 3%-10%
    if (rate >= 0.03 && rate <= 0.10) {
      return rate;
    }
  }
  
  // Pattern 2: Look for "rate" followed by percentage
  const ratePattern = /rate.*?([\d]+\.[\d]{1,2})%/i;
  const rateMatch = text.match(ratePattern);
  if (rateMatch) {
    const rate = parseFloat(rateMatch[1]) / 100;
    if (rate >= 0.03 && rate <= 0.10) {
      return rate;
    }
  }
  
  return null;
}

// Export all extraction functions
export {
  extractSPYPrice,
  extractGoldPrice,
  extractBitcoinPrice,
  extractPowerballJackpot,
  extractMortgageRate,
};
