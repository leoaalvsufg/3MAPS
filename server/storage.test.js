import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { deleteMap, getMap, listMaps, putMap, mapPath, userMapsDir } from './storage.js';

// Valid UUID v4 values used throughout the tests.
const MAP_ID_1 = '11111111-1111-4111-8111-111111111111';
const MAP_ID_OK = '22222222-2222-4222-8222-222222222222';
const MAP_ID_BROKEN = '33333333-3333-4333-8333-333333333333';

test('storage: put/get/list/delete maps per user (file persistence)', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), '3maps-'));
  process.env.DATA_DIR = tmpRoot;

  const user = 'alice';
  const mapId = MAP_ID_1;
  const now = new Date().toISOString();

  const map = {
    id: mapId,
    title: 'Meu mapa',
    query: 'teste',
    template: 'default',
    mindElixirData: { nodeData: { id: 'root', topic: 'Root', children: [] } },
    article: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
    // graphType omitted on purpose (back-compat)
  };

  const saved = await putMap(user, mapId, map);
  assert.equal(saved.id, mapId);
  assert.equal(saved.graphType, 'mindmap');
	  assert.equal(saved.detailsEnabled, true);

  const file = mapPath(user, mapId);
  const raw = await fs.readFile(file, 'utf8');
  assert.ok(raw.includes(`"id": "${mapId}"`));

  const loaded = await getMap(user, mapId);
  assert.ok(loaded);
  assert.equal(loaded.id, mapId);
  assert.equal(loaded.graphType, 'mindmap');
	  assert.equal(loaded.detailsEnabled, true);

  const list1 = await listMaps(user);
  assert.equal(list1.length, 1);
  assert.equal(list1[0].id, mapId);

	  const updated = await putMap(user, mapId, { ...map, graphType: 'timeline', detailsEnabled: false });
  assert.equal(updated.graphType, 'timeline');
	  assert.equal(updated.detailsEnabled, false);
  const loaded2 = await getMap(user, mapId);
  assert.equal(loaded2.graphType, 'timeline');
	  assert.equal(loaded2.detailsEnabled, false);

  const deleted = await deleteMap(user, mapId);
  assert.equal(deleted, true);
  const after = await getMap(user, mapId);
  assert.equal(after, null);

  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test('storage: listMaps skips corrupted json files (does not throw)', async () => {
	const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), '3maps-'));
	process.env.DATA_DIR = tmpRoot;

	const user = 'bob';
	const now = new Date().toISOString();

	await putMap(user, MAP_ID_OK, {
		id: MAP_ID_OK,
		title: 'Ok',
		query: '',
		template: 'default',
		mindElixirData: { nodeData: { id: 'root', topic: 'Root', children: [] } },
		article: '',
		tags: [],
		createdAt: now,
		updatedAt: now,
	});

	await fs.mkdir(userMapsDir(user), { recursive: true });
	await fs.writeFile(path.join(userMapsDir(user), `${MAP_ID_BROKEN}.json`), '{ this is not json', 'utf8');
	const broken = await getMap(user, MAP_ID_BROKEN);
	assert.equal(broken, null);

	const list = await listMaps(user);
	assert.equal(list.length, 1);
	assert.equal(list[0].id, MAP_ID_OK);

	await fs.rm(tmpRoot, { recursive: true, force: true });
});
