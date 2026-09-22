/**
 * Path → SmartDiffRole classification. Pure/deterministic — no DB, no HTTP.
 * `classifyFile` checks roles in a FIXED order (boilerplate → tests → wiring
 * → docs → core-fallback); first match wins. The three cases below are
 * deliberately overlapping paths that pin that ordering down.
 */
import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/modules/reviews/smart-diff/classify.js';

describe('classifyFile — order-sensitivity (deliberate overlaps)', () => {
  it('a snapshot inside __tests__ is boilerplate, not tests — the snapshot rule is checked before the tests rule', () => {
    expect(classifyFile('src/__tests__/__snapshots__/x.snap')).toBe('boilerplate');
  });

  it('a doc inside .claude/ is wiring, not docs — .claude/** is checked before **/*.md', () => {
    expect(classifyFile('.claude/skills/security/SKILL.md')).toBe('wiring');
  });

  it('a README inside e2e/ is tests, not docs — e2e/** (tests) is checked before **/*.md (docs)', () => {
    expect(classifyFile('e2e/README.md')).toBe('tests');
  });
});

describe('classifyFile — boilerplate', () => {
  it.each([
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'server/pnpm-lock.yaml',
    'client/package-lock.json',
    'a.lock',
    'dist/index.js',
    'dist/nested/chunk.js',
    'build/output.css',
    'src/foo.min.js',
    'src/schema.generated.ts',
    'src/__snapshots__/Button.snap',
    'src/components/Button.test.ts.snap',
  ])('%s → boilerplate', (path) => {
    expect(classifyFile(path)).toBe('boilerplate');
  });
});

describe('classifyFile — tests', () => {
  it.each([
    'src/foo.test.ts',
    'src/foo.test.tsx',
    'src/foo.it.test.ts',
    'src/foo.spec.ts',
    'test/helpers/pg.ts',
    'server/test/pulls-status.test.ts',
    'src/modules/reviews/tests/fixture.ts',
    'src/__tests__/Button.tsx',
    'e2e/flows/login.spec.ts',
  ])('%s → tests', (path) => {
    expect(classifyFile(path)).toBe('tests');
  });
});

describe('classifyFile — wiring', () => {
  it.each([
    'src/modules/reviews/index.ts',
    'src/index.js',
    'vite.config.ts',
    'jest.config.js',
    'tsconfig.json',
    'tsconfig.build.json',
    '.eslintrc.json',
    '.eslintrc.js',
    '.env',
    '.env.local',
    'docker-compose.yml',
    'docker-compose.prod.yml',
    '.github/workflows/ci.yml',
    '.claude/skills/security/SKILL.md',
  ])('%s → wiring', (path) => {
    expect(classifyFile(path)).toBe('wiring');
  });
});

describe('classifyFile — docs', () => {
  it.each([
    'README.md',
    'README.txt',
    'CHANGELOG.md',
    'LICENSE',
    'docs/architecture.md',
    'docs/agent-prompts/README.md',
    'server/docs/design.md',
    'src/modules/reviews/README.md',
  ])('%s → docs', (path) => {
    expect(classifyFile(path)).toBe('docs');
  });
});

describe('classifyFile — core (fallback)', () => {
  it.each([
    'src/foo.ts',
    'src/modules/reviews/service.ts',
    'src/modules/reviews/smart-diff/classify.ts',
    'client/src/app/repos/[repoId]/pulls/[number]/page.tsx',
  ])('%s → core', (path) => {
    expect(classifyFile(path)).toBe('core');
  });
});
