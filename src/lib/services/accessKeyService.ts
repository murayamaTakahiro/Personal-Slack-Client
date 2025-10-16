import { get } from 'svelte/store';
import { accessKeyMode, type AccessKeyMapping } from '../stores/accessKeyMode';

class AccessKeyService {
  private registrationId = 0;

  /**
   * アクセスキーを登録
   * @param key - アクセスキー（A-Z, 0-9）
   * @param element - 対象DOM要素
   * @param action - 実行するアクション
   * @param priority - 優先度（デフォルト: 10）
   * @returns 登録ID（解除時に使用）
   */
  register(
    key: string,
    element: HTMLElement,
    action: () => void,
    priority: number = 10
  ): string {
    // キーを大文字に正規化
    const normalizedKey = key.toUpperCase();

    // バリデーション
    if (!/^[A-Z0-9]$/.test(normalizedKey)) {
      console.error(`[AccessKey] Invalid key: "${key}". Must be A-Z or 0-9.`);
      return '';
    }

    if (!element) {
      console.error(`[AccessKey] Invalid element provided for key "${key}"`);
      return '';
    }

    // 一意のIDを生成
    const id = `access-key-${this.registrationId++}`;

    // マッピング作成
    const mapping: AccessKeyMapping = {
      id,
      key: normalizedKey,
      element,
      label: normalizedKey,
      action,
      priority
    };

    // ストアに登録
    accessKeyMode.registerMapping(mapping);

    console.log(`[AccessKey] Registered: ${id} (key: ${normalizedKey}, priority: ${priority})`);

    return id;
  }

  /**
   * アクセスキー登録を解除
   * @param id - register()で返された登録ID
   */
  unregister(id: string): void {
    if (!id) return;

    accessKeyMode.unregisterMapping(id);
    console.log(`[AccessKey] Unregistered: ${id}`);
  }

  /**
   * アクセスキーを実行
   * @param key - 押されたキー
   * @returns 実行されたかどうか
   */
  executeKey(key: string): boolean {
    const normalizedKey = key.toUpperCase();
    const state = get(accessKeyMode);

    if (!state.isActive) {
      return false;
    }

    const mapping = state.mappings.get(normalizedKey);

    if (!mapping) {
      console.log(`[AccessKey] No mapping found for key: ${normalizedKey}`);
      return false;
    }

    console.log(`[AccessKey] Executing action for key: ${normalizedKey}`);

    try {
      mapping.action();
      // アクション実行後は自動的に非アクティブ化
      accessKeyMode.deactivate();
      return true;
    } catch (error) {
      console.error(`[AccessKey] Error executing action for key ${normalizedKey}:`, error);
      return false;
    }
  }

  /**
   * すべての登録をクリア
   */
  clearAll(): void {
    accessKeyMode.clear();
    console.log('[AccessKey] All registrations cleared');
  }

  /**
   * 登録状況をデバッグ出力
   */
  debug(): void {
    const state = get(accessKeyMode);
    console.group('[AccessKey] Current State');
    console.log('Active:', state.isActive);
    console.log('Total Mappings:', state.mappings.size);
    console.log('Visible Mappings:', state.visibleMappings.length);
    console.table(
      Array.from(state.mappings.values()).map(m => ({
        ID: m.id,
        Key: m.key,
        Priority: m.priority,
        Element: m.element.tagName
      }))
    );
    console.groupEnd();
  }
}

// シングルトンインスタンス
export const accessKeyService = new AccessKeyService();
