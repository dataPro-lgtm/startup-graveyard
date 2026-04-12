import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { TeamWorkspaceAdminMetrics } from '@sg/shared/schemas/adminStats';
import type { UserProfile, WorkspaceAccess } from '@sg/shared/schemas/auth';
import {
  resolveEntitlements,
  resolveTeamWorkspaceSeatLimit,
  type BillingStatus,
  type SubscriptionTier,
} from '@sg/shared/billing';
import type {
  TeamWorkspaceBilling,
  TeamWorkspaceBillingWarning,
  TeamWorkspace,
  TeamWorkspaceContextResponse,
  TeamWorkspaceInvite,
  TeamWorkspaceMember,
  TeamWorkspaceRole,
  TeamWorkspaceSharedCase,
  TeamWorkspaceSharedSavedView,
} from '@sg/shared/schemas/teamWorkspace';
import type { CasesRepository } from './casesRepository.js';
import type { SavedViewsRepository } from './savedViewsRepository.js';
import type { UsersRepository } from './usersRepository.js';

type ManageRole = Exclude<TeamWorkspaceRole, 'owner'>;

type WorkspaceMembershipRecord = {
  workspaceId: string;
  role: TeamWorkspaceRole;
  joinedAt: string;
};

type WorkspaceRecord = {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
};

type WorkspaceInviteRecord = TeamWorkspaceInvite;

type WorkspaceSharedSavedViewRecord = {
  workspaceId: string;
  savedViewId: string;
  sharedByUserId: string;
  sharedAt: string;
};

type WorkspaceSharedCaseRecord = {
  workspaceId: string;
  caseId: string;
  sharedByUserId: string;
  sharedAt: string;
};

type PgWorkspaceMembershipRow = {
  workspace_id: string;
  role: TeamWorkspaceRole;
  joined_at: Date | string;
  name: string;
  created_at: Date | string;
  owner_user_id: string;
};

type PgWorkspaceInviteRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: ManageRole;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: Date | string;
  accepted_at: Date | string | null;
};

type PgWorkspaceMemberRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  role: TeamWorkspaceRole;
  joined_at: Date | string;
};

type PgWorkspaceSavedViewRow = {
  id: string;
  name: string;
  filters: string | Record<string, unknown>;
  query_string: string;
  case_count_snapshot: string | number;
  created_at: Date | string;
  updated_at: Date | string;
  source_saved_view_id: string;
  shared_by_user_id: string;
  shared_by_name: string | null;
  shared_at: Date | string;
};

type PgWorkspaceCaseRow = {
  id: string;
  slug: string;
  company_name: string;
  industry_key: string;
  country_code: string | null;
  closed_year: number | null;
  summary: string;
  business_model_key: string | null;
  founded_year: number | null;
  total_funding_usd: string | number | null;
  primary_failure_reason_key: string | null;
  shared_by_user_id: string;
  shared_by_name: string | null;
  shared_at: Date | string;
};

type WorkspaceBillingOwner = Pick<
  UserProfile,
  | 'id'
  | 'email'
  | 'displayName'
  | 'subscription'
  | 'billingStatus'
  | 'currentPeriodEnd'
  | 'cancelAtPeriodEnd'
>;

type WorkspaceAccessContext = {
  workspaceId: string;
  workspaceName: string;
  role: TeamWorkspaceRole;
  owner: WorkspaceBillingOwner;
  seatsUsed: number;
  pendingInviteCount: number;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function numberOrNull(value: string | number | null): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowToInvite(row: PgWorkspaceInviteRow): TeamWorkspaceInvite {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: toIso(row.created_at),
    acceptedAt: row.accepted_at ? toIso(row.accepted_at) : null,
  };
}

function rowToMember(row: PgWorkspaceMemberRow): TeamWorkspaceMember {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    joinedAt: toIso(row.joined_at),
  };
}

function rowToSharedSavedView(row: PgWorkspaceSavedViewRow): TeamWorkspaceSharedSavedView {
  return {
    id: row.id,
    name: row.name,
    filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters,
    queryString: row.query_string,
    caseCount:
      typeof row.case_count_snapshot === 'number'
        ? row.case_count_snapshot
        : Number(row.case_count_snapshot),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    sourceSavedViewId: row.source_saved_view_id,
    sharedByUserId: row.shared_by_user_id,
    sharedByName: row.shared_by_name,
    sharedAt: toIso(row.shared_at),
  };
}

function rowToSharedCase(row: PgWorkspaceCaseRow): TeamWorkspaceSharedCase {
  return {
    id: row.id,
    slug: row.slug,
    companyName: row.company_name,
    industry: row.industry_key,
    country: row.country_code,
    closedYear: row.closed_year,
    summary: row.summary,
    businessModelKey: row.business_model_key,
    foundedYear: row.founded_year,
    totalFundingUsd: numberOrNull(row.total_funding_usd),
    primaryFailureReasonKey: row.primary_failure_reason_key,
    sharedByUserId: row.shared_by_user_id,
    sharedByName: row.shared_by_name,
    sharedAt: toIso(row.shared_at),
  };
}

function buildWorkspaceBilling(input: {
  owner: WorkspaceBillingOwner;
  seatsUsed: number;
  pendingInviteCount: number;
}): TeamWorkspaceBilling {
  const seatLimit = resolveTeamWorkspaceSeatLimit({
    subscription: input.owner.subscription,
    billingStatus: input.owner.billingStatus,
  });
  const reservedSeats = input.seatsUsed + input.pendingInviteCount;
  const seatsRemaining = Math.max(0, seatLimit - reservedSeats);
  const warningCodes = buildBillingWarnings({
    ownerBillingStatus: input.owner.billingStatus,
    cancelAtPeriodEnd: input.owner.cancelAtPeriodEnd,
    seatLimit,
    reservedSeats,
  });

  return {
    ownerUserId: input.owner.id,
    ownerDisplayName: input.owner.displayName,
    ownerEmail: input.owner.email,
    subscription: input.owner.subscription,
    billingStatus: input.owner.billingStatus,
    currentPeriodEnd: input.owner.currentPeriodEnd,
    cancelAtPeriodEnd: input.owner.cancelAtPeriodEnd,
    seatLimit,
    seatsUsed: input.seatsUsed,
    reservedSeats,
    seatsRemaining,
    canInviteMore: seatLimit > 0 && reservedSeats < seatLimit,
    warningCodes,
  };
}

function buildBillingWarnings(input: {
  ownerBillingStatus: BillingStatus;
  cancelAtPeriodEnd: boolean;
  seatLimit: number;
  reservedSeats: number;
}): TeamWorkspaceBillingWarning[] {
  const warningCodes: TeamWorkspaceBillingWarning[] = [];

  if (input.seatLimit === 0) warningCodes.push('workspace_plan_inactive');
  if (input.ownerBillingStatus === 'past_due') warningCodes.push('past_due');
  if (input.cancelAtPeriodEnd) warningCodes.push('cancel_at_period_end');
  if (input.seatLimit > 0 && input.reservedSeats >= input.seatLimit) {
    warningCodes.push('seat_limit_reached');
  }

  return warningCodes;
}

function personalWorkspaceAccess(user: UserProfile): WorkspaceAccess {
  return {
    source: 'personal',
    workspaceId: null,
    workspaceName: null,
    workspaceRole: null,
    inheritedFromUserId: null,
    inheritedFromName: null,
    effectiveSubscription: user.subscription,
    effectiveBillingStatus: user.billingStatus,
    warningCodes: [],
  };
}

function buildWorkspaceAccess(input: {
  user: UserProfile;
  context: WorkspaceAccessContext;
}): WorkspaceAccess {
  const seatLimit = resolveTeamWorkspaceSeatLimit({
    subscription: input.context.owner.subscription,
    billingStatus: input.context.owner.billingStatus,
  });
  const reservedSeats = input.context.seatsUsed + input.context.pendingInviteCount;
  const warningCodes = buildBillingWarnings({
    ownerBillingStatus: input.context.owner.billingStatus,
    cancelAtPeriodEnd: input.context.owner.cancelAtPeriodEnd,
    seatLimit,
    reservedSeats,
  });
  const inheritsWorkspaceAccess =
    input.context.owner.subscription === 'team' && input.context.owner.billingStatus !== 'inactive'
      ? seatLimit > 0
      : false;

  return {
    source: inheritsWorkspaceAccess ? 'team_workspace' : 'personal',
    workspaceId: input.context.workspaceId,
    workspaceName: input.context.workspaceName,
    workspaceRole: input.context.role,
    inheritedFromUserId: inheritsWorkspaceAccess ? input.context.owner.id : null,
    inheritedFromName: inheritsWorkspaceAccess
      ? (input.context.owner.displayName ?? input.context.owner.email)
      : null,
    effectiveSubscription: inheritsWorkspaceAccess ? 'team' : input.user.subscription,
    effectiveBillingStatus: inheritsWorkspaceAccess
      ? input.context.owner.billingStatus
      : input.user.billingStatus,
    warningCodes,
  };
}

function applyWorkspaceAccess(user: UserProfile, access: WorkspaceAccess | null): UserProfile {
  const resolvedAccess = access ?? personalWorkspaceAccess(user);
  return {
    ...user,
    effectiveSubscription: resolvedAccess.effectiveSubscription,
    effectiveBillingStatus: resolvedAccess.effectiveBillingStatus,
    entitlements: resolveEntitlements({
      subscription: resolvedAccess.effectiveSubscription,
      billingStatus: resolvedAccess.effectiveBillingStatus,
    }),
    workspaceAccess: resolvedAccess,
  };
}

export interface TeamWorkspacesRepository {
  resolveEffectiveUserProfile(user: UserProfile): Promise<UserProfile>;
  getContextForUser(user: UserProfile): Promise<TeamWorkspaceContextResponse>;
  getAdminMetrics(): Promise<TeamWorkspaceAdminMetrics>;
  createWorkspace(
    user: UserProfile,
    name: string,
  ): Promise<TeamWorkspace | 'already_in_workspace' | 'entitlement_required'>;
  inviteMember(
    actorUserId: string,
    email: string,
    role: ManageRole,
  ): Promise<
    | TeamWorkspace
    | 'workspace_not_found'
    | 'forbidden'
    | 'user_already_in_workspace'
    | 'seat_limit_reached'
    | 'workspace_plan_inactive'
  >;
  acceptInvite(
    user: UserProfile,
    inviteId: string,
  ): Promise<
    | TeamWorkspace
    | 'invite_not_found'
    | 'email_mismatch'
    | 'already_in_workspace'
    | 'workspace_plan_inactive'
  >;
  shareSavedView(
    actorUserId: string,
    savedViewId: string,
  ): Promise<
    | { status: 'added' | 'exists'; workspace: TeamWorkspace }
    | 'workspace_not_found'
    | 'saved_view_not_found'
  >;
  shareCase(
    actorUserId: string,
    caseId: string,
  ): Promise<
    | { status: 'added' | 'exists'; workspace: TeamWorkspace }
    | 'workspace_not_found'
    | 'case_not_found'
  >;
}

export class MockTeamWorkspacesRepository implements TeamWorkspacesRepository {
  private readonly workspaces = new Map<string, WorkspaceRecord>();
  private readonly membershipByUserId = new Map<string, WorkspaceMembershipRecord>();
  private readonly invites = new Map<string, WorkspaceInviteRecord>();
  private readonly sharedSavedViews: WorkspaceSharedSavedViewRecord[] = [];
  private readonly sharedCases: WorkspaceSharedCaseRecord[] = [];

  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly savedViewsRepo: SavedViewsRepository,
    private readonly casesRepo: CasesRepository,
  ) {}

  async resolveEffectiveUserProfile(user: UserProfile): Promise<UserProfile> {
    return applyWorkspaceAccess(user, await this.buildWorkspaceAccessForUser(user));
  }

  async getContextForUser(user: UserProfile): Promise<TeamWorkspaceContextResponse> {
    const workspace = await this.buildWorkspaceForUser(user.id);
    return {
      canCreateWorkspace: user.entitlements.canUseTeamWorkspace && workspace === null,
      hasWorkspace: workspace !== null,
      workspace,
      pendingInvites: workspace ? [] : this.getPendingInvitesForEmail(user.email),
    };
  }

  async getAdminMetrics(): Promise<TeamWorkspaceAdminMetrics> {
    const workspaces = [...this.workspaces.values()];
    let activeWorkspaces = 0;
    let atRiskWorkspaces = 0;
    let fullWorkspaces = 0;
    let totalSeatCapacity = 0;
    let seatsUsed = 0;
    let reservedSeats = 0;
    let pendingInvites = 0;
    let inheritedMembers = 0;

    for (const workspace of workspaces) {
      const owner = await this.usersRepo.getById(workspace.ownerUserId);
      if (!owner) continue;
      const workspaceSeatsUsed = [...this.membershipByUserId.values()].filter(
        (item) => item.workspaceId === workspace.id,
      ).length;
      const workspacePendingInvites = [...this.invites.values()].filter(
        (invite) => invite.workspaceId === workspace.id && invite.status === 'pending',
      ).length;
      const billing = buildWorkspaceBilling({
        owner,
        seatsUsed: workspaceSeatsUsed,
        pendingInviteCount: workspacePendingInvites,
      });

      totalSeatCapacity += billing.seatLimit;
      seatsUsed += billing.seatsUsed;
      reservedSeats += billing.reservedSeats;
      pendingInvites += workspacePendingInvites;
      if (billing.seatLimit > 0) {
        activeWorkspaces += 1;
        inheritedMembers += Math.max(0, billing.seatsUsed - 1);
      }
      if (billing.warningCodes.includes('seat_limit_reached')) fullWorkspaces += 1;
      if (
        billing.warningCodes.some(
          (code) =>
            code === 'workspace_plan_inactive' ||
            code === 'past_due' ||
            code === 'cancel_at_period_end',
        )
      ) {
        atRiskWorkspaces += 1;
      }
    }

    return {
      totalWorkspaces: workspaces.length,
      activeWorkspaces,
      atRiskWorkspaces,
      fullWorkspaces,
      totalSeatCapacity,
      seatsUsed,
      reservedSeats,
      pendingInvites,
      inheritedMembers,
      seatUtilizationRate: totalSeatCapacity > 0 ? reservedSeats / totalSeatCapacity : null,
    };
  }

  async createWorkspace(
    user: UserProfile,
    name: string,
  ): Promise<TeamWorkspace | 'already_in_workspace' | 'entitlement_required'> {
    if (!user.entitlements.canUseTeamWorkspace) return 'entitlement_required';
    if (this.membershipByUserId.has(user.id)) return 'already_in_workspace';

    const workspaceId = randomUUID();
    const createdAt = new Date().toISOString();
    this.workspaces.set(workspaceId, {
      id: workspaceId,
      name,
      ownerUserId: user.id,
      createdAt,
    });
    this.membershipByUserId.set(user.id, {
      workspaceId,
      role: 'owner',
      joinedAt: createdAt,
    });
    return (await this.buildWorkspaceForUser(user.id))!;
  }

  async inviteMember(
    actorUserId: string,
    email: string,
    role: ManageRole,
  ): Promise<
    | TeamWorkspace
    | 'workspace_not_found'
    | 'forbidden'
    | 'user_already_in_workspace'
    | 'seat_limit_reached'
    | 'workspace_plan_inactive'
  > {
    const actorMembership = this.membershipByUserId.get(actorUserId);
    if (!actorMembership) return 'workspace_not_found';
    if (actorMembership.role === 'member') return 'forbidden';

    const normalizedEmail = email.trim().toLowerCase();
    const workspaceView = await this.buildWorkspaceForUser(actorUserId);
    if (!workspaceView) return 'workspace_not_found';

    const usersToCheck = await Promise.all(
      [...this.membershipByUserId.keys()].map(async (userId) => this.usersRepo.getById(userId)),
    );
    if (usersToCheck.some((user) => user?.email === normalizedEmail)) {
      return 'user_already_in_workspace';
    }

    if (workspaceView.billing.warningCodes.includes('workspace_plan_inactive')) {
      return 'workspace_plan_inactive';
    }

    const workspace = this.workspaces.get(actorMembership.workspaceId)!;
    const existing = [...this.invites.values()].find(
      (invite) =>
        invite.workspaceId === workspace.id &&
        invite.email === normalizedEmail &&
        invite.status === 'pending',
    );
    if (!existing && !workspaceView.billing.canInviteMore) {
      return 'seat_limit_reached';
    }

    const invite: WorkspaceInviteRecord = {
      id: existing?.id ?? randomUUID(),
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      email: normalizedEmail,
      role,
      status: 'pending',
      createdAt: new Date().toISOString(),
      acceptedAt: null,
    };
    this.invites.set(invite.id, invite);
    return (await this.buildWorkspaceForUser(actorUserId))!;
  }

  async acceptInvite(
    user: UserProfile,
    inviteId: string,
  ): Promise<
    | TeamWorkspace
    | 'invite_not_found'
    | 'email_mismatch'
    | 'already_in_workspace'
    | 'workspace_plan_inactive'
  > {
    if (this.membershipByUserId.has(user.id)) return 'already_in_workspace';
    const invite = this.invites.get(inviteId);
    if (!invite || invite.status !== 'pending') return 'invite_not_found';
    if (invite.email !== user.email.toLowerCase()) return 'email_mismatch';
    const workspace = this.workspaces.get(invite.workspaceId);
    if (!workspace) return 'invite_not_found';
    const owner = await this.usersRepo.getById(workspace.ownerUserId);
    if (!owner) return 'invite_not_found';
    const seatsUsed = [...this.membershipByUserId.values()].filter(
      (item) => item.workspaceId === invite.workspaceId,
    ).length;
    const pendingInviteCount = [...this.invites.values()].filter(
      (item) => item.workspaceId === invite.workspaceId && item.status === 'pending',
    ).length;
    const billing = buildWorkspaceBilling({
      owner,
      seatsUsed,
      pendingInviteCount,
    });
    if (billing.warningCodes.includes('workspace_plan_inactive')) {
      return 'workspace_plan_inactive';
    }

    this.membershipByUserId.set(user.id, {
      workspaceId: invite.workspaceId,
      role: invite.role,
      joinedAt: new Date().toISOString(),
    });

    for (const [id, item] of this.invites.entries()) {
      if (item.email !== user.email.toLowerCase() || item.status !== 'pending') continue;
      this.invites.set(id, {
        ...item,
        status: id === inviteId ? 'accepted' : 'revoked',
        acceptedAt: id === inviteId ? new Date().toISOString() : item.acceptedAt,
      });
    }

    return (await this.buildWorkspaceForUser(user.id))!;
  }

  async shareSavedView(
    actorUserId: string,
    savedViewId: string,
  ): Promise<
    | { status: 'added' | 'exists'; workspace: TeamWorkspace }
    | 'workspace_not_found'
    | 'saved_view_not_found'
  > {
    const membership = this.membershipByUserId.get(actorUserId);
    if (!membership) return 'workspace_not_found';
    const savedView = await this.savedViewsRepo.getById(actorUserId, savedViewId);
    if (!savedView) return 'saved_view_not_found';

    const exists = this.sharedSavedViews.some(
      (item) => item.workspaceId === membership.workspaceId && item.savedViewId === savedViewId,
    );
    if (!exists) {
      this.sharedSavedViews.unshift({
        workspaceId: membership.workspaceId,
        savedViewId,
        sharedByUserId: actorUserId,
        sharedAt: new Date().toISOString(),
      });
    }
    return {
      status: exists ? 'exists' : 'added',
      workspace: (await this.buildWorkspaceForUser(actorUserId))!,
    };
  }

  async shareCase(
    actorUserId: string,
    caseId: string,
  ): Promise<
    | { status: 'added' | 'exists'; workspace: TeamWorkspace }
    | 'workspace_not_found'
    | 'case_not_found'
  > {
    const membership = this.membershipByUserId.get(actorUserId);
    if (!membership) return 'workspace_not_found';
    if (!(await this.casesRepo.caseExists(caseId))) return 'case_not_found';

    const exists = this.sharedCases.some(
      (item) => item.workspaceId === membership.workspaceId && item.caseId === caseId,
    );
    if (!exists) {
      this.sharedCases.unshift({
        workspaceId: membership.workspaceId,
        caseId,
        sharedByUserId: actorUserId,
        sharedAt: new Date().toISOString(),
      });
    }
    return {
      status: exists ? 'exists' : 'added',
      workspace: (await this.buildWorkspaceForUser(actorUserId))!,
    };
  }

  private getPendingInvitesForEmail(email: string): TeamWorkspaceInvite[] {
    return [...this.invites.values()]
      .filter((invite) => invite.email === email.toLowerCase() && invite.status === 'pending')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async buildWorkspaceAccessForUser(user: UserProfile): Promise<WorkspaceAccess | null> {
    const membership = this.membershipByUserId.get(user.id);
    if (!membership) return null;
    const workspace = this.workspaces.get(membership.workspaceId);
    if (!workspace) return null;
    const owner = await this.usersRepo.getById(workspace.ownerUserId);
    if (!owner) return null;
    const seatsUsed = [...this.membershipByUserId.values()].filter(
      (item) => item.workspaceId === workspace.id,
    ).length;
    const pendingInviteCount = [...this.invites.values()].filter(
      (invite) => invite.workspaceId === workspace.id && invite.status === 'pending',
    ).length;

    return buildWorkspaceAccess({
      user,
      context: {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        role: membership.role,
        owner,
        seatsUsed,
        pendingInviteCount,
      },
    });
  }

  private async buildWorkspaceForUser(userId: string): Promise<TeamWorkspace | null> {
    const membership = this.membershipByUserId.get(userId);
    if (!membership) return null;
    const workspace = this.workspaces.get(membership.workspaceId);
    if (!workspace) return null;

    const memberEntries = [...this.membershipByUserId.entries()].filter(
      ([, item]) => item.workspaceId === workspace.id,
    );
    const members = (
      await Promise.all(
        memberEntries.map(async ([memberUserId, item]) => {
          const user = await this.usersRepo.getById(memberUserId);
          if (!user) return null;
          return {
            userId: user.id,
            email: user.email,
            displayName: user.displayName,
            role: item.role,
            joinedAt: item.joinedAt,
          } satisfies TeamWorkspaceMember;
        }),
      )
    ).filter((item): item is TeamWorkspaceMember => item !== null);

    const invites = [...this.invites.values()]
      .filter((invite) => invite.workspaceId === workspace.id && invite.status === 'pending')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const sharedSavedViews = (
      await Promise.all(
        this.sharedSavedViews
          .filter((item) => item.workspaceId === workspace.id)
          .map(async (entry) => {
            const [savedView, sharedBy] = await Promise.all([
              this.savedViewsRepo.getById(entry.sharedByUserId, entry.savedViewId),
              this.usersRepo.getById(entry.sharedByUserId),
            ]);
            if (!savedView) return null;
            return {
              ...savedView,
              sourceSavedViewId: entry.savedViewId,
              sharedByUserId: entry.sharedByUserId,
              sharedByName: sharedBy?.displayName ?? sharedBy?.email ?? null,
              sharedAt: entry.sharedAt,
            } satisfies TeamWorkspaceSharedSavedView;
          }),
      )
    ).filter((item): item is TeamWorkspaceSharedSavedView => item !== null);

    const caseEntries = this.sharedCases.filter((item) => item.workspaceId === workspace.id);
    const cases = await this.casesRepo.getByIds(caseEntries.map((item) => item.caseId));
    const casesById = new Map(cases.map((item) => [item.id, item]));
    const sharedCases = (
      await Promise.all(
        caseEntries.map(async (entry) => {
          const item = casesById.get(entry.caseId);
          if (!item) return null;
          const sharedBy = await this.usersRepo.getById(entry.sharedByUserId);
          return {
            id: item.id,
            slug: item.slug,
            companyName: item.companyName,
            industry: item.industry,
            country: item.country,
            closedYear: item.closedYear,
            summary: item.summary,
            businessModelKey: item.businessModelKey,
            foundedYear: item.foundedYear,
            totalFundingUsd: item.totalFundingUsd,
            primaryFailureReasonKey: item.primaryFailureReasonKey,
            sharedByUserId: entry.sharedByUserId,
            sharedByName: sharedBy?.displayName ?? sharedBy?.email ?? null,
            sharedAt: entry.sharedAt,
          } satisfies TeamWorkspaceSharedCase;
        }),
      )
    ).filter((item): item is TeamWorkspaceSharedCase => item !== null);

    const owner = await this.usersRepo.getById(workspace.ownerUserId);
    if (!owner) return null;

    return {
      id: workspace.id,
      name: workspace.name,
      role: membership.role,
      canManageMembers: membership.role === 'owner' || membership.role === 'admin',
      memberCount: members.length,
      sharedSavedViewCount: sharedSavedViews.length,
      sharedCaseCount: sharedCases.length,
      createdAt: workspace.createdAt,
      billing: buildWorkspaceBilling({
        owner,
        seatsUsed: members.length,
        pendingInviteCount: invites.length,
      }),
      members,
      invites,
      sharedSavedViews,
      sharedCases,
    };
  }
}

export class PgTeamWorkspacesRepository implements TeamWorkspacesRepository {
  constructor(private readonly pool: Pool) {}

  async resolveEffectiveUserProfile(user: UserProfile): Promise<UserProfile> {
    return applyWorkspaceAccess(user, await this.buildWorkspaceAccessForUser(user));
  }

  async getContextForUser(user: UserProfile): Promise<TeamWorkspaceContextResponse> {
    const workspace = await this.buildWorkspaceForUser(user.id);
    return {
      canCreateWorkspace: user.entitlements.canUseTeamWorkspace && workspace === null,
      hasWorkspace: workspace !== null,
      workspace,
      pendingInvites: workspace ? [] : await this.getPendingInvitesForEmail(user.email),
    };
  }

  async getAdminMetrics(): Promise<TeamWorkspaceAdminMetrics> {
    const { rows } = await this.pool.query<{
      workspace_id: string;
      subscription: SubscriptionTier;
      billing_status: BillingStatus;
      cancel_at_period_end: boolean;
      member_count: string;
      pending_invite_count: string;
    }>(
      `WITH member_counts AS (
         SELECT workspace_id, COUNT(*)::int AS member_count
         FROM team_workspace_members
         GROUP BY workspace_id
       ),
       invite_counts AS (
         SELECT workspace_id, COUNT(*)::int AS pending_invite_count
         FROM team_workspace_invites
         WHERE status = 'pending'
         GROUP BY workspace_id
       )
       SELECT
         w.id AS workspace_id,
         owner.subscription,
         owner.billing_status,
         owner.cancel_at_period_end,
         COALESCE(m.member_count, 0)::text AS member_count,
         COALESCE(i.pending_invite_count, 0)::text AS pending_invite_count
       FROM team_workspaces w
       JOIN users owner ON owner.id = w.owner_user_id
       LEFT JOIN member_counts m ON m.workspace_id = w.id
       LEFT JOIN invite_counts i ON i.workspace_id = w.id`,
    );

    let activeWorkspaces = 0;
    let atRiskWorkspaces = 0;
    let fullWorkspaces = 0;
    let totalSeatCapacity = 0;
    let seatsUsed = 0;
    let reservedSeats = 0;
    let pendingInvites = 0;
    let inheritedMembers = 0;

    for (const row of rows) {
      const workspaceSeatsUsed = Number(row.member_count);
      const workspacePendingInvites = Number(row.pending_invite_count);
      const seatLimit = resolveTeamWorkspaceSeatLimit({
        subscription: row.subscription,
        billingStatus: row.billing_status,
      });
      const workspaceReservedSeats = workspaceSeatsUsed + workspacePendingInvites;
      const warningCodes = buildBillingWarnings({
        ownerBillingStatus: row.billing_status,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        seatLimit,
        reservedSeats: workspaceReservedSeats,
      });

      totalSeatCapacity += seatLimit;
      seatsUsed += workspaceSeatsUsed;
      reservedSeats += workspaceReservedSeats;
      pendingInvites += workspacePendingInvites;
      if (seatLimit > 0) {
        activeWorkspaces += 1;
        inheritedMembers += Math.max(0, workspaceSeatsUsed - 1);
      }
      if (warningCodes.includes('seat_limit_reached')) fullWorkspaces += 1;
      if (
        warningCodes.some(
          (code) =>
            code === 'workspace_plan_inactive' ||
            code === 'past_due' ||
            code === 'cancel_at_period_end',
        )
      ) {
        atRiskWorkspaces += 1;
      }
    }

    return {
      totalWorkspaces: rows.length,
      activeWorkspaces,
      atRiskWorkspaces,
      fullWorkspaces,
      totalSeatCapacity,
      seatsUsed,
      reservedSeats,
      pendingInvites,
      inheritedMembers,
      seatUtilizationRate: totalSeatCapacity > 0 ? reservedSeats / totalSeatCapacity : null,
    };
  }

  async createWorkspace(
    user: UserProfile,
    name: string,
  ): Promise<TeamWorkspace | 'already_in_workspace' | 'entitlement_required'> {
    if (!user.entitlements.canUseTeamWorkspace) return 'entitlement_required';
    if (await this.findMembership(user.id)) return 'already_in_workspace';

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO team_workspaces (name, owner_user_id)
         VALUES ($1, $2)
         RETURNING id`,
        [name, user.id],
      );
      await client.query(
        `INSERT INTO team_workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [rows[0]!.id, user.id],
      );
      await client.query('COMMIT');
      return (await this.buildWorkspaceForUser(user.id))!;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async inviteMember(
    actorUserId: string,
    email: string,
    role: ManageRole,
  ): Promise<
    | TeamWorkspace
    | 'workspace_not_found'
    | 'forbidden'
    | 'user_already_in_workspace'
    | 'seat_limit_reached'
    | 'workspace_plan_inactive'
  > {
    const membership = await this.findMembership(actorUserId);
    if (!membership) return 'workspace_not_found';
    if (membership.role === 'member') return 'forbidden';

    const workspace = await this.buildWorkspaceForUser(actorUserId);
    if (!workspace) return 'workspace_not_found';

    const { rowCount: memberCount } = await this.pool.query(
      `SELECT 1
       FROM team_workspace_members m
       JOIN users u ON u.id = m.user_id
       WHERE lower(u.email) = lower($1)
       LIMIT 1`,
      [email],
    );
    if ((memberCount ?? 0) > 0) return 'user_already_in_workspace';

    if (workspace.billing.warningCodes.includes('workspace_plan_inactive')) {
      return 'workspace_plan_inactive';
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingInvite = workspace.invites.find(
      (invite) => invite.email.toLowerCase() === normalizedEmail,
    );
    if (!existingInvite && !workspace.billing.canInviteMore) {
      return 'seat_limit_reached';
    }

    await this.pool.query(
      `INSERT INTO team_workspace_invites (workspace_id, email, role, created_by_user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, email)
       DO UPDATE SET
         role = EXCLUDED.role,
         status = 'pending',
         created_by_user_id = EXCLUDED.created_by_user_id,
         accepted_by_user_id = NULL,
         accepted_at = NULL,
         created_at = NOW()`,
      [membership.workspaceId, normalizedEmail, role, actorUserId],
    );
    return (await this.buildWorkspaceForUser(actorUserId))!;
  }

  async acceptInvite(
    user: UserProfile,
    inviteId: string,
  ): Promise<
    | TeamWorkspace
    | 'invite_not_found'
    | 'email_mismatch'
    | 'already_in_workspace'
    | 'workspace_plan_inactive'
  > {
    if (await this.findMembership(user.id)) return 'already_in_workspace';

    const { rows } = await this.pool.query<PgWorkspaceInviteRow>(
      `SELECT
         i.id,
         i.workspace_id,
         w.name AS workspace_name,
         i.email,
         i.role,
         i.status,
         i.created_at,
         i.accepted_at
       FROM team_workspace_invites i
       JOIN team_workspaces w ON w.id = i.workspace_id
       WHERE i.id = $1
       LIMIT 1`,
      [inviteId],
    );
    const invite = rows[0];
    if (!invite || invite.status !== 'pending') return 'invite_not_found';
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) return 'email_mismatch';

    const [ownerRows, memberCountRows, pendingInviteCountRows] = await Promise.all([
      this.pool.query<{
        id: string;
        email: string;
        display_name: string | null;
        subscription: SubscriptionTier;
        billing_status: BillingStatus;
        current_period_end: Date | string | null;
        cancel_at_period_end: boolean;
      }>(
        `SELECT
           u.id,
           u.email,
           u.display_name,
           u.subscription,
           u.billing_status,
           u.current_period_end,
           u.cancel_at_period_end
         FROM team_workspaces w
         JOIN users u ON u.id = w.owner_user_id
         WHERE w.id = $1
         LIMIT 1`,
        [invite.workspace_id],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM team_workspace_members
         WHERE workspace_id = $1`,
        [invite.workspace_id],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM team_workspace_invites
         WHERE workspace_id = $1
           AND status = 'pending'`,
        [invite.workspace_id],
      ),
    ]);
    const owner = ownerRows.rows[0];
    if (!owner) return 'invite_not_found';
    const billing = buildWorkspaceBilling({
      owner: {
        id: owner.id,
        email: owner.email,
        displayName: owner.display_name,
        subscription: owner.subscription,
        billingStatus: owner.billing_status,
        currentPeriodEnd: owner.current_period_end ? toIso(owner.current_period_end) : null,
        cancelAtPeriodEnd: owner.cancel_at_period_end,
      },
      seatsUsed: Number(memberCountRows.rows[0]?.count ?? 0),
      pendingInviteCount: Number(pendingInviteCountRows.rows[0]?.count ?? 0),
    });
    if (billing.warningCodes.includes('workspace_plan_inactive')) {
      return 'workspace_plan_inactive';
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO team_workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [invite.workspace_id, user.id, invite.role],
      );
      await client.query(
        `UPDATE team_workspace_invites
         SET status = CASE WHEN id = $1 THEN 'accepted' ELSE 'revoked' END,
             accepted_by_user_id = CASE WHEN id = $1 THEN $2 ELSE accepted_by_user_id END,
             accepted_at = CASE WHEN id = $1 THEN NOW() ELSE accepted_at END
         WHERE lower(email) = lower($3)
           AND status = 'pending'`,
        [inviteId, user.id, user.email],
      );
      await client.query('COMMIT');
      return (await this.buildWorkspaceForUser(user.id))!;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async shareSavedView(
    actorUserId: string,
    savedViewId: string,
  ): Promise<
    | { status: 'added' | 'exists'; workspace: TeamWorkspace }
    | 'workspace_not_found'
    | 'saved_view_not_found'
  > {
    const membership = await this.findMembership(actorUserId);
    if (!membership) return 'workspace_not_found';

    const { rowCount: savedViewCount } = await this.pool.query(
      `SELECT 1
       FROM user_saved_views
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [savedViewId, actorUserId],
    );
    if ((savedViewCount ?? 0) === 0) return 'saved_view_not_found';

    const { rowCount } = await this.pool.query(
      `INSERT INTO team_workspace_saved_views (workspace_id, saved_view_id, shared_by_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, saved_view_id) DO NOTHING`,
      [membership.workspaceId, savedViewId, actorUserId],
    );
    return {
      status: (rowCount ?? 0) > 0 ? 'added' : 'exists',
      workspace: (await this.buildWorkspaceForUser(actorUserId))!,
    };
  }

  async shareCase(
    actorUserId: string,
    caseId: string,
  ): Promise<
    | { status: 'added' | 'exists'; workspace: TeamWorkspace }
    | 'workspace_not_found'
    | 'case_not_found'
  > {
    const membership = await this.findMembership(actorUserId);
    if (!membership) return 'workspace_not_found';

    const { rowCount: caseCount } = await this.pool.query(
      `SELECT 1
       FROM cases
       WHERE id = $1 AND published_at IS NOT NULL
       LIMIT 1`,
      [caseId],
    );
    if ((caseCount ?? 0) === 0) return 'case_not_found';

    const { rowCount } = await this.pool.query(
      `INSERT INTO team_workspace_cases (workspace_id, case_id, shared_by_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, case_id) DO NOTHING`,
      [membership.workspaceId, caseId, actorUserId],
    );
    return {
      status: (rowCount ?? 0) > 0 ? 'added' : 'exists',
      workspace: (await this.buildWorkspaceForUser(actorUserId))!,
    };
  }

  private async findMembership(userId: string): Promise<WorkspaceMembershipRecord | null> {
    const { rows } = await this.pool.query<PgWorkspaceMembershipRow>(
      `SELECT m.workspace_id, m.role, m.joined_at, w.name, w.created_at, w.owner_user_id
       FROM team_workspace_members m
       JOIN team_workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = $1
       LIMIT 1`,
      [userId],
    );
    if (!rows[0]) return null;
    return {
      workspaceId: rows[0].workspace_id,
      role: rows[0].role,
      joinedAt: toIso(rows[0].joined_at),
    };
  }

  private async getPendingInvitesForEmail(email: string): Promise<TeamWorkspaceInvite[]> {
    const { rows } = await this.pool.query<PgWorkspaceInviteRow>(
      `SELECT
         i.id,
         i.workspace_id,
         w.name AS workspace_name,
         i.email,
         i.role,
         i.status,
         i.created_at,
         i.accepted_at
       FROM team_workspace_invites i
       JOIN team_workspaces w ON w.id = i.workspace_id
       WHERE lower(i.email) = lower($1)
         AND i.status = 'pending'
       ORDER BY i.created_at DESC`,
      [email],
    );
    return rows.map(rowToInvite);
  }

  private async buildWorkspaceAccessForUser(user: UserProfile): Promise<WorkspaceAccess | null> {
    const membership = await this.findMembership(user.id);
    if (!membership) return null;

    const [workspaceRows, ownerRows, memberCountRows, inviteCountRows] = await Promise.all([
      this.pool.query<{ id: string; name: string; owner_user_id: string }>(
        `SELECT id, name, owner_user_id
         FROM team_workspaces
         WHERE id = $1
         LIMIT 1`,
        [membership.workspaceId],
      ),
      this.pool.query<{
        id: string;
        email: string;
        display_name: string | null;
        subscription: SubscriptionTier;
        billing_status: BillingStatus;
        current_period_end: Date | string | null;
        cancel_at_period_end: boolean;
      }>(
        `SELECT
           id,
           email,
           display_name,
           subscription,
           billing_status,
           current_period_end,
           cancel_at_period_end
         FROM users
         WHERE id = (
           SELECT owner_user_id
           FROM team_workspaces
           WHERE id = $1
         )
         LIMIT 1`,
        [membership.workspaceId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM team_workspace_members
         WHERE workspace_id = $1`,
        [membership.workspaceId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM team_workspace_invites
         WHERE workspace_id = $1
           AND status = 'pending'`,
        [membership.workspaceId],
      ),
    ]);

    const workspace = workspaceRows.rows[0];
    const owner = ownerRows.rows[0];
    if (!workspace || !owner) return null;

    return buildWorkspaceAccess({
      user,
      context: {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        role: membership.role,
        owner: {
          id: owner.id,
          email: owner.email,
          displayName: owner.display_name,
          subscription: owner.subscription,
          billingStatus: owner.billing_status,
          currentPeriodEnd: owner.current_period_end ? toIso(owner.current_period_end) : null,
          cancelAtPeriodEnd: owner.cancel_at_period_end,
        },
        seatsUsed: Number(memberCountRows.rows[0]?.count ?? 0),
        pendingInviteCount: Number(inviteCountRows.rows[0]?.count ?? 0),
      },
    });
  }

  private async buildWorkspaceForUser(userId: string): Promise<TeamWorkspace | null> {
    const { rows } = await this.pool.query<PgWorkspaceMembershipRow>(
      `SELECT m.workspace_id, m.role, m.joined_at, w.name, w.created_at, w.owner_user_id
       FROM team_workspace_members m
       JOIN team_workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = $1
       LIMIT 1`,
      [userId],
    );
    const membership = rows[0];
    if (!membership) return null;

    const workspaceId = membership.workspace_id;
    const [memberRows, inviteRows, sharedSavedViewRows, sharedCaseRows, ownerRows] =
      await Promise.all([
        this.pool.query<PgWorkspaceMemberRow>(
          `SELECT
           u.id AS user_id,
           u.email,
           u.display_name,
           m.role,
           m.joined_at
         FROM team_workspace_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = $1
         ORDER BY
           CASE m.role
             WHEN 'owner' THEN 0
             WHEN 'admin' THEN 1
             ELSE 2
           END,
           m.joined_at ASC`,
          [workspaceId],
        ),
        this.pool.query<PgWorkspaceInviteRow>(
          `SELECT
           i.id,
           i.workspace_id,
           w.name AS workspace_name,
           i.email,
           i.role,
           i.status,
           i.created_at,
           i.accepted_at
         FROM team_workspace_invites i
         JOIN team_workspaces w ON w.id = i.workspace_id
         WHERE i.workspace_id = $1
           AND i.status = 'pending'
         ORDER BY i.created_at DESC`,
          [workspaceId],
        ),
        this.pool.query<PgWorkspaceSavedViewRow>(
          `SELECT
           v.id,
           v.name,
           v.filters,
           v.query_string,
           v.case_count_snapshot,
           v.created_at,
           v.updated_at,
           s.saved_view_id AS source_saved_view_id,
           s.shared_by_user_id,
           u.display_name AS shared_by_name,
           s.created_at AS shared_at
         FROM team_workspace_saved_views s
         JOIN user_saved_views v ON v.id = s.saved_view_id
         JOIN users u ON u.id = s.shared_by_user_id
         WHERE s.workspace_id = $1
         ORDER BY s.created_at DESC`,
          [workspaceId],
        ),
        this.pool.query<PgWorkspaceCaseRow>(
          `SELECT
           c.id,
           c.slug,
           c.company_name,
           c.industry_key,
           c.country_code,
           c.closed_year,
           c.summary,
           c.business_model_key,
           c.founded_year,
           c.total_funding_usd,
           c.primary_failure_reason_key,
           tc.shared_by_user_id,
           u.display_name AS shared_by_name,
           tc.created_at AS shared_at
         FROM team_workspace_cases tc
         JOIN cases c
           ON c.id = tc.case_id
          AND c.published_at IS NOT NULL
         JOIN users u ON u.id = tc.shared_by_user_id
         WHERE tc.workspace_id = $1
         ORDER BY tc.created_at DESC`,
          [workspaceId],
        ),
        this.pool.query<{
          id: string;
          email: string;
          display_name: string | null;
          subscription: UserProfile['subscription'];
          billing_status: UserProfile['billingStatus'];
          current_period_end: Date | string | null;
          cancel_at_period_end: boolean;
        }>(
          `SELECT
           id,
           email,
           display_name,
           subscription,
           billing_status,
           current_period_end,
           cancel_at_period_end
         FROM users
         WHERE id = $1
         LIMIT 1`,
          [membership.owner_user_id],
        ),
      ]);

    const owner = ownerRows.rows[0];
    if (!owner) return null;

    return {
      id: workspaceId,
      name: membership.name,
      role: membership.role,
      canManageMembers: membership.role === 'owner' || membership.role === 'admin',
      memberCount: memberRows.rows.length,
      sharedSavedViewCount: sharedSavedViewRows.rows.length,
      sharedCaseCount: sharedCaseRows.rows.length,
      createdAt: toIso(membership.created_at),
      billing: buildWorkspaceBilling({
        owner: {
          id: owner.id,
          email: owner.email,
          displayName: owner.display_name,
          subscription: owner.subscription,
          billingStatus: owner.billing_status,
          currentPeriodEnd: owner.current_period_end ? toIso(owner.current_period_end) : null,
          cancelAtPeriodEnd: owner.cancel_at_period_end,
        },
        seatsUsed: memberRows.rows.length,
        pendingInviteCount: inviteRows.rows.length,
      }),
      members: memberRows.rows.map(rowToMember),
      invites: inviteRows.rows.map(rowToInvite),
      sharedSavedViews: sharedSavedViewRows.rows.map(rowToSharedSavedView),
      sharedCases: sharedCaseRows.rows.map(rowToSharedCase),
    };
  }
}
