/**
 * Facade for the team workspaces repository modules.
 * Domain code lives in ./teamWorkspaces/*; existing import paths stay stable.
 */
export * from './teamWorkspaces/contract.js';
export { MockTeamWorkspacesRepository } from './teamWorkspaces/mockRepository.js';
export { PgTeamWorkspacesRepository } from './teamWorkspaces/pgRepository.js';
