import { writable } from 'svelte/store';

export interface AccessKeyMapping {
  id: string;              // 一意識別子
  key: string;             // アクセスキー（A-Z, 0-9）
  element: HTMLElement;    // 対象DOM要素
  label: string;           // 表示ラベル（通常はkeyと同じ）
  action: () => void;      // 実行するアクション
  priority: number;        // 衝突時の優先度（高いほど優先）
}

export interface AccessKeyState {
  isActive: boolean;                          // Altキーが押されているか
  mappings: Map<string, AccessKeyMapping>;    // key -> mapping
  visibleMappings: AccessKeyMapping[];        // 現在表示中のマッピング
}

const initialState: AccessKeyState = {
  isActive: false,
  mappings: new Map(),
  visibleMappings: []
};

function createAccessKeyModeStore() {
  const { subscribe, set, update } = writable<AccessKeyState>(initialState);

  return {
    subscribe,

    // Altキー押下時
    activate: () => update(state => {
      // 可視要素のみをvisibleMappingsに追加
      const visible = Array.from(state.mappings.values())
        .filter(mapping => isElementVisible(mapping.element));

      return {
        ...state,
        isActive: true,
        visibleMappings: visible
      };
    }),

    // Altキー解放時
    deactivate: () => update(state => ({
      ...state,
      isActive: false,
      visibleMappings: []
    })),

    // マッピング登録
    registerMapping: (mapping: AccessKeyMapping) => update(state => {
      const mappings = new Map(state.mappings);

      // 既存のキーとの衝突チェック
      const existing = mappings.get(mapping.key);
      if (existing) {
        console.warn(
          `[AccessKey] Key collision detected: "${mapping.key}"`,
          `\n  Existing: ${existing.id} (priority: ${existing.priority})`,
          `\n  New: ${mapping.id} (priority: ${mapping.priority})`
        );

        // 優先度が高い方を採用
        if (mapping.priority <= existing.priority) {
          return state; // 既存を保持
        }
      }

      mappings.set(mapping.key, mapping);
      return { ...state, mappings };
    }),

    // マッピング解除
    unregisterMapping: (id: string) => update(state => {
      const mappings = new Map(state.mappings);

      // IDで検索して削除
      for (const [key, mapping] of mappings.entries()) {
        if (mapping.id === id) {
          mappings.delete(key);
          break;
        }
      }

      return { ...state, mappings };
    }),

    // すべてクリア
    clear: () => set(initialState)
  };
}

// 要素が可視かどうか判定
function isElementVisible(element: HTMLElement): boolean {
  if (!element || !element.isConnected) return false;

  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

export const accessKeyMode = createAccessKeyModeStore();
