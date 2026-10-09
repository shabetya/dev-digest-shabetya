import { WebClient } from '@slack/web-api';
import type { Container } from '../../platform/container.js';
import { UsersService } from '../users/service.js';
import { formatReviewMessage } from './helpers.js';

export class NotificationsService {
  private slack = new WebClient(process.env.SLACK_BOT_TOKEN);

  constructor(private container: Container) {}

  async notifyReviewDone(workspaceId: string, reviewId: string) {
    if (!this.container.config.NOTIFICATIONS_ENABLED) return;

    const owner = await new UsersService(this.container).getOwner(workspaceId);
    const review = await this.container.reviewRepo.get(reviewId);

    await this.slack.chat.postMessage({
      channel: owner.slackId,
      text: formatReviewMessage(owner.displayName, review),
    });
  }
}
