import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_FILE = path.resolve(__dirname, '../.token.json');

export interface TokenData {
  accessToken: string;
  updatedAt: string;
}

let inMemoryToken: string | null = null;

export function getStoredToken(): string | null {
  if (inMemoryToken) {
    return inMemoryToken;
  }
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const content = fs.readFileSync(TOKEN_FILE, 'utf-8');
      const data: TokenData = JSON.parse(content);
      inMemoryToken = data.accessToken;
      return inMemoryToken;
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

export function saveStoredToken(accessToken: string): void {
  inMemoryToken = accessToken;
  try {
    const data: TokenData = {
      accessToken,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Ignore write errors
  }
}

export function clearStoredToken(): void {
  inMemoryToken = null;
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
  } catch {
    // Ignore
  }
}
