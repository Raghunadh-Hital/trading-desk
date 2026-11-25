import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  fyersAppId: process.env.FYERS_APP_ID || '',
  fyersSecretKey: process.env.FYERS_SECRET_KEY || '',
  fyersRedirectUri: process.env.FYERS_REDIRECT_URI || 'http://127.0.0.1:5000/api/auth/callback',
  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '60', 10),
};
