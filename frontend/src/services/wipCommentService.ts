import type { BrokerWipItem } from '@/services/brokerPerformanceService';
import { customRecordService, type CustomRecord } from '@/services/customRecordService';
import { buildCommentThreadKey } from '@/services/commentAuditService';

export const WIP_COMMENT_ENTITY = 'wip_comment_entry';

export interface WipCommentActor {
  id?: string;
  name?: string;
  role?: string;
  brokerId?: string | null;
}

export interface WipCommentPayload {
  threadKey: string;
  itemId: string;
  dealId?: string;
  forecastDealId?: string;
  leadId?: string;
  brokerId?: string;
  dealName: string;
  leadName?: string;
  text: string;
  actorId?: string;
  actorName: string;
  actorRole?: string;
  commentedAt?: string;
  importedFromLegacy?: boolean;
}

export type WipCommentRecord = CustomRecord<WipCommentPayload>;

export interface WipCommentEntry {
  id: string;
  text: string;
  authorName: string;
  authorRole?: string;
  createdAt: string;
  importedFromLegacy?: boolean;
}

function normalizeComment(value: string | null | undefined): string {
  return String(value || '').trim();
}

function getThreadDisplayName(item: BrokerWipItem): string {
  return String(item.leadName || item.dealName || 'Comment').trim() || 'Comment';
}

function buildPayload(params: {
  item: BrokerWipItem;
  text: string;
  actor?: WipCommentActor | null;
  commentedAt?: string;
  importedFromLegacy?: boolean;
}): WipCommentPayload {
  return {
    threadKey: buildCommentThreadKey(params.item),
    itemId: params.item.id,
    dealId: String(params.item.dealId || '').trim() || undefined,
    forecastDealId: String(params.item.forecastDealId || '').trim() || undefined,
    leadId: String(params.item.leadId || '').trim() || undefined,
    brokerId:
      String(params.actor?.brokerId || params.item.brokerId || '').trim() || undefined,
    dealName: String(params.item.dealName || '').trim(),
    leadName: String(params.item.leadName || '').trim() || undefined,
    text: normalizeComment(params.text),
    actorId: String(params.actor?.id || '').trim() || undefined,
    actorName: String(params.actor?.name || '').trim() || 'Unknown User',
    actorRole: String(params.actor?.role || '').trim() || undefined,
    commentedAt: params.commentedAt || undefined,
    importedFromLegacy: Boolean(params.importedFromLegacy) || undefined,
  };
}

function mapRecordToEntry(record: WipCommentRecord): WipCommentEntry {
  return {
    id: record.id,
    text: normalizeComment(record.payload.text),
    authorName: String(record.payload.actorName || '').trim() || 'Unknown User',
    authorRole: String(record.payload.actorRole || '').trim() || undefined,
    createdAt: String(record.payload.commentedAt || record.createdAt || ''),
    importedFromLegacy: Boolean(record.payload.importedFromLegacy),
  };
}

function sortEntriesNewestFirst(entries: WipCommentEntry[]): WipCommentEntry[] {
  return [...entries].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

async function loadCommentRecords(item: BrokerWipItem): Promise<WipCommentRecord[]> {
  const result = await customRecordService.getAllCustomRecords<WipCommentPayload>({
    entityType: WIP_COMMENT_ENTITY,
    referenceId: buildCommentThreadKey(item),
    limit: 200,
  });

  return [...result.data].sort((left, right) => {
    const leftTime = new Date(left.payload.commentedAt || left.createdAt || 0).getTime();
    const rightTime = new Date(right.payload.commentedAt || right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

export const wipCommentService = {
  async getComments(params: {
    item?: BrokerWipItem | null;
    legacyComment?: string;
    legacyCreatedAt?: string;
    legacyUpdatedAt?: string;
  }): Promise<WipCommentEntry[]> {
    const legacyComment = normalizeComment(params.legacyComment);

    if (!params.item) {
      if (!legacyComment) return [];
      return [
        {
          id: 'legacy-comment',
          text: legacyComment,
          authorName: 'Unknown User',
          createdAt:
            String(params.legacyUpdatedAt || params.legacyCreatedAt || '').trim() ||
            new Date().toISOString(),
          importedFromLegacy: true,
        },
      ];
    }

    const records = await loadCommentRecords(params.item);
    const mappedEntries = sortEntriesNewestFirst(records.map(mapRecordToEntry));
    if (mappedEntries.length > 0) return mappedEntries;

    if (!legacyComment) return [];

    return [
      {
        id: `legacy-${buildCommentThreadKey(params.item)}`,
        text: legacyComment,
        authorName: 'Unknown User',
        createdAt:
          String(
            params.legacyUpdatedAt || params.legacyCreatedAt || params.item.updatedAt || params.item.createdAt || ''
          ).trim() || new Date().toISOString(),
        importedFromLegacy: true,
      },
    ];
  },

  async addComment(params: {
    item: BrokerWipItem;
    text: string;
    actor?: WipCommentActor | null;
    legacyComment?: string;
    legacyCreatedAt?: string;
    legacyUpdatedAt?: string;
  }): Promise<WipCommentRecord> {
    const normalizedText = normalizeComment(params.text);
    if (!normalizedText) {
      throw new Error('Comment is required');
    }

    const existingRecords = await loadCommentRecords(params.item);
    const legacyComment = normalizeComment(params.legacyComment);

    if (existingRecords.length === 0 && legacyComment && legacyComment !== normalizedText) {
      await customRecordService.createCustomRecord<WipCommentPayload>({
        entityType: WIP_COMMENT_ENTITY,
        name: `${getThreadDisplayName(params.item)} Comment`,
        category: 'wip-comment',
        referenceId: buildCommentThreadKey(params.item),
        payload: buildPayload({
          item: params.item,
          text: legacyComment,
          actor: {
            name: 'Unknown User',
            role: 'Legacy Comment',
            brokerId: params.item.brokerId,
          },
          commentedAt:
            String(
              params.legacyUpdatedAt ||
                params.legacyCreatedAt ||
                params.item.updatedAt ||
                params.item.createdAt ||
                ''
            ).trim() || new Date().toISOString(),
          importedFromLegacy: true,
        }),
      });
    }

    return customRecordService.createCustomRecord<WipCommentPayload>({
      entityType: WIP_COMMENT_ENTITY,
      name: `${getThreadDisplayName(params.item)} Comment`,
      category: 'wip-comment',
      referenceId: buildCommentThreadKey(params.item),
      payload: buildPayload({
        item: params.item,
        text: normalizedText,
        actor: params.actor,
        commentedAt: new Date().toISOString(),
      }),
    });
  },
};

export default wipCommentService;
