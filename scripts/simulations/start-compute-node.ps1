param(
  [ValidateRange(1024,65535)][int]$Port = 8792,
  [string]$ToraxWorkspace = 'D:\Code\Torax',
  [string]$FuseWorkspace = 'D:\Code\Fuse',
  [string[]]$Origins = @('http://localhost:3012', 'http://localhost:5177', 'https://fusiondigital.club', 'https://www.fusiondigital.club', 'https://fusion-physics-atlas-2026.tianyuanliu1992.chatgpt.site'),
  [switch]$CopyToken
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Use the documented environment-based gateway entrypoint on Linux.' }
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$node = (Get-Command node -ErrorAction Stop).Source
$state = Join-Path $projectRoot "work/compute-node-$Port"
[IO.Directory]::CreateDirectory($state) | Out-Null
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
$tokenFile = Join-Path $state 'access-token.dpapi'
if (-not (Test-Path -LiteralPath $tokenFile)) {
  $random = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  $encrypted = [Security.Cryptography.ProtectedData]::Protect($random, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes($tokenFile, $encrypted)
}
$plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($tokenFile), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
$token = [Convert]::ToHexString($plain).ToLowerInvariant()
[Array]::Clear($plain)
$headers = @{ Authorization = "Bearer $token"; Origin = $Origins[0] }
$base = "http://127.0.0.1:$Port"
try { $health = Invoke-RestMethod -Uri "$base/v1/catalog" -Headers $headers -TimeoutSec 3 } catch { $health = $null }
if ($health.schema -ne 'engine-catalog.v1') {
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is occupied by another service. It was not changed." }
  if (-not (Test-Path -LiteralPath (Join-Path $ToraxWorkspace '.venv-wsl/bin/python'))) { throw 'Pinned TORAX WSL environment is missing.' }
  $env:GATEWAY_TOKEN = $token
  $env:GATEWAY_ORIGINS = $Origins -join ','
  $env:GATEWAY_PORT = "$Port"
  $env:TORAX_WORKSPACE = $ToraxWorkspace
  $env:FUSE_WORKSPACE = $FuseWorkspace
  try {
    $process = Start-Process -FilePath $node -ArgumentList @('--import', 'tsx', 'scripts/simulations/gateway.mts') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $state 'gateway.stdout.log') -RedirectStandardError (Join-Path $state 'gateway.stderr.log')
    [IO.File]::WriteAllText((Join-Path $state 'node.json'), (@{ pid = $process.Id; endpoint = $base; startedUtc = [DateTime]::UtcNow.ToString('o'); project = $projectRoot } | ConvertTo-Json))
  } finally { Remove-Item Env:GATEWAY_TOKEN }
  $health = $null
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try { $health = Invoke-RestMethod -Uri "$base/v1/catalog" -Headers $headers -TimeoutSec 2; break } catch { if ($process.HasExited) { throw 'Compute gateway exited. Inspect the local gateway log.' } }
  }
  if ($health.schema -ne 'engine-catalog.v1') { throw 'Compute gateway did not become ready.' }
}
if ($CopyToken) { Set-Clipboard -Value $token; Write-Output 'Access token copied to clipboard. Paste into the compute-node token field.' }
$token = $null; $headers.Clear()
Write-Output "Compute node ready: $base"
Write-Output 'Engine processes run on this computer. Closing the browser does not cancel a job.'
Write-Output 'Token is protected with Windows DPAPI for the current user; it is never printed.'
