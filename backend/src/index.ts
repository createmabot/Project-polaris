import Fastify from 'fastify';

const fastify = Fastify({
  logger: true
});

fastify.get('/health', async (request, reply) => {
  return reply.status(200).send({ status: 'ok' });
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
