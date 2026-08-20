import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library の自動クリーンアップは vitest の globals が有効なときしか
// 効かない。本プロジェクトは globals を使わないため、明示的に登録する。
// これが無いと、同一ファイル内の前のテストが描画した DOM が残り、
// getByText が「複数見つかった」で落ちる。
afterEach(() => {
  cleanup();
});
