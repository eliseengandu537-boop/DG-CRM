'use client';

import React, { useState } from 'react';
import { FiX, FiMessageSquare, FiCopy, FiCheck, FiSave } from 'react-icons/fi';

interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealName: string;
  comment: string;
  updatedAt?: string;
  onSave?: (updatedComment: string) => void;
  isSaving?: boolean;
}

export const CommentModal: React.FC<CommentModalProps> = ({
  isOpen,
  onClose,
  dealName,
  comment,
  updatedAt,
  onSave,
  isSaving = false,
}) => {
  const [copied, setCopied] = React.useState(false);
  const [editedComment, setEditedComment] = useState(comment);

  React.useEffect(() => {
    setEditedComment(comment);
  }, [comment]);

  const handleCopy = () => {
    navigator.clipboard.writeText(editedComment);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    if (onSave && editedComment !== comment) {
      onSave(editedComment);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-stone-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-stone-100 to-stone-50 rounded-t-2xl p-6 flex items-start justify-between border-b border-stone-200">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FiMessageSquare className="text-blue-600" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-950">{dealName}</h2>
              <p className="text-sm text-stone-600 mt-1">Comment</p>
              {updatedAt && (
                <p className="text-xs text-stone-500 mt-2">
                  Last updated {new Date(updatedAt).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors text-stone-600"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Comment Text Area */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-stone-700">Full Comment</label>
            <textarea
              value={editedComment}
              onChange={(e) => setEditedComment(e.target.value)}
              disabled={isSaving}
              className="w-full px-4 py-3 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white hover:border-stone-300 transition-colors"
              rows={6}
            />
          </div>

          {/* Character Count */}
          <div className="text-right">
            <span className="text-xs text-stone-500">{editedComment.length} characters</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 rounded-b-2xl flex justify-between gap-3">
          <button
            onClick={handleCopy}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-300 rounded-lg text-stone-700 font-medium hover:bg-stone-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copied ? (
              <>
                <FiCheck size={18} className="text-green-600" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <FiCopy size={18} />
                <span>Copy</span>
              </>
            )}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-white border border-stone-300 rounded-lg text-stone-700 font-medium hover:bg-stone-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            {onSave && (
              <button
                onClick={handleSave}
                disabled={isSaving || editedComment === comment}
                className="flex items-center gap-2 px-4 py-2 bg-stone-950 text-white rounded-lg font-medium hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FiSave size={18} />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
