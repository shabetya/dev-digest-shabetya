import type { FastifyRequest } from 'fastify';
import type { Container } from '../../platform/container.js';

export function getContext(container: Container, req: FastifyRequest) {
  const workspaceId = container.auth.resolveWorkspace(req.headers);
  return { workspaceId };
}
