# PowerShell script to test bubble tea debug endpoint
# Usage: .\scripts\test-bubble-tea-debug.ps1 [local|prod]

param(
    [string]$env = "local"
)

$baseUrl = if ($env -eq "prod") {
    "https://bayarea-dashboard.vercel.app"
} else {
    "http://localhost:3000"
}

$url = "$baseUrl/api/spend/today?debug=1&nocache=1"

Write-Host "Fetching: $url" -ForegroundColor Cyan
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    
    if ($json.bubbleTeaDebug) {
        Write-Host "=== Bubble Tea Debug Snapshot ===" -ForegroundColor Green
        Write-Host ""
        
        # Request Plan
        Write-Host "Request Plan:" -ForegroundColor Yellow
        $json.bubbleTeaDebug.requestPlan | ConvertTo-Json -Depth 10
        Write-Host ""
        
        # Per Query Results
        Write-Host "Per Query Results:" -ForegroundColor Yellow
        $json.bubbleTeaDebug.perQuery | ForEach-Object {
            Write-Host "  City: $($_.city), Keyword: $($_.keyword)" -ForegroundColor Cyan
            Write-Host "    HTTP Status: $($_.httpStatus), Raw Count: $($_.rawPlacesCount)" -ForegroundColor White
            if ($_.top5Names) {
                Write-Host "    Top 5 Names: $($_.top5Names -join ', ')" -ForegroundColor Gray
            }
        }
        Write-Host ""
        
        # Pipeline Counts
        Write-Host "Pipeline Counts:" -ForegroundColor Yellow
        $counts = $json.bubbleTeaDebug.pipelineCounts
        Write-Host "  mergedRawCount: $($counts.mergedRawCount)" -ForegroundColor White
        Write-Host "  dedupByPlaceIdCount: $($counts.dedupByPlaceIdCount)" -ForegroundColor White
        Write-Host "  afterDistanceCount: $($counts.afterDistanceCount)" -ForegroundColor White
        Write-Host "  afterTypeHeuristicCount: $($counts.afterTypeHeuristicCount)" -ForegroundColor White
        Write-Host "  afterQualityCount: $($counts.afterQualityCount)" -ForegroundColor White
        Write-Host "  finalPoolCount: $($counts.finalPoolCount)" -ForegroundColor White
        Write-Host "  finalDisplayedCount: $($counts.finalDisplayedCount)" -ForegroundColor $(if ($counts.finalDisplayedCount -ge 3) { "Green" } else { "Red" })
        Write-Host ""
        
        # Drop Reasons
        Write-Host "Drop Reasons:" -ForegroundColor Yellow
        $drops = $json.bubbleTeaDebug.dropReasons
        Write-Host "  drop_dedup: $($drops.drop_dedup)" -ForegroundColor White
        Write-Host "  drop_distance: $($drops.drop_distance)" -ForegroundColor White
        Write-Host "  drop_missingFields: $($drops.drop_missingFields)" -ForegroundColor White
        Write-Host "  drop_notBobaHeuristic: $($drops.drop_notBobaHeuristic)" -ForegroundColor White
        Write-Host "  drop_ratingTooLow: $($drops.drop_ratingTooLow)" -ForegroundColor White
        Write-Host "  drop_other: $($drops.drop_other)" -ForegroundColor White
        Write-Host ""
        
        # Case Diagnosis
        Write-Host "=== Case Diagnosis ===" -ForegroundColor Magenta
        $mergedRaw = $counts.mergedRawCount
        $dedup = $counts.dedupByPlaceIdCount
        $finalPool = $counts.finalPoolCount
        $displayed = $counts.finalDisplayedCount
        
        if ($mergedRaw -lt 5) {
            Write-Host "🔴 Case A: Query Strategy Issue" -ForegroundColor Red
            Write-Host "   Low raw results ($mergedRaw). Check endpoint, keywords, radius, center coordinates." -ForegroundColor Yellow
        } elseif ($mergedRaw -gt 10 -and $dedup -lt 3) {
            Write-Host "🟡 Case B: Deduplication Collapse" -ForegroundColor Yellow
            Write-Host "   High raw ($mergedRaw) but dedup drops to $dedup. Too many overlapping keyword calls." -ForegroundColor Yellow
        } elseif ($dedup -gt 5 -and $finalPool -lt 3) {
            Write-Host "🟠 Case C: Filter Thresholds Issue" -ForegroundColor DarkYellow
            Write-Host "   Good dedup ($dedup) but filters drop to $finalPool. Check distance/type/quality filters." -ForegroundColor Yellow
        } elseif ($finalPool -ge 3 -and $displayed -eq 1) {
            Write-Host "🔵 Case D: Selection/UI Bug" -ForegroundColor Blue
            Write-Host "   Pool has $finalPool items but only $displayed displayed. Check selection/rotation logic." -ForegroundColor Yellow
        } else {
            Write-Host "✅ No obvious issue detected. Check detailed counts above." -ForegroundColor Green
        }
        Write-Host ""
        
        # Samples
        if ($json.bubbleTeaDebug.samples.finalPoolTop10) {
            Write-Host "Final Pool Top 10:" -ForegroundColor Yellow
            $json.bubbleTeaDebug.samples.finalPoolTop10 | ForEach-Object {
                Write-Host "  - $($_.name) (Rating: $($_.rating), Reviews: $($_.userRatingCount))" -ForegroundColor Gray
            }
            Write-Host ""
        }
        
        if ($json.bubbleTeaDebug.samples.displayed) {
            Write-Host "Displayed Items:" -ForegroundColor Yellow
            $json.bubbleTeaDebug.samples.displayed | ForEach-Object {
                Write-Host "  - $($_.name)" -ForegroundColor Gray
            }
        }
        
        # Full JSON output (optional)
        Write-Host ""
        Write-Host "=== Full JSON (bubbleTeaDebug) ===" -ForegroundColor Green
        $json.bubbleTeaDebug | ConvertTo-Json -Depth 10
    } else {
        Write-Host "No bubbleTeaDebug field found in response" -ForegroundColor Red
        Write-Host "Response keys: $($json.PSObject.Properties.Name -join ', ')" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "Response: $($_.Exception.Response)" -ForegroundColor Yellow
}
