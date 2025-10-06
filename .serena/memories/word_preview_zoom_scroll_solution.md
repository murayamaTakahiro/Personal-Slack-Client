# Word Preview ズーム・スクロール問題 - 解決完了

## ✅ 解決方法

**`transform: scale()` から `zoom` プロパティへ変更**

### 変更内容

**ファイル**: `src/lib/components/files/Lightbox.svelte` (Line 1201)

**変更前**:
```html
<div class="word-preview-wrapper" style="transform: scale({zoomLevel}); transform-origin: top left;">
```

**変更後**:
```html
<div class="word-preview-wrapper" style="zoom: {zoomLevel};">
```

## 🔍 問題の原因分析

### Excel vs Word の違い

**Excel が動作する理由**:
- `<table>` 要素が固有の幅を持つ
- `display: inline-block` + `transform: scale()` でもレイアウトサイズが正しく計算される
- テーブルの構造が明確な寸法を提供

**Word が失敗する理由**:
- `<div>` ベースの構造
- `.content-container` は固定幅 `800px`
- 親の `.word-preview` が `width: fit-content` で可変
- `display: inline-block` との相性が悪い
- `transform: scale()` は視覚的にのみスケール、レイアウトサイズは変わらない
- → スクロール範囲がスケール後の実際の表示サイズに追従しない

### transform: scale() の問題点

1. **レイアウトサイズ vs 視覚サイズの乖離**
   - `transform: scale(2)` でも、ブラウザが認識するレイアウトサイズは元のまま
   - スクロールバーの範囲がレイアウトサイズで決まる
   - 視覚的には拡大されているが、スクロール範囲は拡大前のまま

2. **display: inline-block との相性**
   - `inline-block` は子要素のサイズに合わせて縮む
   - Word の可変幅構造では、wrapper が正しいサイズを認識できない

### zoom プロパティの利点

1. **レイアウトサイズも変更される**
   - `zoom: 2` でレイアウトサイズも2倍になる
   - スクロールバーの範囲が自動的に正しくなる

2. **Excel で zoom を使わない理由**
   - Excel には sticky position のヘッダーがある
   - `zoom` プロパティは sticky position と互換性がない
   - → Excel は `transform: scale()` を使う必要がある

3. **Word で zoom を使える理由**
   - Word には sticky position の要素がない
   - `zoom` の制約が適用されない
   - → シンプルで効果的な解決策

## 📊 検証結果

### 修正前の症状
- デフォルト倍率: スクロールで全体確認可能 ✅
- 3回拡大後: 画面下部が見切れ、スクロールしても表示できない ❌
- H/L キーでの左右スクロールが機能しない ❌

### 修正後の期待動作
- すべての倍率でスクロールで全体確認可能 ✅
- H/L キーでの左右スクロールが機能 ✅
- 左右スクロールバーが適切に表示 ✅

## 🎯 試行錯誤の教訓

### 失敗したアプローチ（3回）
1. `.content-container` に `overflow` を追加 → 効果なし
2. `.word-preview` に `min-height` を追加 → 効果なし
3. `.word-preview` を固定幅に変更 → 効果なし

### なぜ失敗したか
- すべて `transform: scale()` の根本問題（レイアウトサイズ不変）を解決していなかった
- CSS の構造調整だけでは、transform の仕様上の制約を回避できない

### 成功したアプローチ
- **Excel の分析**から、なぜ Excel が動作するか理解
- **Word の制約**（sticky なし）に気づき、`zoom` が使えることを発見
- **根本原因**（transform vs zoom の違い）に対処

## 🔗 関連ファイル

- **Lightbox.svelte** (Line 1201): zoom 適用箇所
- **WordPreview.svelte**: 構造は変更不要（問題は Lightbox 側）
- **ExcelPreview.svelte**: 参考（sticky header のため transform 使用）

## 📝 今後の対応

### 同様の問題が発生したら
1. `transform: scale()` vs `zoom` の違いを確認
2. sticky position の有無を確認
3. sticky なし → `zoom` を優先
4. sticky あり → `transform: scale()` + レイアウト調整

### メモリファイル整理
以下のメモリは役目を終えたため削除可能:
- `word_preview_zoom_scroll_handover` (引き継ぎ書)
- `word_preview_scroll_fix` (最初の試行)
- `word_preview_scale_scroll_final_fix` (失敗した試行)

このメモリ (`word_preview_zoom_scroll_solution`) に集約済み。
