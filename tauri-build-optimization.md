# Tauriビルド最適化ガイド

## コード署名の実装（Windows向け）

### 1. 自己署名証明書の作成（開発環境）

PowerShell（管理者権限）で実行：
```powershell
# 自己署名証明書の作成
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=Personal Slack Client Development" `
    -KeyExportPolicy Exportable `
    -KeySpec Signature `
    -KeyLength 2048 `
    -KeyAlgorithm RSA `
    -HashAlgorithm SHA256 `
    -Provider "Microsoft Enhanced RSA and AES Cryptographic Provider" `
    -CertStoreLocation "Cert:\CurrentUser\My"

# PFXファイルとしてエクスポート
$pwd = ConvertTo-SecureString -String "YourPassword123!" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath ".\dev-cert.pfx" -Password $pwd
```

### 2. Tauri設定への署名情報追加

`src-tauri/tauri.conf.json` に以下を追加：
```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "[証明書のサムプリント]",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

### 3. ビルド時の署名

```powershell
# 署名付きビルド
npm run tauri build -- --bundles msi,nsis

# または手動署名
signtool sign /f dev-cert.pfx /p YourPassword123! /fd sha256 /tr http://timestamp.digicert.com /td sha256 "src-tauri\target\release\personal-slack-client.exe"
```

## CI/CD環境での対処

### GitHub Actions設定例

`.github/workflows/build.yml`:
```yaml
name: Build Tauri App

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: windows-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        
    - name: Setup Rust
      uses: actions-rs/toolchain@v1
      with:
        toolchain: stable
        
    - name: Cache Rust dependencies
      uses: actions/cache@v3
      with:
        path: |
          ~/.cargo/registry
          ~/.cargo/git
          src-tauri/target
        key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
        
    - name: Install dependencies
      run: npm install
      
    - name: Build Tauri App
      run: npm run tauri build
      env:
        TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
```

## パフォーマンス最適化

### 1. 増分ビルドの活用
```toml
# .cargo/config.toml
[build]
incremental = true

[profile.dev]
split-debuginfo = "packed"  # デバッグ情報の分離
```

### 2. sccache の導入
```bash
# sccacheのインストール
cargo install sccache

# 環境変数の設定
export RUSTC_WRAPPER=sccache
```

### 3. 依存関係の最小化
```toml
# Cargo.toml
[dependencies]
# 必要な機能のみを有効化
serde = { version = "1", default-features = false, features = ["derive"] }
tokio = { version = "1", default-features = false, features = ["rt-multi-thread", "macros"] }
```

## トラブルシューティング

### ビルドスクリプトが削除される場合
1. ウイルスバスターの例外設定を確認
2. Windows Defenderの除外も追加：
   ```powershell
   Add-MpPreference -ExclusionPath "C:\Users\tmura\tools\personal-slack-client"
   Add-MpPreference -ExclusionProcess "cargo.exe"
   Add-MpPreference -ExclusionProcess "rustc.exe"
   ```

### ビルドが遅い場合
1. `cargo clean` で完全クリーン
2. `CARGO_BUILD_JOBS=4` で並列数制限
3. リンカーをLLDに変更：
   ```toml
   # .cargo/config.toml
   [target.x86_64-pc-windows-msvc]
   linker = "rust-lld.exe"
   ```

### メモリ不足の場合
```toml
# .cargo/config.toml
[build]
jobs = 2  # 並列ジョブ数を減らす

[env]
CARGO_BUILD_PIPELINING = "true"  # パイプライン化を有効化
```