import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('artefactos estáticos do deploy', () => {
  it('o build valida os módulos publicados do LUS-222', () => {
    const result = spawnSync('npm', ['run', 'build', '--silent'], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});
