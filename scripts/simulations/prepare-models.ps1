#Requires -Version 5.1
[CmdletBinding()]
param([string]$Workspace = 'D:\Code\Fuse')

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Workspace).Path
$PackageRoot = Join-Path $Root 'deps\TurbulentTransport.jl'
$ModelRoot = Join-Path $PackageRoot 'models'
$BaseUrl = 'https://media.githubusercontent.com/media/ProjectTorreyPines/TurbulentTransport.jl/v1.2.17/models'

if (-not (Test-Path -LiteralPath (Join-Path $PackageRoot 'Project.toml'))) {
    throw "TurbulentTransport package is missing: $PackageRoot"
}

$Models = @(
    @{ Path = 'sat1_em_d3d.bson'; Sha256 = 'eabf4b0133b7b6312f17a01abb1208b0f2b7661746f71843ea80e3fdc43a9fd1'; Size = 3473903 },
    @{ Path = 'sat3_em_d3d_azf-1_withnegD.bson'; Sha256 = '721e49ffd8d9455fb70c0da0c08b71fa0d59a38caa3584715e73e58f420e155f'; Size = 3473903 },
    @{ Path = 'sat3_em_d3dnearedge_azf-1_withnegD.bson'; Sha256 = 'f8ffe3f99bab876245fa17ad6300c476c1bd77da3068c1e1ddb8d4137687580a'; Size = 3474063 },
    @{ Path = 'sat3_em_d3dedge_azf-1_withnegD.bson'; Sha256 = '74ff4faca32221d7356c8ebc63cd4d4fd40ac144a549db1e8b13cfa2c30a2e12'; Size = 3473983 },
    @{ Path = 'sat3_em_d3d_azf-1_withnegD_gknn31.bson'; Sha256 = 'f0f8bd7d0c99d8c863b23acdbeb683898749d27d40e0f90f48f940598359ae83'; Size = 5617183 },
    @{ Path = 'sat3_em_d3d_azf-1_withnegD_gknn37.bson'; Sha256 = 'a889be299003bad27cb8d2ca0858268fb1006458a1962dc1573de158ad2a4c3c'; Size = 5616543 },
    @{ Path = 'QLNN\energy_regressor.bson'; Sha256 = 'e8dfe8584c9943f5c6e3baf16a9b4a39d9574500f5d3292f044f22b10e197377'; Size = 6936803 },
    @{ Path = 'QLNN\particle_regressor.bson'; Sha256 = 'b437dd549739f944fe7c3c6ab829a8ca120361bd457b6dfca0ddee1ed6aabe9b'; Size = 6937243 },
    @{ Path = 'QLNN\momentum_regressor.bson'; Sha256 = '1bdc6a915bd4a28f5b10c789a641829a74cdef243f7fca5578d6a0de62988eb0'; Size = 6937243 },
    @{ Path = 'QLNN\eigenvalue_regressor.bson'; Sha256 = '90dde3e430157bf44b08ee78bb8c038aac675289818eeacc17028516deebf61d'; Size = 6894963 },
    @{ Path = 'QLNN\stability_classifier.bson'; Sha256 = '5f4f447185ef43c3699ba71b69753c2bb46f219b573a1f8a1d2cabc792e645fc'; Size = 3602223 },
    @{ Path = 'QLNN\width_regressor.bson'; Sha256 = 'c03d56796842f1797716c4c772feac3aabd5fcda39cb4b73df2eb56e69030585'; Size = 6900423 }
)

foreach ($Model in $Models) {
    $RelativePath = [string]$Model.Path
    $Destination = Join-Path $ModelRoot $RelativePath
    $ExpectedHash = ([string]$Model.Sha256).ToUpperInvariant()
    $ExpectedSize = [int64]$Model.Size

    if (Test-Path -LiteralPath $Destination) {
        $Item = Get-Item -LiteralPath $Destination
        if ($Item.Length -eq $ExpectedSize) {
            $ActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash
            if ($ActualHash -eq $ExpectedHash) {
                Write-Host "Verified existing model: $RelativePath"
                continue
            }
        }
    }

    $Parent = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Force -Path $Parent | Out-Null
    $Temporary = "$Destination.download"
    $UrlPath = $RelativePath.Replace('\', '/')
    $Url = "$BaseUrl/$UrlPath"

    Write-Host "Downloading: $RelativePath"
    & curl.exe --fail --location --retry 4 --retry-delay 2 --connect-timeout 30 --output $Temporary $Url
    if ($LASTEXITCODE -ne 0) {
        throw "Download failed for $RelativePath (curl exit $LASTEXITCODE)"
    }

    $Downloaded = Get-Item -LiteralPath $Temporary
    $ActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Temporary).Hash
    if ($Downloaded.Length -ne $ExpectedSize -or $ActualHash -ne $ExpectedHash) {
        throw "Integrity check failed for $RelativePath; expected $ExpectedSize bytes / $ExpectedHash, got $($Downloaded.Length) bytes / $ActualHash"
    }

    Move-Item -Force -LiteralPath $Temporary -Destination $Destination
    Write-Host "Materialized and verified: $RelativePath"
}

Write-Host "All $($Models.Count) required CPU demo models are present and SHA-256 verified."
