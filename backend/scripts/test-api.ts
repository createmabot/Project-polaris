import Fastify from 'fastify';
import { homeRoutes } from '../src/routes/home';
import { alertRoutes } from '../src/routes/alerts';
import { prisma } from '../src/db';
import { errorHandler } from '../src/utils/response';

async function testRoutes() {
  const fastify = Fastify();
  fastify.setErrorHandler(errorHandler);
  fastify.register(homeRoutes, { prefix: '/api/home' });
  fastify.register(alertRoutes, { prefix: '/api/alerts' });

  // Start DB 
  await prisma.$connect();

  console.log("=== Testing GET /api/home ===");
  const homeRes = await fastify.inject({
    method: 'GET',
    url: '/api/home'
  });
  console.log("Status:", homeRes.statusCode);
  console.log("Response:", JSON.stringify(homeRes.json(), null, 2));

  // Find an alert to test alerts detail
  const alert = await prisma.alertEvent.findFirst({
    orderBy: { receivedAt: 'desc' }
  });

  if (alert) {
    console.log(`\n=== Testing GET /api/alerts/${alert.id} ===`);
    const alertRes = await fastify.inject({
      method: 'GET',
      url: `/api/alerts/${alert.id}`
    });
    console.log("Status:", alertRes.statusCode);
    console.log("Response:", JSON.stringify(alertRes.json(), null, 2));
  }

  // Test 404
  console.log(`\n=== Testing GET /api/alerts/nonexistent ===`);
  const notFoundRes = await fastify.inject({
    method: 'GET',
    url: '/api/alerts/invalid-id-that-doesnt-exist'
  });
  console.log("Status:", notFoundRes.statusCode);
  console.log("Response:", JSON.stringify(notFoundRes.json(), null, 2));

  await prisma.$disconnect();
  await fastify.close();
}

testRoutes().catch(console.error);
