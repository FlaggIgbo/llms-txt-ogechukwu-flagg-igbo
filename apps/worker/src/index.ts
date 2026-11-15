import { startGenerateConsumer } from './consumers/generateConsumer.js';

console.log('[Worker] Starting async queue consumer for llms.txt generation...');
startGenerateConsumer();
