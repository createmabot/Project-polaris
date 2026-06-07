import Fastify from 'fastify';
import { prisma } from './db';
import { redis } from './redis';
import { env } from './env';
import { webhookRoutes } from './routes/webhooks';
import { homeRoutes } from './routes/home';
import { alertRoutes } from './routes/alerts';
import { symbolRoutes } from './routes/symbols';
import { noteRoutes } from './routes/notes';
import { watchlistRoutes } from './routes/watchlists';
import { watchlistItemRoutes } from './routes/watchlist-items';
import { positionRoutes } from './routes/positions';
import { comparisonRoutes } from './routes/comparisons';
import { strategyRoutes } from './routes/strategies';
import { strategyLabRoutes } from './routes/strategy-lab';
import { strategyVersionRoutes } from './routes/strategy-versions';
import { strategyOptimizationSessionRoutes, strategyRefinementCandidateRoutes } from './routes/strategy-optimization-sessions';
import { symbolStrategyApplicationRoutes } from './routes/symbol-strategy-applications';
import { backtestRoutes } from './routes/backtests';
import { backtestComparisonRoutes } from './routes/backtest-comparisons';
import { marketDataRoutes } from './routes/market-data';
import { summaryRoutes } from './routes/summaries';
import { errorHandler } from './utils/response';
import { setupWorker } from './queue';
import crypto from 'crypto';

const fastify = Fastify({
  logger: true,
  genReqId: () => crypto.randomUUID(),
  // CSV import sends raw csv_text as JSON; allow comfortably above typical TradingView exports.
  bodyLimit: 2 * 1024 * 1024,
});

fastify.setErrorHandler(errorHandler);

fastify.addContentTypeParser('text/plain', { parseAs: 'string' }, (req, body, done) => {
  done(null, body);
});

fastify.get('/health', async (request, reply) => {
  return reply.status(200).send({ status: 'ok', request_id: request.id, env: env.APP_ENV });
});

fastify.register(webhookRoutes, { prefix: '/api/integrations' });
// Backwards compat mount
fastify.register(webhookRoutes, { prefix: '/api/webhooks' });

fastify.register(homeRoutes, { prefix: '/api/home' });
fastify.register(summaryRoutes, { prefix: '/api/summaries' });
fastify.register(alertRoutes, { prefix: '/api/alerts' });
fastify.register(symbolRoutes, { prefix: '/api/symbols' });
fastify.register(marketDataRoutes, { prefix: '/api/symbols' });
fastify.register(noteRoutes, { prefix: '/api/notes' });
fastify.register(watchlistRoutes, { prefix: '/api/watchlists' });
fastify.register(watchlistItemRoutes, { prefix: '/api/watchlist-items' });
fastify.register(positionRoutes, { prefix: '/api/positions' });
fastify.register(comparisonRoutes, { prefix: '/api/comparisons' });
fastify.register(strategyRoutes, { prefix: '/api/strategies' });
fastify.register(strategyLabRoutes, { prefix: '/api/strategy-lab' });
fastify.register(strategyVersionRoutes, { prefix: '/api/strategy-versions' });
fastify.register(strategyOptimizationSessionRoutes, { prefix: '/api/strategy-optimization-sessions' });
fastify.register(strategyRefinementCandidateRoutes, { prefix: '/api/strategy-refinement-candidates' });
fastify.register(symbolStrategyApplicationRoutes, { prefix: '/api/symbol-strategy-applications' });
fastify.register(backtestRoutes, { prefix: '/api/backtests' });
fastify.register(backtestComparisonRoutes, { prefix: '/api/backtest-comparisons' });

const start = async () => {
  try {
    fastify.log.info("Checking database connection...");
    await prisma.$connect();
    fastify.log.info("Database connection strictly OK.");

    fastify.log.info("Checking Redis connection...");
    await redis.ping();
    fastify.log.info("Redis connection strictly OK.");

    // Start background job worker
    setupWorker(fastify.log);

    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${env.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
