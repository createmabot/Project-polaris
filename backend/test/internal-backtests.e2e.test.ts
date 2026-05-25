import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { internalBacktestRoutes } from '../src/routes/internal-backtests';
import { errorHandler } from '../src/utils/response';

const deprecatedDetails = {
  replacement_flow: 'tradingview_csv_import',
  stage: 'internal_backtest_stage_2b',
};

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(internalBacktestRoutes, { prefix: '/api/internal-backtests' });
  await app.ready();
  return app;
}

function expectDeprecatedResponse(res: { statusCode: number; json: () => any }) {
  expect(res.statusCode).toBe(410);
  const body = res.json();
  expect(body.data).toBeNull();
  expect(body.error).toMatchObject({
    code: 'INTERNAL_BACKTEST_DEPRECATED',
    message: 'internal backtest backend is deprecated. Use TradingView validation and CSV import.',
    details: deprecatedDetails,
  });
}

describe('internal backtest routes Stage 2B deactivation', () => {
  it('returns 410 for observability summary without service access', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-backtests/observability/data-source-unavailable-summary?window=24h',
    });

    expectDeprecatedResponse(res);
    await app.close();
  });

  it('returns 410 for execution creation', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/internal-backtests/executions',
      payload: {
        strategy_rule_version_id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
        execution_target: { symbol: '7203', source_kind: 'daily_ohlcv' },
        data_range: { from: '2024-01-01', to: '2025-12-31' },
      },
    });

    expectDeprecatedResponse(res);
    await app.close();
  });

  it('returns 410 for execution detail and result reads', async () => {
    const app = await createApp();

    const detail = await app.inject({
      method: 'GET',
      url: '/api/internal-backtests/executions/ibtx-1',
    });
    const result = await app.inject({
      method: 'GET',
      url: '/api/internal-backtests/executions/ibtx-1/result',
    });

    expectDeprecatedResponse(detail);
    expectDeprecatedResponse(result);
    await app.close();
  });

  it('returns 410 for engine_actual trades and equity artifact reads', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-backtests/executions/ibtx-1/artifacts/engine_actual/trades-and-equity',
    });

    expectDeprecatedResponse(res);
    await app.close();
  });
});
