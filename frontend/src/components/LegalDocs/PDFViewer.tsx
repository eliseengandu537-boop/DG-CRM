'use client';

import React from 'react';
import { FiDownload, FiExternalLink } from 'react-icons/fi';

interface PDFViewerProps {
  filePath: string;
  fileName: string;
  canDownload?: boolean;
  disabledDownloadMessage?: string;
}

export default function PDFViewer({
  filePath,
  fileName,
  canDownload = true,
  disabledDownloadMessage = 'Download is blocked until required links and tags are added.',
}: PDFViewerProps) {
  const handleDownload = () => {
    if (!canDownload) {
      alert(disabledDownloadMessage);
      return;
    }

    const link = document.createElement('a');
    link.href = filePath;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenInNewTab = () => {
    window.open(filePath, '_blank');
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-stone-200 overflow-hidden">
      {/* PDF Controls */}
      <div className="flex items-center justify-between gap-4 p-4 bg-stone-50 border-b border-stone-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-stone-700">{fileName}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenInNewTab}
            className="flex items-center gap-2 bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700 transition-colors"
            title="Open in new tab"
          >
            <FiExternalLink size={16} />
            Open
          </button>
          <button
            onClick={handleDownload}
            disabled={!canDownload}
            className={`flex items-center gap-2 px-3 py-1 rounded text-sm transition-colors ${
              canDownload
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            title="Download PDF"
          >
            <FiDownload size={16} />
            Download
          </button>
        </div>
      </div>

      {/* PDF Display Area using iframe */}
      <div className="flex-1 overflow-hidden">
        <iframe
          src={`${filePath}#toolbar=1&navpanes=0&scrollbar=1`}
          className="w-full h-full border-none"
          title={fileName}
          aria-label={`PDF viewer showing ${fileName}`}
        />
      </div>
    </div>
  );
}
