# Hokkyokusei (北極星)

個人用の株価分析ツール「北極星」の開発用リポジトリ。

## 技術スタック
- Node.js 22
- pnpm workspaces (Monorepo)
- Frontend: Vite + React + TypeScript
- Backend: Fastify + TypeScript
- DB: PostgreSQL
- Cache/Queue: Redis
- Infra: Docker Compose

## セットアップ手順
1. リポジトリをクローン
2. Node.js (22.x) および pnpm をインストール
3. 依存関係のインストール
   ```bash
   pnpm install
   ```
4. 環境変数の設定
   ```bash
   cp .env.example .env
   ```
5. データベースとRedisの起動
   ```bash
   docker compose up -d
   ```

## 起動手順
フロントエンド・バックエンドを並列起動：
```bash
pnpm run dev
```
（または各ディレクトリで個別に実行）

## よく使うコマンド
- `pnpm run up`: DBとRedisをDockerで起動
- `pnpm run down`: コンテナの停止
- `pnpm run dev`: 全パッケージの開発サーバーを起動
- `pnpm run build`: 全パッケージのビルド
- `pnpm run test`: 全パッケージのテスト
