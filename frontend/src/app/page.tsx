"use client";

import { useEffect, useState } from "react";
import { Dashboard } from "@/components/Dashboard/Dashboard";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function Home() {
  const [currentPage, setCurrentPage] = useState("Dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
        <main className={`grid gap-4 p-4 transition-all duration-200 ${sidebarCollapsed ? 'grid-cols-[56px,_1fr]' : 'grid-cols-[220px,_1fr]'}`}>
          <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(v => !v)} />
          <Dashboard currentPage={currentPage} onPageChange={setCurrentPage} />
        </main>
      </ProtectedRoute>
    </ErrorBoundary>
  );
}
