import { mkdtemp, mkdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('node:fs/promises');
  vi.resetModules();
});

describe('removing a scratch directory', () => {
  it('deletes the directory and everything in it', async () => {
    const { removeTempDir } = await import('./temp-dir.js');
    const dir = await mkdtemp(join(tmpdir(), 'blocks-tempdir-'));
    await mkdir(join(dir, 'nested'));
    await writeFile(join(dir, 'nested', 'a.txt'), 'x');
    await removeTempDir(dir);
    await expect(stat(dir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('is fine when the directory is already gone', async () => {
    const { removeTempDir } = await import('./temp-dir.js');
    await expect(
      removeTempDir(join(tmpdir(), 'blocks-tempdir-never-existed')),
    ).resolves.toBeUndefined();
  });

  it('never throws, even when the file system refuses (a locked file, a virus scanner)', async () => {
    const rm = vi.fn(async () => {
      throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    });
    vi.doMock('node:fs/promises', () => ({ rm }));
    const { removeTempDir } = await import('./temp-dir.js');
    await expect(removeTempDir('C:/somewhere/scratch')).resolves.toBeUndefined();
    expect(rm).toHaveBeenCalledWith(
      'C:/somewhere/scratch',
      expect.objectContaining({ recursive: true, force: true, maxRetries: 5 }),
    );
  });
});
