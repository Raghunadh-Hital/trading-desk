import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.VELA_DATA_DIR || path.resolve(__dirname, '..');
const TOKEN_FILE = path.resolve(DATA_DIR, '.token.json');
const CREDENTIALS_FILE = path.resolve(DATA_DIR, '.credentials.json');

export interface TokenData {
  accessToken: string;
  updatedAt: string;
}

export interface CredentialsData {
  appId: string;
  secretKey: string;
  redirectUri?: string;
  updatedAt?: string;
}

let inMemoryToken: string | null = null;
let inMemoryCredentials: CredentialsData | null = null;

export function getStoredCredentials(): CredentialsData | null {
  if (inMemoryCredentials) {
    return inMemoryCredentials;
  }
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      const content = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
      inMemoryCredentials = JSON.parse(content);
      return inMemoryCredentials;
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

export function saveStoredCredentials(creds: CredentialsData): void {
  inMemoryCredentials = creds;
  try {
    fs.writeFileSync(
      CREDENTIALS_FILE,
      JSON.stringify({ ...creds, updatedAt: new Date().toISOString() }, null, 2),
      'utf-8'
    );
  } catch {
    // Ignore write errors
  }
}

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

export function clearStoredCredentials(): void {
  inMemoryCredentials = null;
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
  } catch {
    // Ignore
  }
}

