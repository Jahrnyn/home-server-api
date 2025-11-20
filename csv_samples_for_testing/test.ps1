# 1) CSV beolvasása "sima stringként"
$csv = [System.IO.File]::ReadAllText("$PWD\csv_samples_for_testing\test6.csv")

# 2) JSON body objektum összerakása
$bodyObj = [pscustomobject]@{
    csv       = $csv
    delimiter = ","
    hasHeader = $true
}

# 3) JSON-é alakítás
$bodyJson = $bodyObj | ConvertTo-Json -Depth 5

# 4) HTTP hívás
$result = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3000/api/csv/clean" `
  -ContentType "application/json" `
  -Body $bodyJson

# 5) Debug kiírás
"=== AI REVIEW ==="
$result.aiReview | Format-List *
"=== STATS ==="
$result.stats | Format-List *
"=== CLEANED CSV ==="
$result.cleanedCsv
