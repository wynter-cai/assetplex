# Asset distribution API check via Invoke-WebRequest (status codes + body previews)
$ErrorActionPreference = 'Continue'
$base = 'http://127.0.0.1:17521/api'

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

Show 'GET /distributions/tools' { Invoke-WebRequest -Uri "$base/distributions/tools" -UseBasicParsing }
Show 'POST /remediations/rollback (missing id)' { Invoke-WebRequest -Uri "$base/remediations/rollback" -Method Post -Body '{}' -ContentType 'application/json' -UseBasicParsing }
Show 'POST /remediations/rollback (unknown id)' { Invoke-WebRequest -Uri "$base/remediations/rollback" -Method Post -Body '{"swapId":"not-exist"}' -ContentType 'application/json' -UseBasicParsing }
