import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SecretsProvider } from '../../vendor/shared/adapters.js';

export class LocalSecrets implements SecretsProvider {
  private file = join(homedir(), '.devdigest', 'secrets.json');

  get(name: string): string | undefined {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, string>;
      return data[name] ?? process.env[name];
    } catch {
      return process.env[name];
    }
  }
}
