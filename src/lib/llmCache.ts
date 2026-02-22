/**
 * In-memory LRU cache for LLM responses.
 * Max 50 entries, 30-minute TTL.
 */

const MAX_ENTRIES = 50;
const TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  value: string;
  expiresAt: number;
}

// Doubly-linked list node for O(1) LRU operations
interface LRUNode {
  key: string;
  entry: CacheEntry;
  prev: LRUNode | null;
  next: LRUNode | null;
}

class LRUCache {
  private map = new Map<string, LRUNode>();
  private head: LRUNode | null = null; // most recently used
  private tail: LRUNode | null = null; // least recently used
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): string | null {
    const node = this.map.get(key);
    if (!node) return null;

    // Check TTL
    if (Date.now() > node.entry.expiresAt) {
      this.remove(node);
      return null;
    }

    // Move to front (most recently used)
    this.moveToFront(node);
    return node.entry.value;
  }

  set(key: string, value: string): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.entry = { value, expiresAt: Date.now() + TTL_MS };
      this.moveToFront(existing);
      return;
    }

    const node: LRUNode = {
      key,
      entry: { value, expiresAt: Date.now() + TTL_MS },
      prev: null,
      next: this.head,
    };

    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;

    this.map.set(key, node);

    // Evict LRU entry if over capacity
    if (this.map.size > this.maxSize && this.tail) {
      this.remove(this.tail);
    }
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  private moveToFront(node: LRUNode): void {
    if (node === this.head) return;

    // Detach
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.tail) this.tail = node.prev;

    // Attach at front
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
  }

  private remove(node: LRUNode): void {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.head) this.head = node.next;
    if (node === this.tail) this.tail = node.prev;
    this.map.delete(node.key);
  }
}

const cache = new LRUCache(MAX_ENTRIES);

/**
 * djb2 hash function — fast, good distribution for short strings.
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep as unsigned 32-bit
  }
  return hash.toString(36);
}

/**
 * Generate a deterministic cache key from provider, model, and messages.
 */
export function generateCacheKey(
  provider: string,
  model: string,
  messages: Array<{ role: string; content: string }>
): string {
  const raw = `${provider}:${model}:${JSON.stringify(messages)}`;
  return djb2Hash(raw);
}

/**
 * Retrieve a cached LLM response. Returns null on miss or expiry.
 */
export function getCachedResponse(key: string): string | null {
  return cache.get(key);
}

/**
 * Store an LLM response in the cache.
 */
export function setCachedResponse(key: string, value: string): void {
  cache.set(key, value);
}

/**
 * Clear all cached entries.
 */
export function clearCache(): void {
  cache.clear();
}
