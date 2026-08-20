#!/usr/bin/env node

// Launcher for the bulk case importer. Runs the ESM runner through tsx so the
// `@/*` path aliases in jsconfig.json resolve, matching scripts/reingest.js.

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.cjs');
const runner = path.join(__dirname, 'bulk-import-runner.js');

const result = spawnSync(process.execPath, [
  tsxCli,
  '--tsconfig',
  path.join(root, 'jsconfig.json'),
  runner,
  ...process.argv.slice(2),
], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
