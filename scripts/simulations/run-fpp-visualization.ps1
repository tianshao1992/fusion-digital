#Requires -Version 5.1
[CmdletBinding()]
param([string]$FuseWorkspace = 'D:\Code\Fuse')
$ErrorActionPreference = 'Stop'
$fuseRoot = (Resolve-Path -LiteralPath $FuseWorkspace).Path
& (Join-Path $fuseRoot 'scripts\verify-baseline.ps1')
$runId = 'fuse-fpp-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$resultDir = Join-Path $fuseRoot ('results\' + $runId)
if (Test-Path -LiteralPath $resultDir) { throw 'Refusing to overwrite a run' }
New-Item -ItemType Directory -Path $resultDir | Out-Null
$env:FUSE_WORKSPACE = $fuseRoot
$env:FUSE_DEMO_OUTPUT_DIR = $resultDir
$env:FUSE_RUN_ID = $runId
$env:FUSE_SOURCE_COMMIT = (& git -C (Join-Path $fuseRoot 'FUSE.jl') rev-parse HEAD).Trim()
$env:FUSE_EXAMPLES_COMMIT = (& git -C (Join-Path $fuseRoot 'FuseExamples') rev-parse HEAD).Trim()
$env:JULIA_DEPOT_PATH = Join-Path $fuseRoot '.julia-depot'
$env:JULIA_NUM_THREADS = '8'
$env:GKSwstype = '100'
$juliaPath = Join-Path $fuseRoot '.tools\julia-1.12.7\bin\julia.exe'
$environmentDir = Join-Path $fuseRoot 'environment'
$driverPath = Join-Path $resultDir 'run-fpp-visualization.jl'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'run-fpp-visualization.jl') -Destination $driverPath
& $juliaPath --startup-file=no "--project=$environmentDir" $driverPath 2>&1 | Tee-Object -FilePath (Join-Path $resultDir 'run.log')
if ($LASTEXITCODE -ne 0) { throw "FUSE run failed; evidence retained in $resultDir" }
if (-not (Test-Path -LiteralPath (Join-Path $resultDir 'run-manifest.json'))) { throw 'Result manifest missing' }
Write-Host "Visualization result completed: $resultDir"
