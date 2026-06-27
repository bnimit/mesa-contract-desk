import Database from "better-sqlite3";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import { mkdirSync } from "fs";
import { resolve } from "path";

const DB_DIR = resolve(process.cwd(), ".mesa");
const DB_PATH = resolve(DB_DIR, "config.db");

const ENC_KEY = scryptSync("mesa-contract-desk-local", "mesa-salt", 32);

let db: Database.Database;

export function initConfigDb(): void {
  mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("hex");
}

function decrypt(hex: string): string {
  const buf = Buffer.from(hex, "hex");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export function getKey(name: string): string | null {
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get(name) as { value: string } | undefined;
  if (!row) return null;
  return decrypt(row.value);
}

export function setKey(name: string, value: string): void {
  const encrypted = encrypt(value);
  db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)").run(name, encrypted);
}

export function deleteKey(name: string): void {
  db.prepare("DELETE FROM config WHERE key = ?").run(name);
}

export function hasKey(name: string): boolean {
  const row = db.prepare("SELECT 1 FROM config WHERE key = ?").get(name);
  return !!row;
}
