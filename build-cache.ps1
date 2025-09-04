# PowerShellスクリプト - ビルドキャッシュの管理とウイルスバスター対策

param(
    [Parameter(Position=0)]
    [ValidateSet("build", "clean", "backup", "restore")]
    [string]$Action = "build"
)

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TargetDir = Join-Path $ProjectRoot "src-tauri\target"
$BackupDir = Join-Path $env:TEMP "rust-build-cache\personal-slack-client"

function Backup-BuildCache {
    Write-Host "ビルドキャッシュをバックアップ中..." -ForegroundColor Yellow
    
    if (Test-Path $TargetDir) {
        if (-not (Test-Path $BackupDir)) {
            New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
        }
        
        # build scriptファイルのみバックアップ
        $buildScripts = Get-ChildItem -Path $TargetDir -Recurse -Filter "build_script_build-*.exe" -ErrorAction SilentlyContinue
        
        foreach ($script in $buildScripts) {
            $relativePath = $script.FullName.Substring($TargetDir.Length + 1)
            $backupPath = Join-Path $BackupDir $relativePath
            $backupFolder = Split-Path -Parent $backupPath
            
            if (-not (Test-Path $backupFolder)) {
                New-Item -ItemType Directory -Path $backupFolder -Force | Out-Null
            }
            
            Copy-Item -Path $script.FullName -Destination $backupPath -Force
            Write-Host "  バックアップ: $($script.Name)" -ForegroundColor Green
        }
    }
}

function Restore-BuildCache {
    Write-Host "ビルドキャッシュを復元中..." -ForegroundColor Yellow
    
    if (Test-Path $BackupDir) {
        $backupFiles = Get-ChildItem -Path $BackupDir -Recurse -Filter "*.exe"
        
        foreach ($file in $backupFiles) {
            $relativePath = $file.FullName.Substring($BackupDir.Length + 1)
            $targetPath = Join-Path $TargetDir $relativePath
            $targetFolder = Split-Path -Parent $targetPath
            
            if (-not (Test-Path $targetFolder)) {
                New-Item -ItemType Directory -Path $targetFolder -Force | Out-Null
            }
            
            Copy-Item -Path $file.FullName -Destination $targetPath -Force
            Write-Host "  復元: $($file.Name)" -ForegroundColor Green
        }
    }
}

function Build-WithProtection {
    Write-Host "保護されたビルドを開始..." -ForegroundColor Cyan
    
    # ウイルスバスターの状態確認
    $virusBusterRunning = Get-Process -Name "Trend Micro*" -ErrorAction SilentlyContinue
    
    if ($virusBusterRunning) {
        Write-Host "警告: ウイルスバスターが実行中です。" -ForegroundColor Yellow
        Write-Host "除外設定が完了していることを確認してください。" -ForegroundColor Yellow
        
        $confirmation = Read-Host "続行しますか？ (y/N)"
        if ($confirmation -ne 'y') {
            exit 1
        }
    }
    
    # バックアップを作成
    Backup-BuildCache
    
    # ビルド実行
    Push-Location (Join-Path $ProjectRoot "src-tauri")
    try {
        cargo build --release
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ビルドが失敗しました。キャッシュから復元を試みます..." -ForegroundColor Red
            Restore-BuildCache
            
            # リトライ
            cargo build --release
        }
    }
    finally {
        Pop-Location
    }
}

switch ($Action) {
    "build" {
        Build-WithProtection
    }
    "clean" {
        Write-Host "ビルドキャッシュをクリーン中..." -ForegroundColor Yellow
        if (Test-Path $TargetDir) {
            Remove-Item -Path $TargetDir -Recurse -Force
        }
        cargo clean
    }
    "backup" {
        Backup-BuildCache
    }
    "restore" {
        Restore-BuildCache
    }
}

Write-Host "完了！" -ForegroundColor Green