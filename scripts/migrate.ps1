# KhataGST Database Migration Script (Windows PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "Starting KhataGST Alembic migration..." -ForegroundColor Cyan
$BackendDir = Join-Path $PSScriptRoot "..\backend"
Set-Location $BackendDir
python scripts/migrate.py
Write-Host "Migration complete!" -ForegroundColor Green

