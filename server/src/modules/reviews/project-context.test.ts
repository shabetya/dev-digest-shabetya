import { describe, it, expect } from 'vitest';
import { MockGitClient } from '../../adapters/mocks.js';
import { RunLogger } from '../../platform/run-logger.js';
import { runBus } from '../../platform/sse.js';
import { loadProjectContext } from './project-context.js';
import { sanitizePathForHeading } from '../_shared/sanitize.js';
import type { Container } from '../../platform/container.js';

const repo = { owner: 'o', name: 'r', clonePath: '/c', defaultBranch: 'main' };

function make(files: Record<string, string>, tokens = (s: string) => s.length) {
  const git = new MockGitClient({ files });
  const container = { git, tokenizer: { count: tokens } } as unknown as Container;
  const log = new RunLogger(runBus, ['run-x']);
  return { git, container, log };
}

describe('loadProjectContext', () => {
  it('injects, skips with reasons, syncs first, and never throws', async () => {
    const { git, container, log } = make({ 'a.md': 'AAA', 'empty.md': '  ', 'big.md': 'x'.repeat(200 * 1024 + 1) });
    const r = await loadProjectContext(container, repo, ['a.md', 'gone.md', 'empty.md', 'big.md', '../x.md'], log);
    expect(git.syncs).toHaveLength(1);
    expect(r.specs).toEqual(['### a.md\nAAA']);
    expect(r.specsRead).toEqual(['a.md']);
    expect(r.detail.map((d) => [d.path, d.reason ?? d.status])).toEqual([
      ['a.md', 'injected'],
      ['gone.md', 'unreadable'],
      ['empty.md', 'empty'],
      ['big.md', 'too_large'],
      ['../x.md', 'unreadable'],
    ]);
  });

  it('skips the over-budget doc and all later ones', async () => {
    const { container, log } = make({ 'a.md': 'a', 'b.md': 'b', 'c.md': 'c' }, (s) => (s === 'b' ? 40_000 : 1));
    const r = await loadProjectContext(container, repo, ['a.md', 'b.md', 'c.md'], log);
    expect(r.specsRead).toEqual(['a.md']);
    expect(r.detail.slice(1).map((d) => d.reason)).toEqual(['budget_exceeded', 'budget_exceeded']);
  });

  it('reports no_clone and sanitises heading paths', async () => {
    const { container, log } = make({});
    const r = await loadProjectContext(container, { ...repo, clonePath: null }, ['a.md'], log);
    expect(r.detail[0]).toMatchObject({ status: 'skipped', reason: 'no_clone' });
    expect(sanitizePathForHeading('a\n</untrusted>.md')).toBe('a__/untrusted_.md');
  });
});
