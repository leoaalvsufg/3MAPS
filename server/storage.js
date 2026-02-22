import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Alphanumeric, hyphens, underscores only; max 50 characters.
const USERNAME_RE = /^[a-zA-Z0-9_-]{1,50}$/;
// UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
const MAP_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Maximum number of backup copies to keep per map. */
const MAX_BACKUPS = 3;

export function validateUsername(username) {
  if (typeof username !== 'string') throw new Error('Invalid username');
  const u = username.trim();
  if (!USERNAME_RE.test(u)) throw new Error('Invalid username: only alphanumeric characters, hyphens, and underscores are allowed (max 50 chars)');
  return u;
}

export function validateMapId(mapId) {
  if (typeof mapId !== 'string') throw new Error('Invalid map id');
  const id = mapId.trim();
  if (!MAP_ID_RE.test(id)) throw new Error('Invalid map id: must be a valid UUID');
  return id;
}

export function getDataDir() {
  // Default inside repo. Can be overridden for deployments/tests.
  return process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve('data');
}

export function userMapsDir(username) {
  const u = validateUsername(username);
  return path.join(getDataDir(), 'users', u, 'maps');
}

export function mapPath(username, mapId) {
  const id = validateMapId(mapId);
  return path.join(userMapsDir(username), `${id}.json`);
}

/**
 * Returns the path to the backups directory for a given user.
 */
export function backupsDir(username) {
  return path.join(userMapsDir(username), '.backups');
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function atomicWriteFile(filePath, content) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tmpName = `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const tmpPath = path.join(dir, tmpName);

  await fs.writeFile(tmpPath, content, 'utf8');

  try {
    // On Windows, rename over an existing file can fail; remove first.
    await fs.rm(filePath, { force: true });
  } catch {
    // ignore
  }

  await fs.rename(tmpPath, filePath);
}

/**
 * Create a backup of an existing map file before overwriting it.
 * Backup files are stored at: data/users/{username}/maps/.backups/{id}_{timestamp}.json
 * Only the last MAX_BACKUPS backups are kept; older ones are deleted.
 */
async function createBackup(username, mapId) {
  const source = mapPath(username, mapId);

  // Check if the file exists before trying to back it up
  try {
    await fs.access(source);
  } catch {
    // File doesn't exist yet — nothing to back up
    return;
  }

  const dir = backupsDir(username);
  await ensureDir(dir);

  const timestamp = Date.now();
  const backupName = `${mapId}_${timestamp}.json`;
  const backupPath = path.join(dir, backupName);

  try {
    await fs.copyFile(source, backupPath);
  } catch {
    // Non-critical: if backup fails, continue with the write
    return;
  }

  // Prune old backups for this map — keep only the last MAX_BACKUPS
  await pruneBackups(username, mapId);
}

/**
 * Delete old backups for a map, keeping only the most recent MAX_BACKUPS.
 */
async function pruneBackups(username, mapId) {
  const dir = backupsDir(username);
  try {
    const files = await fs.readdir(dir);
    // Filter to backups for this specific map
    const prefix = `${mapId}_`;
    const mapBackups = files
      .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
      .sort(); // lexicographic sort works because timestamps are numeric

    if (mapBackups.length > MAX_BACKUPS) {
      const toDelete = mapBackups.slice(0, mapBackups.length - MAX_BACKUPS);
      for (const f of toDelete) {
        try {
          await fs.rm(path.join(dir, f), { force: true });
        } catch {
          // ignore individual deletion errors
        }
      }
    }
  } catch {
    // If the backups dir doesn't exist yet, nothing to prune
  }
}

export async function listMaps(username) {
  const dir = userMapsDir(username);
  try {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    const maps = [];
    for (const f of jsonFiles) {
      const id = f.replace(/\.json$/i, '');
      try {
        const m = await getMap(username, id);
        if (m) maps.push(m);
      } catch {
        // If a single file is corrupted/unreadable, skip it instead of failing the whole list.
      }
    }
    // Newest first
    maps.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return maps;
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function getMap(username, mapId) {
  const file = mapPath(username, mapId);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    // Back-compat defaults
    if (!parsed.graphType) parsed.graphType = 'mindmap';
    if (!Array.isArray(parsed.tags)) parsed.tags = [];
	    if (typeof parsed.detailsEnabled !== 'boolean') parsed.detailsEnabled = true;
    return parsed;
  } catch (err) {
    // If the JSON is corrupted, treat as missing instead of crashing the API (prevents 500).
    if (err && typeof err === 'object' && 'name' in err && err.name === 'SyntaxError') return null;
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function putMap(username, mapId, mapObject) {
  const file = mapPath(username, mapId);

  // Create a backup of the existing file before overwriting
  await createBackup(username, mapId);

  const toSave = {
    ...mapObject,
    id: mapId,
	    graphType: mapObject?.graphType ?? 'mindmap',
	    detailsEnabled: mapObject?.detailsEnabled ?? true,
  };
  const json = JSON.stringify(toSave, null, 2);
  await atomicWriteFile(file, json);
  return toSave;
}

export async function deleteMap(username, mapId) {
  const file = mapPath(username, mapId);
  try {
    await fs.rm(file, { force: true });
    return true;
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return false;
    throw err;
  }
}

/**
 * List all backup files for a given map.
 * Returns an array of objects with { filename, timestamp } sorted newest first.
 */
export async function listBackups(username, mapId) {
  const id = validateMapId(mapId);
  const dir = backupsDir(username);
  try {
    const files = await fs.readdir(dir);
    const prefix = `${id}_`;
    const backups = files
      .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
      .map((f) => {
        const tsStr = f.slice(prefix.length, -'.json'.length);
        const timestamp = parseInt(tsStr, 10);
        return { filename: f, timestamp: isNaN(timestamp) ? 0 : timestamp };
      })
      .sort((a, b) => b.timestamp - a.timestamp); // newest first
    return backups;
  } catch {
    return [];
  }
}
