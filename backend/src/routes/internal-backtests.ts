import { FastifyPluginAsync } from 'fastify';
import { AppError } from '../utils/response';

const INTERNAL_BACKTEST_DEPRECATED_DETAILS = {
  replacement_flow: 'tradingview_csv_import',
  stage: 'internal_backtest_stage_2b',
} as const;

function internalBacktestDeprecatedError() {
  return new AppError(
    410,
    'INTERNAL_BACKTEST_DEPRECATED',
    'internal backtest backend is deprecated. Use TradingView validation and CSV import.',
    INTERNAL_BACKTEST_DEPRECATED_DETAILS,
  );
}

export const internalBacktestRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/observability/data-source-unavailable-summary',
    async () => {
      throw internalBacktestDeprecatedError();
    },
  );

  fastify.post('/executions', async () => {
    throw internalBacktestDeprecatedError();
  });

  fastify.get('/executions/:executionId', async () => {
    throw internalBacktestDeprecatedError();
  });

  fastify.get('/executions/:executionId/result', async () => {
    throw internalBacktestDeprecatedError();
  });

  fastify.get(
    '/executions/:executionId/artifacts/engine_actual/trades-and-equity',
    async () => {
      throw internalBacktestDeprecatedError();
    },
  );
};
