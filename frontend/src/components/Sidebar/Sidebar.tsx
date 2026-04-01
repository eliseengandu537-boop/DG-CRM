import React from "react";
import { Search } from "./Search";
import { RouteSelect } from "./RouteSelect";
import { Plan } from "./Plan";

interface SidebarProps {
  currentPage?: string;
  onPageChange?: (page: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage = "Dashboard",
  onPageChange,
}) => {
  return (
    <div>
      <div className="overflow-y-scroll sticky top-4 h-[calc(100vh-32px-48px)]">
        <Search />
        <RouteSelect currentPage={currentPage} onPageChange={onPageChange} />
      </div>

      <Plan onPageChange={onPageChange} />
    </div>
  );
};
