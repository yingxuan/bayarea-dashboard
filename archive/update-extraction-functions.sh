#!/bin/bash
# This script documents the pattern for updating all extraction functions
# We need to manually update extractGoldPrice, extractBitcoinPrice, etc.
# to return { price/value: number | null, method: string }

echo "Pattern to apply to all extraction functions:"
echo "1. Change return type from 'number | null' to '{ price: number | null, method: string }'"
echo "2. Update all return statements to return { price: X, method: 'pattern_name' }"
echo "3. Update fetch functions to destructure { price, method } and add debug fields"
echo ""
echo "Functions to update:"
echo "- extractGoldPrice"
echo "- extractBitcoinPrice"
echo "- extractPowerballJackpot (returns amount, not price)"
echo "- extractMortgageRate (returns rate, not price)"
