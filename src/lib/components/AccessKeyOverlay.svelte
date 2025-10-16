<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { accessKeyMode } from '../stores/accessKeyMode';

  interface BadgePosition {
    key: string;
    label: string;
    top: number;
    left: number;
    element: HTMLElement;
  }

  let badges: BadgePosition[] = [];
  let resizeObserver: ResizeObserver | null = null;
  let resizeDebounceTimeout: number | null = null;

  // アクセスキーモードの状態を購読
  // IMPORTANT: 即座にバッジを表示するためデバウンスなし
  $: if ($accessKeyMode.isActive) {
    updateBadgePositions();
  } else {
    badges = [];
  }

  /**
   * バッジの位置を計算
   */
  function updateBadgePositions() {
    // 即座にバッジを表示（デバウンスなし）
    badges = $accessKeyMode.visibleMappings.map(mapping => {
      const rect = mapping.element.getBoundingClientRect();

      // 要素の左上にバッジを配置
      // （Excelスタイル: 要素の内部左上）
      return {
        key: mapping.key,
        label: mapping.label,
        top: rect.top + 2,
        left: rect.left + 2,
        element: mapping.element
      };
    });
  }

  /**
   * ウィンドウリサイズ/スクロール時の更新（デバウンス付き）
   */
  function handleWindowChange() {
    if (!$accessKeyMode.isActive) return;

    // リサイズ/スクロール時のみデバウンスを適用
    if (resizeDebounceTimeout) {
      clearTimeout(resizeDebounceTimeout);
    }

    resizeDebounceTimeout = window.setTimeout(() => {
      updateBadgePositions();
    }, 16); // ~60fps
  }

  onMount(() => {
    // ウィンドウイベントリスナー
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true); // capture phase

    // ResizeObserver for dynamic content
    resizeObserver = new ResizeObserver(() => {
      handleWindowChange();
    });

    // document.bodyを監視
    resizeObserver.observe(document.body);
  });

  onDestroy(() => {
    window.removeEventListener('resize', handleWindowChange);
    window.removeEventListener('scroll', handleWindowChange, true);

    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    if (resizeDebounceTimeout) {
      clearTimeout(resizeDebounceTimeout);
    }
  });
</script>

{#if $accessKeyMode.isActive && badges.length > 0}
  <div class="access-key-overlay" role="presentation" aria-hidden="true">
    {#each badges as badge (badge.key)}
      <div
        class="access-key-badge"
        style="top: {badge.top}px; left: {badge.left}px;"
        data-key={badge.key}
      >
        {badge.label}
      </div>
    {/each}
  </div>
{/if}

<style>
  .access-key-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 9999;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .access-key-badge {
    position: absolute;
    min-width: 18px;
    height: 18px;
    padding: 2px 4px;

    /* Excelスタイル: 黄色背景 */
    background: #FFF4CE;
    border: 1px solid #D4A017;
    border-radius: 3px;

    /* テキストスタイル */
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 11px;
    font-weight: 600;
    color: #333;
    text-align: center;
    line-height: 14px;

    /* シャドウ */
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);

    /* アニメーション */
    animation: badgePop 0.2s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  @keyframes badgePop {
    0% {
      transform: scale(0.8);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* ダークモード対応 */
  :global(.dark) .access-key-badge {
    background: #4A4A00;
    border-color: #8B8B00;
    color: #FFF;
  }
</style>
