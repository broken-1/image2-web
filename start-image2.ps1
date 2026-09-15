$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8765
$url = "http://localhost:$port/"

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1
  if ($response.StatusCode -eq 200) {
    exit 0
  }
} catch {
  # No running instance yet.
}

$python = Get-Command py -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command python -ErrorAction SilentlyContinue }
if (-not $python) {
  Write-Host ''
  Write-Host '[ERROR] Python was not found.' -ForegroundColor Red
  Write-Host 'Install Python 3 from https://www.python.org/downloads/windows/ and enable Add Python to PATH.'
  exit 1
}

Write-Host "image2 studio started: $url"
Write-Host 'Close this window to stop the server.'
& $python.Source -m http.server $port --directory $root
