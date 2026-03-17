$ErrorActionPreference = "Continue"
$BASE_URL = "http://localhost:3000/api/integrations/tradingview/webhook"
$TOKEN = "test-webhook-token-123"
$SHARED_SECRET = "test-shared-secret-abc"

# Helper to make a fresh payload with unique triggered_at to avoid deduplication
function Get-Payload($triggeredAt) {
  @{
    alert_name         = "MA25 breakout"
    alert_type         = "technical"
    tradingview_symbol = "TSE:7203"
    timeframe          = "D"
    triggered_at       = $triggeredAt
    trigger_price      = 3000
  } | ConvertTo-Json -Depth 5
}

# =============================================
# Auth / shared_secret テスト群
# =============================================

Write-Host "=== Auth & shared_secret Tests ==="

Write-Host "`n--- Test 1: token 正常 + shared_secret なし ---"
$response1 = Invoke-RestMethod -Uri "$BASE_URL`?token=$TOKEN" -Method Post -ContentType "application/json" `
  -Body (Get-Payload "2026-03-20T00:01:00Z")
$response1 | ConvertTo-Json
Write-Host "[EXPECT] status=received, ai_job_id not null"

Write-Host "`n--- Test 2: token 正常 + shared_secret 正常 ---"
$body2 = @{
    alert_name         = "MA25 breakout"
    alert_type         = "technical"
    tradingview_symbol = "TSE:7203"
    timeframe          = "D"
    triggered_at       = "2026-03-20T00:02:00Z"
    trigger_price      = 3000
    shared_secret      = $SHARED_SECRET
} | ConvertTo-Json -Depth 5
$response2 = Invoke-RestMethod -Uri "$BASE_URL`?token=$TOKEN" -Method Post -ContentType "application/json" -Body $body2
$response2 | ConvertTo-Json
Write-Host "[EXPECT] status=received, ai_job_id not null"

Write-Host "`n--- Test 3: token 正常 + shared_secret 不正 ---"
$body3 = @{
    alert_name         = "MA25 breakout"
    alert_type         = "technical"
    tradingview_symbol = "TSE:7203"
    timeframe          = "D"
    triggered_at       = "2026-03-20T00:03:00Z"
    shared_secret      = "WRONG-SECRET"
} | ConvertTo-Json -Depth 5
try {
  Invoke-RestMethod -Uri "$BASE_URL`?token=$TOKEN" -Method Post -ContentType "application/json" -Body $body3
} catch {
  Write-Host "HTTP Status: $($_.Exception.Response.StatusCode.Value__)"
  $reader = new-object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  $reader.ReadToEnd()
}
Write-Host "[EXPECT] 401 shared_secret mismatch"

Write-Host "`n--- Test 4: token 不正 ---"
try {
  Invoke-RestMethod -Uri "$BASE_URL`?token=INVALID_TOKEN" -Method Post -ContentType "application/json" `
    -Body (Get-Payload "2026-03-20T00:04:00Z")
} catch {
  Write-Host "HTTP Status: $($_.Exception.Response.StatusCode.Value__)"
  $reader = new-object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  $reader.ReadToEnd()
}
Write-Host "[EXPECT] 401 invalid token"

# =============================================
# 既存 E2E テスト群
# =============================================

Write-Host "`n=== Existing E2E Tests ==="

Write-Host "`n--- Test 5: 重複イベント（べき等性） ---"
$response5 = Invoke-RestMethod -Uri "$BASE_URL`?token=$TOKEN" -Method Post -ContentType "application/json" `
  -Body (Get-Payload "2026-03-20T00:01:00Z")
$response5 | ConvertTo-Json
Write-Host "[EXPECT] status=duplicate_ignored"

Write-Host "`n--- Test 6: Payload 不正（必須フィールド欠損）---"
try {
  Invoke-RestMethod -Uri "$BASE_URL`?token=$TOKEN" -Method Post -ContentType "application/json" `
    -Body (@{ alert_type = "technical" } | ConvertTo-Json)
} catch {
  Write-Host "HTTP Status: $($_.Exception.Response.StatusCode.Value__)"
  $reader = new-object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  $reader.ReadToEnd()
}
Write-Host "[EXPECT] 400"

Write-Host "`n--- Test 7: Unresolved Symbol (no ai_job expected) ---"
$body7 = @{
    alert_name         = "MA25 breakout"
    alert_type         = "technical"
    tradingview_symbol = "FAKE:9999"
    timeframe          = "D"
    triggered_at       = "2026-03-20T00:07:00Z"
} | ConvertTo-Json -Depth 5
$response7 = Invoke-RestMethod -Uri "$BASE_URL`?token=$TOKEN" -Method Post -ContentType "application/json" -Body $body7
$response7 | ConvertTo-Json
Write-Host "[EXPECT] status=unresolved_symbol, ai_job_id=null"

Write-Host "`n--- Test 8: 純プレーンテキスト (no ai_job expected) ---"
$payload8 = "BUY Alert for TSE:7203 at price 3000 on " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$response8 = Invoke-RestMethod -Uri "$BASE_URL`?token=$TOKEN" -Method Post -ContentType "text/plain" -Body $payload8
$response8 | ConvertTo-Json
Write-Host "[EXPECT] status=needs_review, ai_job_id=null"
