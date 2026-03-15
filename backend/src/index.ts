import Fastify from 'fastify';
import { prisma } from './db';
import { redis } from './redis';
import { env } from './env';

const fastify = Fastify({
  logger: true
});

fastify.get('/health', async (request, reply) => {
  return reply.status(200).send({ status: 'ok', env: env.APP_ENV });
});

const start = async () => {
  try {
    fastify.log.info("Checking database connection...");
    await prisma.$connect();
    fastify.log.info("Database connection strictly OK.");

    fastify.log.info("Checking Redis connection...");
    await redis.ping();
    fastify.log.info("Redis connection strictly OK.");

    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${env.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
