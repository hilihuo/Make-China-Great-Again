[CmdletBinding()]
param(
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'

function Show-GitHubDesktopNextSteps {
    param([string]$Root)

    Write-Host 'GitHub Desktop preparation completed.'
    Write-Host "Repository: $Root"
    Write-Host '1. Open GitHub Desktop and choose File > Add local repository.'
    Write-Host '2. Select this project directory and commit the files shown in Changes.'
    Write-Host '3. Click Push origin (or Publish branch for the first push).'
    Write-Host '4. Upload the EXE and APK separately from the GitHub Releases page.'
    Write-Host "Guide: $(Join-Path $Root 'GITHUB_DESKTOP_UPLOAD.md')"
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $scriptPath = $MyInvocation.MyCommand.Path
    if ([string]::IsNullOrWhiteSpace($scriptPath)) {
        throw 'Unable to determine the script path. Pass -ProjectRoot explicitly.'
    }

    $ProjectRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
}

$root = (Resolve-Path -LiteralPath $ProjectRoot).Path
$packageJson = Join-Path $root 'package.json'
$legacyGit = Join-Path $root '.git'
$gitData = Join-Path $root '.gitdata'
$backupGit = Join-Path $root '.git-empty-backup'

if (-not (Test-Path -LiteralPath $packageJson -PathType Leaf)) {
    throw "package.json was not found in project root: $root"
}

if (-not (Test-Path -LiteralPath $gitData -PathType Container)) {
    if (Test-Path -LiteralPath $legacyGit -PathType Container) {
        Write-Host 'The project already uses the standard .git directory.'
        Show-GitHubDesktopNextSteps -Root $root
        exit 0
    }

    throw "Git metadata directory was not found: $gitData"
}

if (Test-Path -LiteralPath $backupGit) {
    throw "Backup path already exists. Review it before continuing: $backupGit"
}

if (Test-Path -LiteralPath $legacyGit) {
    if (-not (Test-Path -LiteralPath $legacyGit -PathType Container)) {
        throw ".git exists but is not a directory: $legacyGit"
    }

    $legacyEntries = @(Get-ChildItem -LiteralPath $legacyGit -Force)
    if ($legacyEntries.Count -ne 0) {
        throw '.git is not empty. Nothing was changed.'
    }

    Move-Item -LiteralPath $legacyGit -Destination $backupGit
}

Move-Item -LiteralPath $gitData -Destination $legacyGit

Show-GitHubDesktopNextSteps -Root $root
