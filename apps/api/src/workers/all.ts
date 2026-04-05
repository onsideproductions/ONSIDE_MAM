// Entry point to start all workers in a single process
import 'dotenv/config';

console.log('Starting all ONSIDE MAM workers...');

await import('./metadata.worker.js');
await import('./thumbnail.worker.js');
await import('./transcode.worker.js');
await import('./ai-analysis.worker.js');

console.log('All workers started');
