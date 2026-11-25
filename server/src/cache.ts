import NodeCache from 'node-cache';
import { config } from './config.js';

export const historyCache = new NodeCache({
  stdTTL: config.cacheTtlSeconds,
  checkperiod: 120,
  useClones: false,
});
