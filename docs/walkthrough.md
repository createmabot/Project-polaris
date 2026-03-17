# 環境設定とドキュメントの正規化 ウォークスルー

## 実施内容の概要

プロジェクト全体の環境設定をルートの [.env](file:///g:/Projects/hokkyokusei/.env) に一本化し、ドキュメント（README / セットアップ手順）を最新の AI 利用方針と整合させました。

### 1. 環境変数の正本統一
- **ルート [.env](file:///g:/Projects/hokkyokusei/.env) を唯一の正本に決定**: バックエンド実行、ワーカー、および診断スクリプトが共通の設定を参照するように変更しました。
- **[backend/src/env.ts](file:///g:/Projects/hokkyokusei/backend/src/env.ts)**: `dotenv.config({ path: '../../.env' })` を指定し、ルートの [.env](file:///g:/Projects/hokkyokusei/.env) を読み込むよう修正。
- **[scripts/check-local-llm.ts](file:///g:/Projects/hokkyokusei/scripts/check-local-llm.ts)**: 同様にルートの [.env](file:///g:/Projects/hokkyokusei/.env) を参照するよう修正。

### 2. 設定ファイルの整理
- **ルート [.env.example](file:///g:/Projects/hokkyokusei/.env.example)**: AI モデル方針（Qwen3 / GPT-5 mini）を含む全ての必要変数を集約。
- **Redundant ファイルの削除**: [backend/.env.example](file:///g:/Projects/hokkyokusei/backend/.env.example) を削除し、設定の二重管理を解消。

### 3. ドキュメントの同期 (docs/20, 24, 28 準拠)
- **ルート [README.md](file:///g:/Projects/hokkyokusei/README.md)**:
  - AI モデルの運用方針（Qwen3 優先 + GPT-5 mini Fallback）を明記。
  - ルートの [.env](file:///g:/Projects/hokkyokusei/.env) を使うセットアップ手順に刷新。
  - 診断スクリプト [scripts/check-local-llm.ts](file:///g:/Projects/hokkyokusei/scripts/check-local-llm.ts) の実行手順を追加。
- **`docs/24.北極星 開発着手用 README セットアップ手順書`**:
  - ルートの [.env](file:///g:/Projects/hokkyokusei/.env) を正本とする記述に統一。
  - MVP に必要な最小限の環境変数値（DATABASE_URL, REDIS_URL, AI設定）を現行実装に合わせ更新。

## 検証結果

| 項目 | 結果 | 備考 |
|---|---|---|
| `backend` ビルド | ✅ パス | `tsc` により型定義とパス解釈の整合を確認。 |
| 診断スクリプト実行 | ✅ パス | ルート [.env](file:///g:/Projects/hokkyokusei/.env) から正しく 16 項目を読み込むことを確認。 (LLM未起動による `fetch failed` は正常な挙動) |
| README 整合性 | ✅ 確認済 | 手順通りに [.env](file:///g:/Projects/hokkyokusei/.env) を作成し、ローカル開発を開始できる状態。 |

## 残る設定上の注意点
- **Local LLM サーバー**: Qwen3 を使用する場合、Ollama 等でエンドポイントが `11434` ポート等で起動している必要があります。
- **Fallback API Key**: `GPT-5 mini` を利用する場合は、ルート [.env](file:///g:/Projects/hokkyokusei/.env) の `FALLBACK_API_KEY` に有効な値を設定してください。
