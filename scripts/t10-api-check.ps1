# T10 API check via Invoke-WebRequest (status codes + body previews)
$ErrorActionPreference = 'Continue'
$base = 'http://127.0.0.1:17521/api/swap'

function Show($label, $block) {
  try {
    $r = & $block
    $body = $r.Content
    if ($body.Length -gt 160) { $body = $body.Substring(0,160) + '...' }
    Write-Output ("[$label] HTTP " + $r.StatusCode + " :: " + $body)
  } catch {
    $resp = $_.Exception.Response
    if ($resp -ne $null) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $text = $reader.ReadToEnd()
      if ($text.Length -gt 160) { $text = $text.Substring(0,160) + '...' }
      Write-Output ("[$label] HTTP " + [int]$resp.StatusCode + " :: " + $text)
    } else {
      Write-Output ("[$label] ERROR :: " + $_.Exception.Message)
    }
  }
}

Show 'GET /tools' { Invoke-WebRequest -Uri "$base/tools" -UseBasicParsing }
Show 'POST /preview (no body)' { Invoke-WebRequest -Uri "$base/preview" -Method Post -Body '{}' -ContentType 'application/json' -UseBasicParsing }
Show 'POST /preview (unknown tool)' { Invoke-WebRequest -Uri "$base/preview" -Method Post -Body '{"tool":"nope-tool"}' -ContentType 'application/json' -UseBasicParsing }
Show 'POST /preview (workbuddy)' { Invoke-WebRequest -Uri "$base/preview" -Method Post -Body '{"tool":"workbuddy"}' -ContentType 'application/json' -UseBasicParsing }
Show 'POST /execute (stale token)' { Invoke-WebRequest -Uri "$base/execute" -Method Post -Body '{"tool":"workbuddy","previewGeneratedAt":"2000-01-01T00:00:00.000Z","overwriteDecisions":[]}' -ContentType 'application/json' -UseBasicParsing }
Show 'POST /rollback (missing id)' { Invoke-WebRequest -Uri "$base/rollback" -Method Post -Body '{}' -ContentType 'application/json' -UseBasicParsing }
Show 'POST /rollback (unknown id)' { Invoke-WebRequest -Uri "$base/rollback" -Method Post -Body '{"swapId":"not-exist"}' -ContentType 'application/json' -UseBasicParsing }
Show 'GET /history' { Invoke-WebRequest -Uri "$base/history" -UseBasicParsing }
