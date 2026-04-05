// Entry point to start all workers in a single process
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../../.env') });

console.log('Starting all ONSIDE MAM workers...');

await import('./metadata.worker.js');
await import('./thumbnail.worker.js');
await import('./transcode.worker.js');
await import('./ai-analysis.worker.js');

console.log('All workers started');
