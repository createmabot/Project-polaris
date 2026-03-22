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

### Preconditions
- Docker Desktop (daemon) is running
- `.env` has valid `DATABASE_URL` pointing to `localhost:5432` (or your mapped port)

### What this test verifies
- `GET /api/symbols/:symbolId` with real DB symbol seed
- snapshot failover contract (3 cases):
  - primary success (`stooq_daily`)
  - primary failure + secondary success (`yahoo_chart`)
  - primary failure + secondary failure (`current_snapshot: null`)
- snapshot shape contract:
  - `last_price`, `change`, `change_percent`, `volume`, `as_of`, `market_status`, `source_name`

### `market_status` policy (MVP)
- `stooq_daily`: daily close source, reported as `closed` (or `unknown` when stale/future-inconsistent)
- `yahoo_chart`: uses `marketState` + `as_of` freshness + JP trading session guard for conservative `open/closed/unknown`
- JP equities (`TSE/JP/TYO`) also apply a built-in JP market holiday calendar (2024-2028, no external API dependency), so holidays are treated as non-trading days.
- Holiday table maintenance guard: `npm --prefix backend run test:jp-market-holidays-guard` checks that the current JST year and next year are covered, and verifies near-limit / expired warnings.
- CI integration: `Symbol Snapshot DB Integration` also runs `test:jp-market-holidays-guard`, so holiday table coverage regressions fail PR checks.
- Internal note: freshness (`fresh/stale/expired/invalid`) is evaluated separately from market phase and then folded into public `market_status` (`open/closed/unknown`) without adding API fields.

### Troubleshooting
1. Docker daemon check:
   - `docker version`
   - If server connection fails, start Docker Desktop first.
2. DB port check:
   - PowerShell: `Test-NetConnection localhost -Port 5432`
3. Migration check:
   - `npm --prefix backend run test:integration:symbol-snapshot-db:prepare`
4. If migration history is broken in local DB:
   - `cd backend && npx prisma migrate reset --force --skip-seed`

### CI
- GitHub Actions job: `Symbol Snapshot DB Integration`
- Uses Postgres service container, then runs:
  - `npm --prefix backend run build`
  - `npm --prefix backend run test:integration:symbol-snapshot-db:prepare`
  - `npm --prefix backend run test:integration:symbol-snapshot-db`
- This job validates the same failover contract as local integration runs.
- Required status check on `main`: `symbol-snapshot-db-integration`
