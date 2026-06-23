'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { IconType } from 'react-icons';
import {
  FiClock,
  FiEdit2,
  FiMessageSquare,
  FiPlus,
  FiRotateCcw,
  FiSave,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import type { BrokerWipItem } from '@/services/brokerPerformanceService';
import {
  commentAuditService,
  type CommentAuditAction,
  type CommentAuditRecord,
} from '@/services/commentAuditService';
import { wipCommentService, type WipCommentEntry } from '@/services/wipCommentService';

interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealName: string;
  comment: string;
  createdAt?: string;
  updatedAt?: string;
  item?: BrokerWipItem | null;
  onAddComment?: (newComment: string) => Promise<void> | void;
  isSaving?: boolean;
}

function formatAuditDateTime(value?: string): string {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const datePart = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);

  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);

  return `${datePart} ${timePart}`;
}

function getActionMeta(action: CommentAuditAction): {
  icon: IconType;
  iconBg: string;
  iconColor: string;
} {
  switch (action) {
    case 'added':
      return {
        icon: FiPlus,
        iconBg: 'bg-emerald-50',
        iconColor: 'text-emerald-600',
      };
    case 'edited':
      return {
        icon: FiEdit2,
        iconBg: 'bg-blue-50',
        iconColor: 'text-blue-600',
      };
    case 'deleted':
      return {
        icon: FiTrash2,
        iconBg: 'bg-rose-50',
        iconColor: 'text-rose-600',
      };
    case 'restored':
      return {
        icon: FiRotateCcw,
        iconBg: 'bg-sky-50',
        iconColor: 'text-sky-600',
      };
    default:
      return {
        icon: FiClock,
        iconBg: 'bg-slate-100',
        iconColor: 'text-slate-600',
      };
  }
}

function getActionName(action: CommentAuditAction): string {
  switch (action) {
    case 'added':
      return 'Added';
    case 'edited':
      return 'Edited';
    case 'deleted':
      return 'Deleted';
    case 'restored':
      return 'Restored';
    default:
      return 'Updated';
  }
}

function getActionDescription(action: CommentAuditAction): string {
  switch (action) {
    case 'added':
      return 'Comment added.';
    case 'edited':
      return 'Updated comment text.';
    case 'deleted':
      return 'Comment deleted.';
    case 'restored':
      return 'Comment restored.';
    default:
      return 'Comment updated.';
  }
}

export const CommentModal: React.FC<CommentModalProps> = ({
  isOpen,
  onClose,
  dealName,
  comment,
  createdAt,
  updatedAt,
  item,
  onAddComment,
  isSaving = false,
}) => {
  const [newCommentText, setNewCommentText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [commentEntries, setCommentEntries] = useState<WipCommentEntry[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [auditRecords, setAuditRecords] = useState<CommentAuditRecord[]>([]);
  const [loadingAuditHistory, setLoadingAuditHistory] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const loadComments = React.useCallback(async () => {
    setLoadingComments(true);
    setCommentError(null);

    try {
      const entries = await wipCommentService.getComments({
        item,
        legacyComment: comment,
        legacyCreatedAt: createdAt,
        legacyUpdatedAt: updatedAt,
      });
      setCommentEntries(entries);
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Failed to load comments');
      setCommentEntries([]);
    } finally {
      setLoadingComments(false);
    }
  }, [item, comment, createdAt, updatedAt]);

  const loadAuditHistory = React.useCallback(async () => {
    if (!item) {
      setAuditRecords([]);
      return;
    }

    setLoadingAuditHistory(true);
    setAuditError(null);

    try {
      const records = await commentAuditService.getCommentAuditHistory(item);
      setAuditRecords(records);
    } catch (error) {
      setAuditError(
        error instanceof Error ? error.message : 'Failed to load comment audit history'
      );
      setAuditRecords([]);
    } finally {
      setLoadingAuditHistory(false);
    }
  }, [item]);

  useEffect(() => {
    if (!isOpen) return;
    setNewCommentText('');
    setIsAdding(false);
    void loadComments();
    void loadAuditHistory();
  }, [isOpen, loadComments, loadAuditHistory]);

  const chronologicalAuditRecords = useMemo(
    () =>
      [...auditRecords].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      ),
    [auditRecords]
  );

  const handleAddComment = async () => {
    const normalizedComment = String(newCommentText || '').trim();
    if (!normalizedComment || !onAddComment) return;

    await onAddComment(normalizedComment);
    setNewCommentText('');
    setIsAdding(false);
    await loadComments();
    await loadAuditHistory();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.14)]">
        <div className="max-h-[90vh] overflow-y-auto">
          <section className="border-b border-slate-200 px-6 py-7 md:px-10 md:py-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white">
                  <FiMessageSquare className="text-slate-500" size={22} />
                </div>
                <h2 className="text-[22px] font-semibold text-slate-900">Comment</h2>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsAdding(current => !current)}
                  className="inline-flex items-center gap-2 rounded-xl px-1 py-2 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
                >
                  <FiPlus size={18} />
                  Add Comment
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  aria-label="Close comment history"
                >
                  <FiX size={18} />
                </button>
              </div>
            </div>

            {isAdding && (
              <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <textarea
                  value={newCommentText}
                  onChange={(event) => setNewCommentText(event.target.value)}
                  disabled={isSaving}
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base leading-8 text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  placeholder="Write your comment here..."
                />
                <div className="mt-4 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdding(false);
                      setNewCommentText('');
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAddComment()}
                    disabled={isSaving || !String(newCommentText || '').trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FiSave size={16} />
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {loadingComments ? (
              <div className="mt-8 text-sm text-slate-500">Loading comments...</div>
            ) : commentError ? (
              <div className="mt-8 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                {commentError}
              </div>
            ) : commentEntries.length === 0 ? (
              <div className="mt-8 text-sm text-slate-500">No comments have been added yet.</div>
            ) : (
              <div className="mt-8 divide-y divide-slate-200 border-t border-slate-200">
                {commentEntries.map(entry => (
                  <article key={entry.id} className="py-6">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
                      <div>
                        <p className="whitespace-pre-wrap text-[17px] leading-8 text-slate-900">
                          {entry.text}
                        </p>
                      </div>

                      <div className="text-left lg:text-right">
                        <p className="text-[17px] font-medium text-slate-500">
                          {formatAuditDateTime(entry.createdAt)}
                        </p>
                        <p className="mt-2 text-[17px] text-slate-500">By {entry.authorName}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="border-b border-slate-200 px-6 py-7 md:px-10 md:py-8">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white">
                <FiClock className="text-slate-500" size={22} />
              </div>
              <div>
                <h3 className="text-[22px] font-semibold text-slate-900">Audit Trail</h3>
                <p className="mt-2 text-[17px] text-slate-500">
                  Track all changes made to this comment
                </p>
                <p className="mt-1 text-sm text-slate-400">{dealName}</p>
              </div>
            </div>
          </section>

          <section className="bg-white">
            {loadingAuditHistory ? (
              <div className="px-6 py-10 text-center text-sm text-slate-500 md:px-10">
                Loading audit history...
              </div>
            ) : auditError ? (
              <div className="px-6 py-6 text-sm text-rose-600 md:px-10">{auditError}</div>
            ) : chronologicalAuditRecords.length === 0 ? (
              <div className="px-6 py-10 text-center md:px-10">
                <p className="text-base font-medium text-slate-700">No audit history found</p>
              </div>
            ) : (
              <>
                <div className="hidden border-b border-slate-200 px-6 py-5 md:grid md:grid-cols-[88px_minmax(140px,1fr)_minmax(220px,1.4fr)_minmax(180px,1fr)_minmax(220px,1fr)] md:gap-6 md:px-10">
                  <div />
                  <p className="text-[17px] font-semibold text-slate-800">Action</p>
                  <p className="text-[17px] font-semibold text-slate-800">Details</p>
                  <p className="text-[17px] font-semibold text-slate-800">By</p>
                  <p className="text-[17px] font-semibold text-slate-800">Date &amp; Time</p>
                </div>

                {chronologicalAuditRecords.map(record => {
                  const meta = getActionMeta(record.payload.action);
                  const ActionIcon = meta.icon;
                  const actorName = record.payload.actorName || 'Unknown User';

                  return (
                    <div
                      key={record.id}
                      className="grid gap-4 border-b border-slate-200 px-6 py-7 last:border-b-0 md:grid-cols-[88px_minmax(140px,1fr)_minmax(220px,1.4fr)_minmax(180px,1fr)_minmax(220px,1fr)] md:gap-6 md:px-10"
                    >
                      <div className="flex items-start md:justify-center">
                        <span
                          className={`flex h-14 w-14 items-center justify-center rounded-full ${meta.iconBg}`}
                        >
                          <ActionIcon className={meta.iconColor} size={24} />
                        </span>
                      </div>

                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 md:hidden">
                          Action
                        </p>
                        <p className="text-[17px] font-semibold text-slate-900">
                          {getActionName(record.payload.action)}
                        </p>
                      </div>

                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 md:hidden">
                          Details
                        </p>
                        <p className="text-[17px] text-slate-700">
                          {getActionDescription(record.payload.action)}
                        </p>
                      </div>

                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 md:hidden">
                          By
                        </p>
                        <p className="text-[17px] text-slate-800">{actorName}</p>
                      </div>

                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 md:hidden">
                          Date &amp; Time
                        </p>
                        <p className="text-[17px] text-slate-800">
                          {formatAuditDateTime(record.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
