"use client";

import { useEffect, useState } from "react";
import { Dashboard } from "@/components/Dashboard/Dashboard";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function LegalDocsPage() {
  const [currentPage, setCurrentPage] = useState("Legal Docs");

  useEffect(() => {
    const handleNavigation = (event: Event) => {
      const customEvent = event as CustomEvent<{ page?: string }>;
      const nextPage = String(customEvent?.detail?.page || '').trim();
      if (!nextPage) return;
      setCurrentPage(nextPage);
    };

    window.addEventListener('navigation:page-change', handleNavigation as EventListener);
    return () => {
      window.removeEventListener('navigation:page-change', handleNavigation as EventListener);
    };
  }, []);

  return (
    <ErrorBoundary level="page">
      <ProtectedRoute>
        <main className="grid gap-4 p-4 grid-cols-[220px,_1fr]">
          <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
          <Dashboard currentPage={currentPage} onPageChange={setCurrentPage} />
        </main>
      </ProtectedRoute>
    </ErrorBoundary>
  );
}

