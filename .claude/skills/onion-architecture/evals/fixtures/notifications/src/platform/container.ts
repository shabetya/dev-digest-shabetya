import type { AppConfig } from './config.js';
import type { SecretsProvider } from '../vendor/shared/adapters.js';
import { LocalSecrets } from '../adapters/secrets/local.js';
import { ReviewRepository } from '../modules/reviews/repository.js';

export interface ContainerOverrides {
  secrets?: SecretsProvider;
  reviewRepo?: ReviewRepository;
}

export class Container {
  constructor(
    readonly config: AppConfig,
    private overrides: ContainerOverrides = {},
  ) {}

  get secrets(): SecretsProvider {
    return this.overrides.secrets ?? new LocalSecrets();
  }

  get reviewRepo(): ReviewRepository {
    return this.overrides.reviewRepo ?? new ReviewRepository();
  }
}
