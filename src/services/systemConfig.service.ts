import { AppError } from "../handlers/error";
import {
  SystemConfigRepository,
  ListSystemConfigQuery,
  CreateSystemConfigDTO,
  UpdateSystemConfigDTO,
} from "../repositories/systemConfig.repository";

// ========= CACHE LAYER =========
interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class SimpleCache {
  private cache = new Map<string, CacheItem<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5m

  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl: ttl ?? this.DEFAULT_TTL });
  }
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }
    return item.data as T;
  }
  delete(key: string): void { this.cache.delete(key); }
  clear(): void { this.cache.clear(); }
  invalidatePattern(pattern: string): void {
    for (const k of this.cache.keys()) if (k.includes(pattern)) this.cache.delete(k);
  }
}

// TTLs
const TTL_ITEM = 10 * 60 * 1000;
const TTL_LIST = 5 * 60 * 1000;
const TTL_TYPED = 2 * 60 * 1000;

// Module-scoped instances
const cache = new SimpleCache();
const repo = new SystemConfigRepository();

const performanceLog = (op: string, start: number) => {
  const dur = Date.now() - start;
  if (dur > 1000) console.warn(`🐌 Slow operation: ${op} took ${dur}ms`);
};

const invalidateCaches = (keyStr?: string, id?: number) => {
  if (keyStr) {
    cache.delete(`syscfg:key:${keyStr}`);
    cache.invalidatePattern(`syscfg:typed:${keyStr}`);
  }
  if (typeof id === "number") {
    cache.delete(`syscfg:id:${id}`);
  }
  cache.invalidatePattern("syscfg:list:");
};

// ========== LIST ==========
export async function list(query: ListSystemConfigQuery = {}) {
  const start = Date.now();
  
  try {
    const res = await repo.list(query);
    performanceLog("SystemConfig.list", start);
    return res;
  } catch (error) {
    console.error("Error fetching system config list:", error);
    performanceLog("SystemConfig.list - FAILED", start);
    throw error;
  }
}
// ========== GETTERS ==========
export async function getById(id: number) {
  const start = Date.now();
  const key = `syscfg:id:${id}`;
  const cached = cache.get(key);
  if (cached) {
    console.log(`📋 Cache hit: SystemConfig.getById(${id})`);
    return cached;
  }
  const res = await repo.getById(id);
  cache.set(key, res, TTL_ITEM);
  performanceLog(`SystemConfig.getById(${id})`, start);
  return res;
}

// NOTE: The getByKey, updateByKey, upsertByKey, and deleteByKey methods
// have been removed because the underlying repository no longer supports them.

// ========== CREATE / UPDATE / DELETE ==========
export async function create(data: CreateSystemConfigDTO) {
  const start = Date.now();
  const created = await repo.create(data);
  invalidateCaches(created.key, created.id);
  performanceLog("SystemConfig.create", start);
  return created;
}

export async function updateById(id: number, data: UpdateSystemConfigDTO) {
  console.log("Updating system config with data:", data);
  console.log("ID:", id);
  
  // Validate input
  if (!id || id <= 0) {
    throw new Error("Invalid ID provided");
  }

  const start = Date.now();
  
  try {
    const updated = await repo.updateById(id, data);
    console.log("Updated config:", updated);
    
    // Only invalidate caches if update was successful
    if (updated) {
      invalidateCaches(updated.key, id);
    }
    
    performanceLog(`SystemConfig.updateById(${id})`, start);
    return updated;
  } catch (error) {
    // Log the error with context
    console.error(`Failed to update SystemConfig with ID ${id}:`, error);
    performanceLog(`SystemConfig.updateById(${id}) - FAILED`, start);
    
    // Re-throw the error to let the caller handle it
    throw error;
  }
}
export async function deleteById(id: number) {
  const start = Date.now();
  // Get the key before deleting to invalidate the cache correctly
  const cfg = await repo.getById(id);
  const res = await repo.deleteById(id);
  invalidateCaches(cfg.key, id);
  performanceLog(`SystemConfig.deleteById(${id})`, start);
  return res;
}

// ========== TYPED ACCESSORS ==========
/**
 * Reads a system config value with type-safe parsing and caching.
 */
export async function getValue<T = string>(
  keyStr: string,
  defaultValue?: T,
  parser?: (raw: string) => T,
  options?: { includeExpired?: boolean },
): Promise<T | null> {
  const start = Date.now();
  const ck = `syscfg:typed:${keyStr}:${JSON.stringify({ includeExpired: !!options?.includeExpired })}`;
  const cached = cache.get<T>(ck);
  if (cached !== null) {
    console.log(`📋 Cache hit: SystemConfig.getValue(${keyStr})`);
    return cached;
  }

  const val = await repo.getValue<T>(keyStr, defaultValue, parser, options);

  // Cache the value only if it's not null, to avoid caching a "not found" state
  if (val !== null) {
    cache.set(ck, val, TTL_TYPED);
  }

  performanceLog(`SystemConfig.getValue(${keyStr})`, start);
  return val;
}

export async function getNumber(keyStr: string, def?: number) {
  return getValue<number>(keyStr, def, (raw) => {
    const n = Number(String(raw).trim());
    if (Number.isNaN(n)) {
      if (def !== undefined) return def;
      throw new AppError(
        "Invalid number in SystemConfig",
        [{ message: "Error.SystemConfigInvalidNumber", path: ["value"] }],
        { key: keyStr, raw },
        422,
      );
    }
    return n;
  });
}

export async function getBoolean(keyStr: string, def?: boolean) {
  return getValue<boolean>(keyStr, def, (raw) => {
    const t = String(raw).trim().toLowerCase();
    if (t === "true") return true;
    if (t === "false") return false;
    if (def !== undefined) return def;
    throw new AppError(
      "Invalid boolean in SystemConfig",
      [{ message: "Error.SystemConfigInvalidBoolean", path: ["value"] }],
      { key: keyStr, raw },
      422,
    );
  });
}

export async function getJSON<T = unknown>(keyStr: string, def?: T) {
  return getValue<T>(keyStr, def, (raw) => {
    try {
      return JSON.parse(String(raw)) as T;
    } catch {
      if (def !== undefined) return def;
      throw new AppError(
        "Invalid JSON in SystemConfig",
        [{ message: "Error.SystemConfigInvalidJSON", path: ["value"] }],
        { key: keyStr, raw },
        422,
      );
    }
  });
}

// ========== CACHE CTRL ==========
export function clearCache() {
  cache.clear();
  console.log("🧹 SystemConfigService cache cleared");
}
