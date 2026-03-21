# Project-polaris (北極星)

個人用の株価分析ツール「北極星」の開発用リポジトリ。

## 技術スタック
- Node.js 22
- pnpm workspaces (Monorepo)
- Frontend: Vite + React + TypeScript
- Backend: Fastify + TypeScript
- DB: PostgreSQL
- Cache/Queue: Redis
- Infra: Docker Compose

## AI モデル運用方針 (docs/28 準拠)
北極星は「常用処理のコスト最適化」と「高精度処理の精度確保」を両立するため、以下の2モデル体制を採用しています。

- **Primary: ローカル Qwen3 (30B系)**
  - 通常の要約、整理、比較など 95% 以上のタスクを担当。RTX 5090 環境等での高速動作を前提。
- **Fallback: GPT-5 mini (API)**
  - Pine Script 修正ループ失敗時や、仕様制約が極めて多い例外時のみ自動エスカレーション。

## セットアップ手順
1. **リポジトリをクローン**
2. **依存関係のインストール**
   ```bash
   pnpm install
   ```
3. **環境変数の設定**
   プロジェクトルートの `.env` がバックエンド、ワーカー、スクリプト全ての正本設定となります。
   ```bash
   cp .env.example .env
   # .env を編集して DATABASE_URL, REDIS_URL, FALLBACK_API_KEY 等を入力
   ```
4. **データベースとRedisの起動**
   ```bash
   docker compose up -d
   ```
5. **DBマイグレーションとシード投入**
   ```bash
   cd backend
   pnpm exec prisma migrate dev
   pnpm exec prisma db seed
   ```
6. **ローカルLLM疎通確認** (docs/24 準拠)
   ローカルLLMサーバー（Ollama等）が起動しており、.env の設定で推論可能か確認します。
   ```bash
   pnpm --filter backend exec tsx ../scripts/check-local-llm.ts
   ```

## 起動手順
フロントエンド・バックエンドを並列起動：
```bash
pnpm run dev
```

## よく使うコマンド
- `pnpm run up`: DBとRedisをDockerで起動
- `pnpm --filter backend exec tsx ../scripts/check-local-llm.ts`: ローカルLLMの診断
- `pnpm run dev`: 全パッケージの開発サーバーを起動
- `pnpm run build`: 全パッケージのビルド
- `pnpm run test`: 全パッケージのテスト


## Integration test (DB required)
- `pnpm run test:integration:symbol-snapshot-db`
  - starts Docker `postgres`
  - runs `prisma migrate deploy` in backend
  - runs `backend/test/symbol-snapshot.db.integration.test.ts`
