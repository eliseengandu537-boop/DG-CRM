import React from "react";
import { FiChevronsLeft, FiChevronsRight } from "react-icons/fi";
import { Search } from "./Search";
import { RouteSelect } from "./RouteSelect";
import { Plan } from "./Plan";

interface SidebarProps {
  currentPage?: string;
  onPageChange?: (page: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage = "Dashboard",
  onPageChange,
  collapsed = false,
  onToggleCollapse,
}) => {
  return (
    <div className="flex flex-col h-screen bg-stone-50 border-r border-stone-200 overflow-hidden">
      {/* Header with integrated toggle */}
      <div
        className={`flex items-center shrink-0 h-12 border-b border-stone-200 ${
          collapsed ? "justify-center px-2" : "justify-between px-3"
        }`}
      >
        {!collapsed && (
          <span className="text-[13px] font-semibold text-stone-500 tracking-widest uppercase select-none">
            Menu
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-7 h-7 rounded-md flex items-center justify-center text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors"
        >
          {collapsed ? <FiChevronsRight size={15} /> : <FiChevronsLeft size={15} />}
        </button>
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-2 pt-2 shrink-0">
          <Search />
        </div>
      )}

      {/* Nav items */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 px-2">
        <RouteSelect
          currentPage={currentPage}
          onPageChange={onPageChange}
          collapsed={collapsed}
        />
      </div>

      {/* User section */}
      <Plan onPageChange={onPageChange} collapsed={collapsed} />
    </div>
  );
};
