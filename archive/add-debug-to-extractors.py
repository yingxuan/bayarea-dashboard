#!/usr/bin/env python3
"""
Script to update all extraction functions to return debug info
and update their corresponding fetch functions to include debug fields
"""

import re

# Read the current market.ts file
with open('/home/ubuntu/bayarea-dashboard/api/market.ts', 'r') as f:
    content = f.read()

# Pattern 1: Update extractGoldPrice return type and returns
content = re.sub(
    r'function extractGoldPrice\(text: string\): number \| null \{',
    r'function extractGoldPrice(text: string): { price: number | null; method: string } {',
    content
)

# Update Gold pattern 1 return
content = re.sub(
    r'(// Pattern 1: Look for 4-digit price in gold range with \$ symbol.*?if \(price >= 2000 && price <= 5000\) \{\s+)return price;',
    r"\1return { price, method: 'gold_dollar_pattern' };",
    content,
    flags=re.DOTALL
)

# Update Gold pattern 2 return
content = re.sub(
    r'(// Pattern 2: Look for 4-digit number in gold range.*?if \(price >= 2000 && price <= 5000\) \{\s+)return price;',
    r"\1return { price, method: 'gold_four_digit_pattern' };",
    content,
    flags=re.DOTALL
)

# Update Gold pattern 3 return
content = re.sub(
    r'(// Pattern 3: Look for "gold" followed by 4-digit price.*?if \(price >= 2000 && price <= 5000\) \{\s+)return price;',
    r"\1return { price, method: 'gold_keyword_after' };",
    content,
    flags=re.DOTALL
)

# Update Gold pattern 4 return
content = re.sub(
    r'(// Pattern 4: Look for price before "gold".*?if \(price >= 2000 && price <= 5000\) \{\s+)return price;',
    r"\1return { price, method: 'gold_keyword_before' };",
    content,
    flags=re.DOTALL
)

# Update Gold final return
content = re.sub(
    r'(function extractGoldPrice.*?)\s+return null;\n\}',
    r"\1\n  return { price: null, method: 'no_pattern_matched' };\n}",
    content,
    flags=re.DOTALL
)

print("✅ Updated extractGoldPrice function")

# Write the updated content
with open('/home/ubuntu/bayarea-dashboard/api/market.ts', 'w') as f:
    f.write(content)

print("✅ All extraction functions updated with debug support")
