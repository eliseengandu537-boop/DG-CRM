/**
 * Comment audit records are stored in the shared custom_records table with:
 * - entityType: comment_audit
 * - referenceId: stable thread key per WIP comment (deal / forecast / lead / fallback WIP id)
 * - category: wip-comment
 * - payload: action metadata, before/after content, actor details, and related entity ids
 */
import type { BrokerWipItem } from '@/services/brokerPerformanceService';
import { customRecordService, type CustomRecord } from '@/services/customRecordService';

export const COMMENT_AUDIT_ENTITY = 'comment_audit';

export type CommentAuditAction = 'added' | 'edited' | 'deleted' | 'restored';

export interface CommentAuditActor {
  id?: string;
  name?: string;
  role?: string;
  brokerId?: string | null;
}

export interface CommentAuditPayload {
  threadKey: string;
  itemId: string;
  dealId?: string;
  forecastDealId?: string;
  leadId?: string;
  brokerId?: string;
  action: CommentAuditAction;
  actionLabel: string;
  description: string;
  previousContent?: string;
  nextContent?: string;
  currentContent?: string;
  actorId?: string;
  actorName: string;
  actorRole?: string;
  dealName: string;
  leadName?: string;
  status?: string;
}

export type CommentAuditRecord = CustomRecord<CommentAuditPayload>;

function normalizeComment(value: string | null | undefined): string {
  return String(value || '').trim();
}

function getThreadDisplayName(item: BrokerWipItem): string {
  return String(item.leadName || item.dealName || 'Comment').trim() || 'Comment';
}

export function buildCommentThreadKey(item: BrokerWipItem): string {
  const dealId = String(item.dealId || '').trim();
  if (dealId) return `deal:${dealId}`;

  const forecastDealId = String(item.forecastDealId || '').trim();
  if (forecastDealId) return `forecast:${forecastDealId}`;

  const leadId = String(item.leadId || '').trim();
  if (leadId) return `lead:${leadId}`;

  return `wip:${String(item.id || '').trim()}`;
}

export function getCommentAuditActionLabel(action: CommentAuditAction): string {
  switch (action) {
    case 'added':
      return 'Comment Added';
    case 'edited':
      return 'Comment Edited';
    case 'deleted':
      return 'Comment Deleted';
    case 'restored':
      return 'Comment Restored';
    default:
      return 'Comment Updated';
  }
}

function getCommentAuditDescription(action: CommentAuditAction): string {
  switch (action) {
    case 'added':
      return 'Initial comment was added.';
    case 'edited':
      return 'Updated comment text.';
    case 'deleted':
      return 'Comment was deleted.';
    case 'restored':
      return 'Comment was restored.';
    default:
      return 'Comment history updated.';
  }
}

function resolveAuditAction(params: {
  previousComment: string;
  nextComment: string;
  hasDeletedHistory: boolean;
}): CommentAuditAction | null {
  const previousComment = normalizeComment(params.previousComment);
  const nextComment = normalizeComment(params.nextComment);

  if (previousComment === nextComment) return null;
  if (!previousComment && nextComment) {
    return params.hasDeletedHistory ? 'restored' : 'added';
  }
  if (previousComment && !nextComment) return 'deleted';
  if (previousComment && nextComment) return 'edited';
  return null;
}

async function loadExistingHistory(item: BrokerWipItem): Promise<CommentAuditRecord[]> {
  const result = await customRecordService.getAllCustomRecords<CommentAuditPayload>({
    entityType: COMMENT_AUDIT_ENTITY,
    referenceId: buildCommentThreadKey(item),
    limit: 200,
  });

  return [...result.data].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

export const commentAuditService = {
  async getCommentAuditHistory(item: BrokerWipItem): Promise<CommentAuditRecord[]> {
    return loadExistingHistory(item);
  },

  async recordCommentAudit(params: {
    item: BrokerWipItem;
    previousComment: string;
    nextComment: string;
    actor?: CommentAuditActor | null;
  }): Promise<CommentAuditRecord | null> {
    const previousComment = normalizeComment(params.previousComment);
    const nextComment = normalizeComment(params.nextComment);

    if (previousComment === nextComment) return null;

    const existingHistory = await loadExistingHistory(params.item);
    const hasDeletedHistory = existingHistory.some(
      record => record.payload.action === 'deleted'
    );
    const action = resolveAuditAction({
      previousComment,
      nextComment,
      hasDeletedHistory,
    });

    if (!action) return null;

    const actionLabel = getCommentAuditActionLabel(action);
    const description = getCommentAuditDescription(action);
    const payload: CommentAuditPayload = {
      threadKey: buildCommentThreadKey(params.item),
      itemId: params.item.id,
      dealId: String(params.item.dealId || '').trim() || undefined,
      forecastDealId: String(params.item.forecastDealId || '').trim() || undefined,
      leadId: String(params.item.leadId || '').trim() || undefined,
      brokerId:
        String(params.actor?.brokerId || params.item.brokerId || '').trim() || undefined,
      action,
      actionLabel,
      description,
      previousContent: previousComment || undefined,
      nextContent: nextComment || undefined,
      currentContent: nextComment || undefined,
      actorId: String(params.actor?.id || '').trim() || undefined,
      actorName: String(params.actor?.name || '').trim() || 'Unknown User',
      actorRole: String(params.actor?.role || '').trim() || undefined,
      dealName: String(params.item.dealName || '').trim(),
      leadName: String(params.item.leadName || '').trim() || undefined,
      status: String(params.item.status || '').trim() || undefined,
    };

    return customRecordService.createCustomRecord<CommentAuditPayload>({
      entityType: COMMENT_AUDIT_ENTITY,
      name: `${actionLabel} - ${getThreadDisplayName(params.item)}`,
      category: 'wip-comment',
      referenceId: payload.threadKey,
      payload,
    });
  },
};

export default commentAuditService;


