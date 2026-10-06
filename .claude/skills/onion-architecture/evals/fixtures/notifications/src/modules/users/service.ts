import type { Container } from '../../platform/container.js';

export interface WorkspaceOwner {
  id: string;
  displayName: string;
  slackId: string;
}

export class UsersService {
  constructor(private container: Container) {}

  async getOwner(workspaceId: string): Promise<WorkspaceOwner> {
    return this.container.usersRepo.findOwner(workspaceId);
  }
}
