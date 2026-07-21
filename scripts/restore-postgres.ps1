param([Parameter(Mandatory = $true)][string]$BackupPath, [switch]$ConfirmRestore)
$ErrorActionPreference = "Stop"
if (!$ConfirmRestore) { throw "Restore is destructive. Re-run with -ConfirmRestore after verifying the target database." }
if (!(Test-Path -LiteralPath $BackupPath)) { throw "Backup archive not found: $BackupPath" }
$database = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "ocean_command" }
$user = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "ocean" }
Get-Content -LiteralPath $BackupPath -AsByteStream | docker compose exec -T postgres pg_restore -U $user -d $database --clean --if-exists --no-owner
Write-Output "Restore completed from: $BackupPath"
