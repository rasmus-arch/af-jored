const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { withLock } = require('../scripts/lib/lockfile');

function tempLockPath() {
  return path.join(os.tmpdir(), `af-jored-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}.lock`);
}

test('kör funktionen och tar bort låsfilen efteråt', async () => {
  const lockPath = tempLockPath();
  const result = await withLock(lockPath, async () => 'klart');
  assert.equal(result, 'klart');
  assert.equal(fs.existsSync(lockPath), false);
});

test('tar bort låsfilen även om funktionen kastar fel', async () => {
  const lockPath = tempLockPath();
  await assert.rejects(() => withLock(lockPath, async () => {
    throw new Error('något gick fel');
  }));
  assert.equal(fs.existsSync(lockPath), false);
});

test('nekar en andra körning medan en process med samma pid som låsfilen fortfarande "lever"', async () => {
  const lockPath = tempLockPath();
  // Skriv ett lås som pekar på vår egen process - den lever ju definitivt.
  fs.writeFileSync(lockPath, String(process.pid));

  await assert.rejects(
    () => withLock(lockPath, async () => 'ska aldrig köras'),
    /verkar redan pågå/
  );

  // Låsfilen ska inte ha rörts eftersom vi aldrig fick låset.
  assert.equal(fs.readFileSync(lockPath, 'utf8').trim(), String(process.pid));
  fs.unlinkSync(lockPath);
});

test('tar över ett kvarglömt lås från en process som inte längre lever', async () => {
  const lockPath = tempLockPath();
  // Ett pid som med mycket stor sannolikhet inte är en levande process.
  fs.writeFileSync(lockPath, '999999');

  const result = await withLock(lockPath, async () => 'tog över låset');
  assert.equal(result, 'tog över låset');
  assert.equal(fs.existsSync(lockPath), false);
});
