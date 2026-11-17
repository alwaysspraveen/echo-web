// Room storage. On Vercel: Upstash Redis (shared by every function instance). Locally, or when
// no Redis is configured: an in-memory map (fine for a single process).
import { Redis } from '@upstash/redis';
import type { Room } from './room.js';

export interface Store {
  get(code: string): Promise<Room | null>;
  /** Cheap check used while long-polling. */
  version(code: string): Promise<number | null>;
  /** Creates the room if the code is free. */
  create(room: Room): Promise<boolean>;
  /** Read-modify-write under a short lock. `fn` returns false to skip saving. */
  update(code: string, fn: (room: Room) => boolean | Promise<boolean>): Promise<Room | null>;
  remove(code: string): Promise<void>;
}

const TTL_SECONDS = 12 * 60 * 60; // rooms expire 12h after the last change

class MemoryStore implements Store {
  private rooms = new Map<string, { room: Room; expires: number }>();
  private live(code: string) {
    const e = this.rooms.get(code);
    if (e && e.expires < Date.now()) { this.rooms.delete(code); return undefined; }
    return e;
  }
  async get(code: string) { const e = this.live(code); return e ? structuredClone(e.room) : null; }
  async version(code: string) { return this.live(code)?.room.version ?? null; }
  async create(room: Room) {
    if (this.live(room.code)) return false;
    this.rooms.set(room.code, { room: structuredClone(room), expires: Date.now() + TTL_SECONDS * 1000 });
    return true;
  }
  async update(code: string, fn: (room: Room) => boolean | Promise<boolean>) {
    const e = this.live(code);
    if (!e) return null;
    const room = structuredClone(e.room);
    if (await fn(room)) {
      room.version++;
      this.rooms.set(code, { room, expires: Date.now() + TTL_SECONDS * 1000 });
    }
    return structuredClone(room);
  }
  async remove(code: string) { this.rooms.delete(code); }
}

class RedisStore implements Store {
  constructor(private redis: Redis) {}
  private key = (c: string) => `jam:${c}`;
  private vkey = (c: string) => `jam:${c}:v`;
  async get(code: string) { return (await this.redis.get<Room>(this.key(code))) ?? null; }
  async version(code: string) {
    const v = await this.redis.get<number>(this.vkey(code));
    return v == null ? null : Number(v);
  }
  async create(room: Room) {
    const ok = await this.redis.set(this.key(room.code), room, { nx: true, ex: TTL_SECONDS });
    if (ok) await this.redis.set(this.vkey(room.code), room.version, { ex: TTL_SECONDS });
    return !!ok;
  }
  async update(code: string, fn: (room: Room) => boolean | Promise<boolean>) {
    const lock = `jam:${code}:lock`;
    // Short spin lock so two members' changes never overwrite each other.
    for (let i = 0; i < 40; i++) {
      if (await this.redis.set(lock, '1', { nx: true, px: 3000 })) break;
      if (i === 39) throw new Error('Room is busy, try again');
      await new Promise((r) => setTimeout(r, 50));
    }
    try {
      const room = await this.get(code);
      if (!room) return null;
      if (await fn(room)) {
        room.version++;
        await this.redis.set(this.key(code), room, { ex: TTL_SECONDS });
        await this.redis.set(this.vkey(code), room.version, { ex: TTL_SECONDS });
      }
      return room;
    } finally {
      await this.redis.del(lock);
    }
  }
  async remove(code: string) { await this.redis.del(this.key(code), this.vkey(code)); }
}

let store: Store | null = null;
export function getStore(): Store {
  if (store) return store;
  // Vercel's Upstash integration sets KV_REST_API_*; plain Upstash uses UPSTASH_REDIS_REST_*.
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  store = url && token ? new RedisStore(new Redis({ url, token })) : new MemoryStore();
  return store;
}
export const usingRedis = () => !!(process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL);
