# ウイルスバスター除外設定ガイド

## 除外すべきパス

以下のパスをウイルスバスターの例外設定に追加してください：

### 1. プロジェクトディレクトリ全体（推奨）
```
C:\Users\tmura\tools\personal-slack-client\personal-slack-client\src-tauri\target\
```

### 2. Rustのグローバルキャッシュ
```
C:\Users\tmura\.cargo\
C:\Users\tmura\.rustup\
```

### 3. 特定のビルドディレクトリ（最小限の設定）
```
C:\Users\tmura\tools\personal-slack-client\personal-slack-client\src-tauri\target\debug\build\
C:\Users\tmura\tools\personal-slack-client\personal-slack-client\src-tauri\target\release\build\
```

## ウイルスバスターでの設定手順

1. **ウイルスバスターを開く**
   - システムトレイのアイコンをダブルクリック

2. **設定画面へ移動**
   - 「設定」→「例外設定」→「ファイル/フォルダ」

3. **除外パスの追加**
   - 「追加」ボタンをクリック
   - 上記のパスを追加
   - 「除外する項目」で「リアルタイムスキャン」と「手動/予約スキャン」の両方にチェック

4. **プロセスの除外（追加推奨）**
   - 「設定」→「例外設定」→「プロセス」
   - 以下を追加：
     - `cargo.exe`
     - `rustc.exe`
     - `rust-analyzer.exe`

## 注意事項

- 除外設定後、PCの再起動は不要
- 設定はすぐに反映される
- 定期的に除外リストを見直し、不要になった項目は削除する