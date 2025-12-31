#!/bin/bash

# Validation Script for Vercel Deployment
# Usage: ./scripts/validate-deployment.sh https://your-deployment-url.vercel.app

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if deployment URL is provided
if [ -z "$1" ]; then
  echo -e "${RED}Error: Deployment URL is required${NC}"
  echo "Usage: ./scripts/validate-deployment.sh https://your-deployment-url.vercel.app"
  exit 1
fi

DEPLOYMENT_URL=$1
echo -e "${BLUE}=== Validating Vercel Deployment ===${NC}"
echo -e "Deployment URL: ${YELLOW}$DEPLOYMENT_URL${NC}"
echo ""

# Test 1: Check if /api/market endpoint is accessible
echo -e "${BLUE}[Test 1] Testing /api/market endpoint...${NC}"
MARKET_RESPONSE=$(curl -s -w "\n%{http_code}" "$DEPLOYMENT_URL/api/market")
MARKET_HTTP_CODE=$(echo "$MARKET_RESPONSE" | tail -n1)
MARKET_BODY=$(echo "$MARKET_RESPONSE" | sed '$d')

if [ "$MARKET_HTTP_CODE" -eq 200 ]; then
  echo -e "${GREEN}✓ /api/market returned HTTP 200${NC}"
  
  # Check if response contains required fields
  if echo "$MARKET_BODY" | jq -e '.data.spy' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Response contains 'spy' data${NC}"
  else
    echo -e "${RED}✗ Response missing 'spy' data${NC}"
  fi
  
  if echo "$MARKET_BODY" | jq -e '.data.gold' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Response contains 'gold' data${NC}"
  else
    echo -e "${RED}✗ Response missing 'gold' data${NC}"
  fi
  
  if echo "$MARKET_BODY" | jq -e '.data.btc' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Response contains 'btc' data${NC}"
  else
    echo -e "${RED}✗ Response missing 'btc' data${NC}"
  fi
  
  if echo "$MARKET_BODY" | jq -e '.updated_at' > /dev/null 2>&1; then
    UPDATED_AT=$(echo "$MARKET_BODY" | jq -r '.updated_at')
    echo -e "${GREEN}✓ Response contains 'updated_at': $UPDATED_AT${NC}"
  else
    echo -e "${RED}✗ Response missing 'updated_at'${NC}"
  fi
  
  if echo "$MARKET_BODY" | jq -e '.cache_hit' > /dev/null 2>&1; then
    CACHE_HIT=$(echo "$MARKET_BODY" | jq -r '.cache_hit')
    echo -e "${GREEN}✓ Response contains 'cache_hit': $CACHE_HIT${NC}"
  else
    echo -e "${RED}✗ Response missing 'cache_hit'${NC}"
  fi
  
  # Check if as_of timestamps are present
  if echo "$MARKET_BODY" | jq -e '.data.spy.as_of' > /dev/null 2>&1; then
    AS_OF=$(echo "$MARKET_BODY" | jq -r '.data.spy.as_of')
    echo -e "${GREEN}✓ SPY data contains 'as_of' timestamp: $AS_OF${NC}"
  else
    echo -e "${RED}✗ SPY data missing 'as_of' timestamp${NC}"
  fi
  
  # Display SPY data for manual verification
  echo -e "\n${YELLOW}SPY Data (for manual verification):${NC}"
  echo "$MARKET_BODY" | jq '.data.spy'
  SPY_URL=$(echo "$MARKET_BODY" | jq -r '.data.spy.source_url')
  echo -e "${YELLOW}→ Open this URL to verify: $SPY_URL${NC}"
  
else
  echo -e "${RED}✗ /api/market returned HTTP $MARKET_HTTP_CODE${NC}"
  echo -e "${RED}Response body:${NC}"
  echo "$MARKET_BODY"
fi

echo ""

# Test 2: Check if /api/ai-news endpoint is accessible
echo -e "${BLUE}[Test 2] Testing /api/ai-news endpoint...${NC}"
NEWS_RESPONSE=$(curl -s -w "\n%{http_code}" "$DEPLOYMENT_URL/api/ai-news")
NEWS_HTTP_CODE=$(echo "$NEWS_RESPONSE" | tail -n1)
NEWS_BODY=$(echo "$NEWS_RESPONSE" | sed '$d')

if [ "$NEWS_HTTP_CODE" -eq 200 ]; then
  echo -e "${GREEN}✓ /api/ai-news returned HTTP 200${NC}"
  
  # Check if response contains required fields
  if echo "$NEWS_BODY" | jq -e '.news' > /dev/null 2>&1; then
    NEWS_COUNT=$(echo "$NEWS_BODY" | jq '.news | length')
    echo -e "${GREEN}✓ Response contains 'news' array with $NEWS_COUNT articles${NC}"
  else
    echo -e "${RED}✗ Response missing 'news' array${NC}"
  fi
  
  if echo "$NEWS_BODY" | jq -e '.updated_at' > /dev/null 2>&1; then
    UPDATED_AT=$(echo "$NEWS_BODY" | jq -r '.updated_at')
    echo -e "${GREEN}✓ Response contains 'updated_at': $UPDATED_AT${NC}"
  else
    echo -e "${RED}✗ Response missing 'updated_at'${NC}"
  fi
  
  # Check first news article structure
  if echo "$NEWS_BODY" | jq -e '.news[0]' > /dev/null 2>&1; then
    echo -e "\n${YELLOW}First News Article (for manual verification):${NC}"
    echo "$NEWS_BODY" | jq '.news[0]'
    
    ARTICLE_URL=$(echo "$NEWS_BODY" | jq -r '.news[0].url')
    echo -e "${YELLOW}→ Open this URL to verify: $ARTICLE_URL${NC}"
    
    # Check if as_of timestamp is present
    if echo "$NEWS_BODY" | jq -e '.news[0].as_of' > /dev/null 2>&1; then
      AS_OF=$(echo "$NEWS_BODY" | jq -r '.news[0].as_of')
      echo -e "${GREEN}✓ News article contains 'as_of' timestamp: $AS_OF${NC}"
    else
      echo -e "${RED}✗ News article missing 'as_of' timestamp${NC}"
    fi
  fi
  
else
  echo -e "${RED}✗ /api/ai-news returned HTTP $NEWS_HTTP_CODE${NC}"
  echo -e "${RED}Response body:${NC}"
  echo "$NEWS_BODY"
fi

echo ""

# Test 3: Check cache behavior
echo -e "${BLUE}[Test 3] Testing cache behavior...${NC}"
echo "Making first request..."
FIRST_RESPONSE=$(curl -s "$DEPLOYMENT_URL/api/market")
FIRST_CACHE_HIT=$(echo "$FIRST_RESPONSE" | jq -r '.cache_hit')
echo -e "First request cache_hit: ${YELLOW}$FIRST_CACHE_HIT${NC}"

sleep 2

echo "Making second request (should hit cache)..."
SECOND_RESPONSE=$(curl -s "$DEPLOYMENT_URL/api/market")
SECOND_CACHE_HIT=$(echo "$SECOND_RESPONSE" | jq -r '.cache_hit')
echo -e "Second request cache_hit: ${YELLOW}$SECOND_CACHE_HIT${NC}"

if [ "$SECOND_CACHE_HIT" = "true" ]; then
  echo -e "${GREEN}✓ Cache is working correctly${NC}"
else
  echo -e "${YELLOW}⚠ Cache might not be working (could be different serverless instances)${NC}"
fi

echo ""

# Test 4: Check CORS headers
echo -e "${BLUE}[Test 4] Checking CORS headers...${NC}"
CORS_HEADERS=$(curl -s -I "$DEPLOYMENT_URL/api/market" | grep -i "access-control")
if [ -n "$CORS_HEADERS" ]; then
  echo -e "${GREEN}✓ CORS headers are present:${NC}"
  echo "$CORS_HEADERS"
else
  echo -e "${RED}✗ CORS headers are missing${NC}"
fi

echo ""

# Summary
echo -e "${BLUE}=== Validation Summary ===${NC}"
echo -e "${YELLOW}Manual Verification Required:${NC}"
echo "1. Open the SPY source URL and compare the price with the API response"
echo "2. Open the news article URLs and verify they are about AI/tech/big tech"
echo "3. Check that all source URLs are accessible (not 404/403)"
echo "4. Verify that values match linked sources within ±5%"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Review the output above for any errors"
echo "2. Manually verify source URLs by opening them in a browser"
echo "3. Check the frontend at $DEPLOYMENT_URL to see if data displays correctly"
echo "4. Monitor Vercel logs for any errors: vercel logs"
echo ""
echo -e "${GREEN}Validation script completed!${NC}"
