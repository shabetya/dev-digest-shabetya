import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { buildAgentManifestYaml, buildCiFiles, buildWorkflowYaml } from './templates.js';
import type { Agent, CiExportInput } from '@devdigest/shared';

const AGENT: Agent = {
  id: 'a1',
  name: 'Security Reviewer',
  description: '',
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  system_prompt: 'Review for security issues.',
  enabled: true,
  version: 1,
  strategy: 'auto',
  ci_fail_on: 'critical',
  repo_intel: true,
};

const INPUT: CiExportInput = {
  repo: 'acme/payments-api',
  target: 'gha',
  action: 'files',
  post_as: 'github_review',
  triggers: ['opened', 'synchronize'],
  base: 'main',
};

describe('buildWorkflowYaml (AC-3, AC-4, AC-21)', () => {
  it('declares exactly contents:read + pull-requests:write, pull_request-only trigger, and pinned action tags', () => {
    const yamlText = buildWorkflowYaml({
      devdigestRepo: 'acme/devdigest',
      pinnedSha: 'deadbeef',
      agentSlug: 'security-reviewer',
      triggers: INPUT.triggers,
      postAs: INPUT.post_as,
    });
    const doc = parseYaml(yamlText) as {
      on: Record<string, unknown>;
      permissions: Record<string, string>;
      jobs: { review: { steps: { uses?: string }[] } };
    };

    // AC-3: exactly these two scopes.
    expect(doc.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });

    // AC-4: pull_request only, never pull_request_target.
    expect(Object.keys(doc.on)).toEqual(['pull_request']);
    expect(yamlText).not.toContain('pull_request_target');

    // AC-21: every `uses:` is pinned to a major-version tag matching evals.yml.
    const usesLines = doc.jobs.review.steps.map((s) => s.uses).filter(Boolean) as string[];
    expect(usesLines).toEqual(['actions/checkout@v4', 'actions/checkout@v4', 'actions/setup-node@v4', 'actions/upload-artifact@v4']);
  });

  it('never lets a crafted repo string inject extra YAML structure (A05 content-injection)', () => {
    // A devdigestRepo value containing YAML-breaking characters must stay a
    // single scalar string value, never parse into a second permissions key.
    const malicious = 'acme/x\npermissions:\n  contents: write';
    const yamlText = buildWorkflowYaml({
      devdigestRepo: malicious,
      pinnedSha: 'deadbeef',
      agentSlug: 'security-reviewer',
      triggers: INPUT.triggers,
      postAs: INPUT.post_as,
    });
    const doc = parseYaml(yamlText) as { permissions: Record<string, string> };
    expect(doc.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
  });
});

describe('buildAgentManifestYaml', () => {
  it('round-trips a system_prompt containing YAML-breaking characters safely', () => {
    const tricky: Agent = {
      ...AGENT,
      name: 'Name: with colon\n---\nand a document break',
      system_prompt: 'Line one\nkey: value\n- not a list item, just text',
    };
    const yamlText = buildAgentManifestYaml(tricky, []);
    const parsed = parseYaml(yamlText.split('\n').slice(1).join('\n')) as { name: string; system_prompt: string };
    expect(parsed.name).toBe(tricky.name);
    expect(parsed.system_prompt).toBe(tricky.system_prompt);
  });
});

describe('buildCiFiles (AC-2)', () => {
  it('generates the manifest, one skill file per linked skill, memory.jsonl, and the workflow — all editable', () => {
    const files = buildCiFiles({
      agent: AGENT,
      agentSlug: 'security-reviewer',
      skills: [{ slug: 'secrets-scan', name: 'Secrets Scan', body: 'Flag hardcoded secrets.' }],
      input: INPUT,
      devdigestRepo: 'acme/devdigest',
      pinnedSha: 'deadbeef',
    });
    const paths = files.map((f) => f.path);
    expect(paths).toEqual([
      '.devdigest/agents/security-reviewer.yaml',
      '.devdigest/skills/secrets-scan.md',
      '.devdigest/memory.jsonl',
      '.github/workflows/devdigest-review.yml',
    ]);
    expect(files.every((f) => f.editable)).toBe(true);
  });

  it('generates no skill files for an agent with zero linked skills', () => {
    const files = buildCiFiles({
      agent: AGENT,
      agentSlug: 'security-reviewer',
      skills: [],
      input: INPUT,
      devdigestRepo: 'acme/devdigest',
      pinnedSha: 'deadbeef',
    });
    expect(files.some((f) => f.path.startsWith('.devdigest/skills/'))).toBe(false);
  });

  it('uses workflow_yaml_override verbatim when present, and the generated default when absent (Fix A / AC-2)', () => {
    const overrideYaml = 'name: Custom Workflow\non:\n  pull_request: {}\n';
    const withOverride = buildCiFiles({
      agent: AGENT,
      agentSlug: 'security-reviewer',
      skills: [],
      input: { ...INPUT, workflow_yaml_override: overrideYaml },
      devdigestRepo: 'acme/devdigest',
      pinnedSha: 'deadbeef',
    });
    const overriddenFile = withOverride.find((f) => f.path === '.github/workflows/devdigest-review.yml');
    expect(overriddenFile?.contents).toBe(overrideYaml);

    const withoutOverride = buildCiFiles({
      agent: AGENT,
      agentSlug: 'security-reviewer',
      skills: [],
      input: INPUT,
      devdigestRepo: 'acme/devdigest',
      pinnedSha: 'deadbeef',
    });
    const defaultFile = withoutOverride.find((f) => f.path === '.github/workflows/devdigest-review.yml');
    expect(defaultFile?.contents).not.toBe(overrideYaml);
    expect(defaultFile?.contents).toContain('permissions:');
  });

  it('falls back to the generated default when workflow_yaml_override is empty/whitespace-only, and never crashes on non-YAML garbage', () => {
    const blank = buildCiFiles({
      agent: AGENT,
      agentSlug: 'security-reviewer',
      skills: [],
      input: { ...INPUT, workflow_yaml_override: '   ' },
      devdigestRepo: 'acme/devdigest',
      pinnedSha: 'deadbeef',
    });
    expect(blank.find((f) => f.path === '.github/workflows/devdigest-review.yml')?.contents).toContain(
      'permissions:',
    );

    const garbage = 'not: valid: yaml: at: all: ::: ???';
    expect(() =>
      buildCiFiles({
        agent: AGENT,
        agentSlug: 'security-reviewer',
        skills: [],
        input: { ...INPUT, workflow_yaml_override: garbage },
        devdigestRepo: 'acme/devdigest',
        pinnedSha: 'deadbeef',
      }),
    ).not.toThrow();
  });
});
