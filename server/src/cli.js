import process from 'node:process';
import { backupDatabase, createOwner, hasAnyOwner, initDb } from './db.js';

function readFlag(name) {
  const exact = `--${name}`;
  const pair = `${exact}=`;
  const argument = process.argv.find((value) => value === exact || value.startsWith(pair));

  if (!argument) {
    return '';
  }

  if (argument === exact) {
    const index = process.argv.indexOf(argument);
    return process.argv[index + 1] || '';
  }

  return argument.slice(pair.length);
}

async function main() {
  const command = process.argv[2];

  if (!command || command === 'help' || command === '--help') {
    console.log('Usage: node src/cli.js <init-db|create-owner|backup> [--email value --name value --password value]');
    return;
  }

  if (command === 'init-db') {
    initDb();
    console.log('Database initialized.');
    return;
  }

  if (command === 'create-owner') {
    initDb();

    if (hasAnyOwner()) {
      console.log('An owner account already exists.');
      return;
    }

    const email = (readFlag('email') || process.env.OWNER_EMAIL || '').trim().toLowerCase();
    const name = (readFlag('name') || process.env.OWNER_NAME || '').trim();
    const password = readFlag('password') || process.env.OWNER_PASSWORD || '';

    if (!email || !name || password.length < 8) {
      console.log('Provide --email, --name, and --password (minimum 8 characters).');
      process.exitCode = 1;
      return;
    }

    const owner = createOwner({ email, name, password });
    console.log(`Created owner ${owner.email}.`);
    return;
  }

  if (command === 'backup') {
    initDb();
    const result = await backupDatabase();
    console.log(`Backup created at ${result.destination}`);
    console.log(`Manifest written to ${result.manifestPath}`);
    return;
  }

  console.log(`Unknown command: ${command}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
