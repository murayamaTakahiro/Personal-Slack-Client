# ウイルスバスター誤検知問題 - 完全解決ガイド

## 問題の概要
ウイルスバスターがRustのビルドスクリプト（`build_script_build-*.exe`）を誤検知し、`TROJ.Win32.TRX.XXPE50FFF097`として削除する問題。

## 即座の解決手順（優先順位順）

### ステップ 1: ウイルスバスターの除外設定 【最重要】

1. ウイルスバスターのメイン画面を開く
2. 「設定」→「例外設定」→「ファイル/フォルダ」を選択
3. 以下のパスを追加：
   ```
   C:\Users\tmura\tools\personal-slack-client\personal-slack-client\src-tauri\target\
   C:\Users\tmura\.cargo\
   ```
4. 「除外する項目」で両方にチェック：
   - リアルタイムスキャン
   - 手動/予約スキャン

### ステップ 2: Windows Defenderの除外設定（補助）

PowerShell（管理者権限）で実行：
```powershell
# Windows Defenderの除外設定
Add-MpPreference -ExclusionPath "C:\Users\tmura\tools\personal-slack-client"
Add-MpPreference -ExclusionProcess "cargo.exe"
Add-MpPreference -ExclusionProcess "rustc.exe"
```

### ステップ 3: ビルドキャッシュのクリア

```bash
# 既存のビルドファイルを削除
cd personal-slack-client
npm run tauri:clean

# または手動で
cargo clean
```

### ステップ 4: 安全なビルドの実行

```bash
# 通常のビルド
npm run tauri:build

# 問題が続く場合は保護付きビルド
npm run tauri:build-safe
```

## 長期的な対策

### 1. 開発環境の最適化

#### Cargo設定（`.cargo/config.toml`）
- ビルドの並列数制限
- プロファイル設定の最適化
- インクリメンタルビルドの有効化

#### ビルドスクリプトのキャッシュ（`build-cache.ps1`）
- 自動バックアップ機能
- ウイルスバスター検出時の自動復元
- ビルド前の状態確認

### 2. プロダクションビルドの署名

開発中は自己署名証明書を使用：
```powershell
# 証明書作成（初回のみ）
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Dev Certificate" -CertStoreLocation "Cert:\CurrentUser\My"

# アプリケーションの署名
signtool sign /a /fd sha256 /tr http://timestamp.digicert.com /td sha256 "target\release\personal-slack-client.exe"
```

### 3. CI/CD環境での対処

GitHub Actionsなどでは：
- ビルドキャッシュの活用
- 署名証明書の秘密管理
- Windows環境でのビルド最適化

## トラブルシューティング

### Q: 除外設定後も検出される
A: 以下を確認：
1. ウイルスバスターを一度再起動
2. 除外パスが正しく設定されているか確認
3. リアルタイムスキャンと手動スキャン両方が除外されているか

### Q: ビルドが失敗する
A: 以下の手順で対処：
```bash
# 1. 完全クリーン
cargo clean

# 2. キャッシュ復元
npm run tauri:restore

# 3. 再ビルド
npm run tauri:build
```

### Q: パフォーマンスが遅い
A: `.cargo/config.toml`で並列数を調整：
```toml
[build]
jobs = 2  # CPUコア数に応じて調整
```

## 推奨される開発フロー

1. **初回セットアップ時**：
   - ウイルスバスターの除外設定を完了
   - `.cargo/config.toml`を配置
   - `build-cache.ps1`を配置

2. **日常の開発**：
   - 通常は`npm run tauri:dev`で開発
   - ビルドは`npm run tauri:build`を使用

3. **問題発生時**：
   - `npm run tauri:build-safe`で保護付きビルド
   - それでも失敗する場合は除外設定を再確認

## 関連ファイル

- `virus-buster-exclusion-guide.md` - ウイルスバスター設定の詳細ガイド
- `tauri-build-optimization.md` - ビルド最適化の技術詳細
- `build-cache.ps1` - ビルドキャッシュ管理スクリプト
- `.cargo/config.toml` - Cargo設定ファイル

## サポート

問題が解決しない場合：
1. `src-tauri/target`ディレクトリを完全削除
2. ウイルスバスターを一時無効化してビルド
3. ビルド成功後、生成されたexeファイルを手動で除外リストに追加