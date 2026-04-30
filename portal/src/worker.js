import { logger } from './logger.js';
import { redis } from './redis.js';

logger.info('worker online; reserved for future async jobs');

setInterval(async () => {
  await redis.ping();
}, 30000);
