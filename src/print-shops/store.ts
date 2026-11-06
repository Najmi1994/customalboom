import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashPassword } from "./crypto";
import { DEFAULT_SUPPORT_SETTINGS, styleStoreSchema, type StyleStore } from "./domain";

const STORE_KEY = "style.asp";
export const LOGO_PREFIX = "print-shop-logos/";

export class StoreUnavailableError extends Error {}
export class StoreConflictError extends Error {}

export type StoreSnapshot = { data: StyleStore; etag: string };

type PutOptions = {
  onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string };
  httpMetadata?: { contentType?: string; cacheControl?: string };
};

type StoredObject = {
  body: ArrayBuffer;
  etag: string;
  httpEtag: string;
  json<T>(): Promise<T>;
  arrayBuffer(): Promise<ArrayBuffer>;
  writeHttpMetadata(headers: Headers): void;
};

function dataRoot(): string {
  return path.resolve(process.env.CUSTOMALBOOM_DATA_DIR?.trim() || path.join(process.cwd(), ".data"));
}

function objectPath(key: string): string {
  const root = dataRoot();
  const resolved = path.resolve(root, ...key.replaceAll("\\", "/").split("/").filter(Boolean));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new StoreUnavailableError("Invalid storage object key.");
  }
  return resolved;
}

function toBytes(value: string | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(value);
}

function etagFor(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readObject(key: string): Promise<StoredObject | null> {
  try {
    const buffer = await readFile(objectPath(key));
    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const body = bytes.slice().buffer;
    const etag = etagFor(bytes);
    return {
      body,
      etag,
      httpEtag: `"${etag}"`,
      async json<T>() { return JSON.parse(new TextDecoder().decode(bytes)) as T; },
      async arrayBuffer() { return body.slice(0); },
      writeHttpMetadata() {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new StoreUnavailableError(`Unable to read local storage object: ${(error as Error).message}`);
  }
}

let writeQueue: Promise<void> = Promise.resolve();

async function serialiseWrite<T>(operation: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const turn = new Promise<void>(resolve => { release = resolve; });
  const previous = writeQueue;
  writeQueue = previous.then(() => turn, () => turn);
  await previous;
  try { return await operation(); } finally { release(); }
}

const localObjectStore = {
  get: readObject,

  async put(key: string, value: string | ArrayBuffer | ArrayBufferView, options: PutOptions = {}) {
    return serialiseWrite(async () => {
      const current = await readObject(key);
      if (options.onlyIf?.etagMatches && current?.etag !== options.onlyIf.etagMatches) return null;
      if (options.onlyIf?.etagDoesNotMatch === "*" && current) return null;

      const destination = objectPath(key);
      const bytes = toBytes(value);
      await mkdir(path.dirname(destination), { recursive: true });
      const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, bytes);
        await rename(temporary, destination);
      } catch (error) {
        await unlink(temporary).catch(() => {});
        throw new StoreUnavailableError(`Unable to write local storage object: ${(error as Error).message}`);
      }
      return readObject(key);
    });
  },

  async delete(key: string) {
    return serialiseWrite(async () => {
      await unlink(objectPath(key)).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
    });
  },
};

export function getPrintShopBucket() { return localObjectStore; }

async function parseObject(object: StoredObject): Promise<StoreSnapshot> {
  const parsed = styleStoreSchema.safeParse(await object.json<unknown>());
  if (!parsed.success) throw new StoreUnavailableError("style.asp contains invalid JSON data.");
  return { data: parsed.data, etag: object.etag };
}

export async function readStyleStore(): Promise<StoreSnapshot | null> {
  const object = await getPrintShopBucket().get(STORE_KEY);
  return object ? parseObject(object) : null;
}

export async function ensureStyleStore(): Promise<StoreSnapshot> {
  const existing = await readStyleStore();
  if (existing) return existing;
  const username = process.env.KINGKONG_USERNAME?.trim();
  const password = process.env.KINGKONG_PASSWORD;
  if (!username || !password) throw new StoreUnavailableError("KINGKONG_USERNAME and KINGKONG_PASSWORD are required to initialise style.asp.");

  const data: StyleStore = {
    version: 1,
    revision: 0,
    auth: { username, password: await hashPassword(password) },
    supportSettings: DEFAULT_SUPPORT_SETTINGS,
    shops: [],
    templateCategories: [],
    templates: [],
    googleFonts: [],
    infoBanners: [],
  };
  const created = await getPrintShopBucket().put(STORE_KEY, JSON.stringify(data), {
    onlyIf: { etagDoesNotMatch: "*" },
  });
  if (created) return { data, etag: created.etag };
  const raced = await readStyleStore();
  if (!raced) throw new StoreUnavailableError("style.asp could not be initialised.");
  return raced;
}

export async function writeStyleStore(snapshot: StoreSnapshot, next: StyleStore): Promise<StoreSnapshot> {
  if (snapshot.data.revision !== next.revision - 1) throw new StoreConflictError("The shop list changed in another tab. Reload and try again.");
  const saved = await getPrintShopBucket().put(STORE_KEY, JSON.stringify(next), {
    onlyIf: { etagMatches: snapshot.etag },
  });
  if (!saved) throw new StoreConflictError("The shop list changed in another tab. Reload and try again.");
  return { data: next, etag: saved.etag };
}

export function nextStore(snapshot: StoreSnapshot, shops: StyleStore["shops"]): StyleStore {
  return { ...snapshot.data, revision: snapshot.data.revision + 1, shops };
}

export function nextStorePatch(snapshot: StoreSnapshot, patch: Partial<Pick<StyleStore, "shops" | "adminContactPhone" | "supportSettings" | "templateCategories" | "templates" | "googleFonts" | "infoBanners">>): StyleStore {
  return { ...snapshot.data, ...patch, revision: snapshot.data.revision + 1 };
}
