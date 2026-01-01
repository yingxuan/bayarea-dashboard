# Localhost Troubleshooting Guide

## Current Status

✅ **Server IS running** on port 3001
- Process ID: 2856
- Port status: LISTENING
- Connection test: ✅ Port is reachable

## Verification

### Server Status
```powershell
# Check if server is running
netstat -ano | findstr ":3001"
# Result: Port 3001 is LISTENING ✅

# Test connection
Test-NetConnection -ComputerName localhost -Port 3001
# Result: True ✅
```

### API Endpoint Test
```powershell
# Test market API
curl.exe "http://localhost:3001/api/market?nocache=1"
# Result: Returns JSON data ✅
```

## Common Issues & Solutions

### Issue 1: Browser Can't Connect
**Symptom**: Browser shows "This site can't be reached" or "ERR_CONNECTION_REFUSED"

**Solutions**:
1. **Check URL**: Use `http://localhost:3001` (not `https://`)
2. **Try 127.0.0.1**: Use `http://127.0.0.1:3001` instead
3. **Check firewall**: Windows Firewall might be blocking
4. **Check browser**: Try different browser or incognito mode

### Issue 2: Port Already in Use
**Symptom**: Server fails to start with "EADDRINUSE" error

**Solution**:
```powershell
# Find process using port 3001
netstat -ano | findstr ":3001"

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Or use different port
$env:PORT=3002; pnpm dev:server
```

### Issue 3: Server Not Starting
**Symptom**: `pnpm dev:server` exits immediately or shows errors

**Solutions**:
1. **Check dependencies**:
   ```powershell
   pnpm install
   ```

2. **Check for errors in output**:
   ```powershell
   pnpm dev:server
   # Look for error messages
   ```

3. **Check environment variables**:
   ```powershell
   # NEWS_API_KEY is optional for basic testing
   # Server should start without it
   ```

### Issue 4: API Returns Empty/Errors
**Symptom**: Server runs but API returns errors

**Solutions**:
1. **Check server logs**: Look for error messages in terminal
2. **Test with curl**: `curl.exe "http://localhost:3001/api/market?nocache=1"`
3. **Check environment variables**: Some APIs require keys

## Quick Diagnostic Commands

```powershell
# 1. Check if server is running
Get-Process | Where-Object {$_.ProcessName -like "*node*" -or $_.ProcessName -like "*tsx*"}

# 2. Check port status
netstat -ano | findstr ":3001"

# 3. Test connection
Test-NetConnection -ComputerName localhost -Port 3001

# 4. Test API endpoint
curl.exe "http://localhost:3001/api/market?nocache=1"

# 5. Test with 127.0.0.1 (alternative)
curl.exe "http://127.0.0.1:3001/api/market?nocache=1"
```

## Starting the Server

### Method 1: With Environment Variables
```powershell
# Set NEWS_API_KEY (optional)
$env:NEWS_API_KEY="69a5980d447347be889e36323c222d9e"

# Start server
pnpm dev:server
```

### Method 2: Without Environment Variables
```powershell
# Server will start but some endpoints may return empty
pnpm dev:server
```

### Method 3: Different Port
```powershell
# Use port 3002 if 3001 is busy
$env:PORT=3002; pnpm dev:server
```

## Expected Behavior

### Server Startup
```
Server running on http://localhost:3001/
```

### API Response
```json
{
  "data": { ... },
  "fetched_at": "2026-01-01T...",
  "cache_hit": false
}
```

## If Still Not Working

1. **Check Windows Firewall**:
   - Windows Security → Firewall & network protection
   - Allow Node.js through firewall if prompted

2. **Check Antivirus**:
   - Some antivirus software blocks localhost connections
   - Add exception for Node.js/tsx

3. **Check Proxy Settings**:
   - If using corporate proxy, it might block localhost
   - Try bypassing proxy for localhost

4. **Restart Server**:
   ```powershell
   # Kill all node processes
   Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force
   
   # Start fresh
   pnpm dev:server
   ```

## Current Server Status

Based on diagnostics:
- ✅ Port 3001 is LISTENING
- ✅ Connection test passes
- ✅ API endpoint responds with data
- ✅ Server process is running (PID 2856)

**The server IS reachable**. If you're having issues accessing it, it's likely:
- Browser configuration
- Firewall blocking browser
- Using wrong URL (https instead of http, wrong port, etc.)
