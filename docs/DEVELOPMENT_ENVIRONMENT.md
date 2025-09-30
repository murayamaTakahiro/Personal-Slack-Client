# 開発環境セットアップガイド

## 概要
このプロジェクトはTauriを使用したデスクトップアプリケーションです。WSL（Windows Subsystem for Linux）とWindows環境の両方で開発可能ですが、それぞれの環境に応じた適切なセットアップが必要です。

## 重要：プラットフォーム固有のバイナリについて

### 問題の背景
Node.jsのネイティブモジュール（特にTauri CLI）は、プラットフォーム固有のバイナリファイルを使用します：
- **WSL/Linux**: `cli-linux-x64-gnu.node`
- **Windows**: `cli.win32-x64-msvc.node`

これらのバイナリは互換性がないため、**WSLでインストールしたnode_modulesをWindows PowerShellから実行することはできません**（逆も同様）。

## 環境別セットアップ手順

### Windows PowerShellで開発する場合

1. **Windows PowerShell**を開く（管理者権限は不要）

2. プロジェクトディレクトリに移動：
   ```powershell
   cd C:\Users\[ユーザー名]\tools\personal-slack-client\personal-slack-client
   ```

3. 既存のnode_modules（WSLでインストールされたもの）がある場合は削除：
   ```powershell
   Remove-Item -Recurse -Force node_modules
   Remove-Item -Force package-lock.json
   ```

4. Windows環境用に依存関係をインストール：
   ```powershell
   npm install
   ```

5. Tauriアプリケーションを起動：
   ```powershell
   npm run tauri:dev
   ```

### WSLで開発する場合

1. **WSLターミナル**を開く

2. プロジェクトディレクトリに移動：
   ```bash
   cd /mnt/c/Users/[ユーザー名]/tools/personal-slack-client/personal-slack-client
   ```

3. 既存のnode_modules（Windowsでインストールされたもの）がある場合は削除：
   ```bash
   rm -rf node_modules package-lock.json
   ```

4. WSL環境用に依存関係をインストール：
   ```bash
   npm install
   ```

5. Tauriアプリケーションを起動：
   ```bash
   npm run tauri:dev
   ```

## よくあるエラーと解決方法

### エラー: "Cannot find module './cli.win32-x64-msvc.node'"
- **発生環境**: Windows PowerShell
- **原因**: WSLでインストールしたnode_modulesを使用している
- **解決方法**: 
  ```powershell
  Remove-Item -Recurse -Force node_modules
  npm install
  ```

### エラー: "Cannot find module './cli-linux-x64-gnu.node'"
- **発生環境**: WSL
- **原因**: Windows PowerShellでインストールしたnode_modulesを使用している
- **解決方法**:
  ```bash
  rm -rf node_modules
  npm install
  ```

### エラー: "Found version mismatched Tauri packages"
- **原因**: NPMパッケージとRustクレートのバージョン不一致
- **解決方法**: package.jsonで指定されているバージョンを確認し、必要に応じて調整

## ベストプラクティス

1. **一貫した環境を維持**
   - 開発を始めたら、同じ環境（WindowsまたはWSL）を使い続ける
   - チーム開発の場合は、環境を統一することを推奨

2. **環境切り替え時の注意**
   - 環境を切り替える場合は、必ず`node_modules`を削除してから`npm install`を実行
   - `package-lock.json`も削除することで、クリーンな状態から始められる

3. **推奨される開発環境**
   - **Windows開発者**: Windows PowerShellまたはコマンドプロンプト
   - **Linux/Mac経験者**: WSL
   - **Visual Studio Code使用時**: ターミナルの環境を統一する

## Tauri特有の注意事項

- Tauriは両方の環境で動作しますが、ビルド出力はホストOS（Windows）用になります
- WSLから実行しても、生成される実行ファイルはWindows用（.exe）です
- 開発サーバーはどちらの環境でも同じように動作します

## まとめ

最も重要なのは**node_modulesをインストールした環境と実行する環境を一致させる**ことです。これさえ守れば、どちらの環境でも問題なく開発できます。