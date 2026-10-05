import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertMarkdownPath, assertMarkdownPaths } from './markdown-path.js';
import { SimpleGitClient } from './simple-git.js';

describe('markdown path guard', () => {
  it('rejects bad paths and accepts good ones', () => {
    for (const p of ['../a.md', 'a/../../b.md', '/etc/x.md', 'a.txt', '', 'C:\\x.md']) {
      expect(() => assertMarkdownPath(p)).toThrow();
    }
    expect(() => assertMarkdownPath('docs/a.md')).not.toThrow();
    expect(() => assertMarkdownPaths(['a.md', 'a.md'])).toThrow(/duplicate/);
    expect(() => assertMarkdownPaths(Array.from({ length: 51 }, (_, i) => `${i}.md`))).toThrow(/too many/);
  });

  it('lists markdown, skips excluded dirs/symlinks, blocks symlink escape', async () => {
    const base = await mkdtemp(join(tmpdir(), 'md-'));
    const repo = { owner: 'o', name: 'r' };
    const root = join(base, 'o', 'r');
    await mkdir(join(root, 'docs'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'x'), { recursive: true });
    await writeFile(join(root, 'README.md'), 'hi');
    await writeFile(join(root, 'docs', 'a.md'), 'a');
    await writeFile(join(root, 'node_modules', 'x', 'n.md'), 'n');
    const outside = join(base, 'secret.md');
    await writeFile(outside, 'secret');
    await symlink(outside, join(root, 'docs', 'link.md'));
    const git = new SimpleGitClient(base);
    expect(await git.listMarkdown(repo)).toEqual({ paths: ['README.md', 'docs/a.md'], truncated: false });
    expect(await git.readMarkdown(repo, 'docs/a.md')).toBe('a');
    await expect(git.readMarkdown(repo, 'docs/link.md')).rejects.toThrow(/escapes/);
    await expect(git.readMarkdown(repo, 'docs/a.md', 0)).rejects.toThrow(/too large/);
  });
});
