/** Constants for the conventions module. */

/**
 * Config files checked for convention evidence, in addition to the
 * repo-intel top-ranked source sample. Read via `getFileContents`, which
 * silently skips any that don't exist in this repo.
 */
export const CONVENTION_CONFIG_FILES = [
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  'tsconfig.json',
  'tsconfig.base.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
  'prettier.config.mjs',
] as const;

/** How many top-ranked source files to sample alongside the config files. */
export const CONVENTION_SOURCE_SAMPLE_SIZE = 12;
