// Runs every flow against a fresh local database. GL=1 also runs the WebGL design pass.
import { spawnSync } from 'node:child_process';
import { resetDb } from './lib.mjs';

const flows = ['flow', 'memories', 'intentions', 'perspectives', 'phase_e', 'export_photos', 'noemail'];
if (process.env.GL === '1') flows.push('design');

let failed = 0;
for (const name of flows) {
  await resetDb();
  process.stdout.write(`${name} … `);
  const run = spawnSync('node', [`${name}.mjs`], { cwd: import.meta.dirname, encoding: 'utf8', timeout: 600_000 });
  const ok = run.status === 0 && /errors: none/.test(run.stdout);
  console.log(ok ? 'ok' : 'FAILED');
  if (!ok) {
    failed++;
    console.log(run.stdout.slice(-2000), run.stderr.slice(-2000));
  }
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
