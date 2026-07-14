[CmdletBinding()]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

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

Write-Host 'GitHub Desktop preparation completed.'
Write-Host "Repository: $root"
Write-Host 'Open GitHub Desktop and choose File > Add local repository.'
