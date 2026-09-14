$ErrorActionPreference = 'Stop'

$requiredJava = 17
$requiredMaven = [Version]'3.9'
$requiredNode = 18
$baseDir = Split-Path -Parent $PSScriptRoot

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $paths = @($env:Path, $machinePath, $userPath) | Where-Object { $_ }
  $env:Path = $paths -join ';'
}

function Command-Exists([string]$name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Get-JavaMajorVersion {
  if (-not (Command-Exists 'java')) { return 0 }
  $line = (& java -version 2>&1 | Select-Object -First 1)
  if ($line -match 'version "([^"]+)"') {
    $version = $Matches[1]
    if ($version.StartsWith('1.')) { $version = $version.Substring(2) }
    return [int](($version -split '[^0-9]')[0])
  }
  return 0
}

function Get-MavenVersion {
  if (-not (Command-Exists 'mvn')) { return [Version]'0.0' }
  $line = (& mvn -version 2>$null | Select-Object -First 1)
  if ($line -match 'Apache Maven ([0-9]+(?:\.[0-9]+){1,3})') { return [Version]$Matches[1] }
  return [Version]'0.0'
}

function Get-NodeMajorVersion {
  if (-not (Command-Exists 'node')) { return 0 }
  $version = (& node --version 2>$null)
  if ($version -match '^v?([0-9]+)') { return [int]$Matches[1] }
  return 0
}

function Install-WingetPackage([string]$packageId) {
  Write-Host "Installing $packageId ..."
  & winget install --id $packageId --exact --source winget --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { throw "Unable to install $packageId with winget." }
}

function Ensure-Runtime {
  $packages = @()
  if ((Get-JavaMajorVersion) -lt $requiredJava) { $packages += 'Microsoft.OpenJDK.17' }
  if ((Get-MavenVersion) -lt $requiredMaven) { $packages += 'Apache.Maven' }
  if ((Get-NodeMajorVersion) -lt $requiredNode) { $packages += 'OpenJS.NodeJS.LTS' }
  if ($packages.Count -eq 0) { return }

  if (-not (Command-Exists 'winget')) {
    throw "ScreenTrace requires Java $requiredJava+, Maven $requiredMaven+, and Node.js $requiredNode+. Install App Installer (winget), then run this command again."
  }
  foreach ($package in $packages) { Install-WingetPackage $package }
  Refresh-ProcessPath

  if ((Get-JavaMajorVersion) -lt $requiredJava -or (Get-MavenVersion) -lt $requiredMaven -or (Get-NodeMajorVersion) -lt $requiredNode) {
    throw "Java $requiredJava+, Maven $requiredMaven+, and Node.js $requiredNode+ could not be prepared. Close this terminal, open a new PowerShell window, and run ScreenTrace again."
  }
}

function Ensure-BrowserRenderer {
  $rendererDir = Join-Path $baseDir 'screentrace-capture'
  $playwright = Join-Path $rendererDir 'node_modules\\.bin\\playwright.cmd'
  Push-Location $rendererDir
  try {
    if (-not (Test-Path $playwright)) {
      Write-Host 'Installing ScreenTrace browser renderer...'
      & npm ci --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { throw 'Unable to install the ScreenTrace browser renderer.' }
    }
    $installed = & npx playwright install --list 2>$null
    if (($installed -join "`n") -notmatch 'chromium') {
      Write-Host 'Installing Chromium for JSP previews...'
      & npx playwright install chromium
      if ($LASTEXITCODE -ne 0) { throw 'Unable to install Chromium for JSP previews.' }
    }
  } finally {
    Pop-Location
  }
}

function Test-BuildRequired([string]$jar) {
  if (-not (Test-Path $jar)) { return $true }
  $jarTime = (Get-Item $jar).LastWriteTimeUtc
  return $null -ne (Get-ChildItem $baseDir -Recurse -File |
    Where-Object {
      $_.FullName -notmatch '[\\/](target|node_modules)[\\/]' -and
      ($_.Name -eq 'pom.xml' -or $_.Extension -eq '.java') -and
      $_.LastWriteTimeUtc -gt $jarTime
    } |
    Select-Object -First 1)
}

Ensure-Runtime
Ensure-BrowserRenderer

$jar = Join-Path $baseDir 'screentrace-cli\\target\\screentrace-cli-0.1.0-SNAPSHOT.jar'
if (Test-BuildRequired $jar) {
  Write-Host 'Building updated ScreenTrace...'
  Push-Location $baseDir
  try {
    & mvn -q -DskipTests package
    if ($LASTEXITCODE -ne 0) { throw 'Unable to build ScreenTrace.' }
  } finally {
    Pop-Location
  }
}

& java -jar $jar @args
exit $LASTEXITCODE
