param([string]$OutputPath = "backups/ocean-command-$(Get-Date -Format yyyyMMdd-HHmmss).dump")
$ErrorActionPreference = "Stop"
$directory = Split-Path -Parent $OutputPath
if ($directory) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
$database = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "ocean_command" }
$user = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "ocean" }
docker compose exec -T postgres pg_dump -U $user -Fc $database > $OutputPath
if (!(Test-Path -LiteralPath $OutputPath) -or (Get-Item -LiteralPath $OutputPath).Length -eq 0) { throw "Backup did not produce an archive." }
Write-Output "Backup created: $OutputPath"
