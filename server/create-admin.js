#!/usr/bin/env node
/**
 * server/create-admin.js
 *
 * CLI script to create or promote a user to admin.
 *
 * Usage:
 *   node server/create-admin.js <username> <password>
 *   node server/create-admin.js --promote <username>
 *
 * Examples:
 *   node server/create-admin.js admin senha123
 *   node server/create-admin.js --promote existinguser
 */

import { createUser, getUser, updateUser, validateAuthUsername, validatePassword } from './users.js';
import { getDb } from './db.js';

const args = process.argv.slice(2);

async function main() {
  // Initialize DB
  getDb();

  if (args[0] === '--promote') {
    // Promote existing user to admin
    const username = args[1];
    if (!username) {
      console.error('Usage: node server/create-admin.js --promote <username>');
      process.exit(1);
    }

    const user = await getUser(username);
    if (!user) {
      console.error(`User "${username}" not found.`);
      process.exit(1);
    }

    await updateUser(username, { isAdmin: true, plan: 'admin' });
    console.log(`✅ User "${username}" promoted to admin.`);
    process.exit(0);
  }

  // Create new admin user
  const [username, password] = args;

  if (!username || !password) {
    console.error('Usage: node server/create-admin.js <username> <password>');
    console.error('       node server/create-admin.js --promote <username>');
    process.exit(1);
  }

  try {
    validateAuthUsername(username);
    validatePassword(password);
  } catch (err) {
    console.error(`Validation error: ${err.message}`);
    process.exit(1);
  }

  // Check if user already exists
  const existing = await getUser(username);
  if (existing) {
    // Promote existing user
    await updateUser(username, { isAdmin: true, plan: 'admin' });
    console.log(`✅ Existing user "${username}" promoted to admin.`);
    process.exit(0);
  }

  // Create new admin user
  try {
    await createUser(username, password, { isAdmin: true, plan: 'admin' });
    console.log(`✅ Admin user "${username}" created successfully.`);
    console.log(`   Username: ${username}`);
    console.log(`   Plan: admin`);
    console.log(`   Login at: http://localhost:5173/auth`);
  } catch (err) {
    console.error(`Failed to create admin user: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
