import React from 'react';
import { IconType } from 'react-icons';
import { useAuth } from '@/context/AuthContext';
import { AppPage, getAllowedPages } from '@/lib/pageAccess';
import { useReminderNotifications } from '@/context/ReminderContext';
import {
  FiAward,
  FiCalendar,
  FiBriefcase,
  FiClipboard,
  FiFileText,
  FiHome,
  FiKey,
  FiMap,
  FiPaperclip,
  FiSettings,
  FiTrendingUp,
  FiUsers,
} from 'react-icons/fi';

interface RouteSelectProps {
  currentPage?: string;
  onPageChange?: (page: string) => void;
  collapsed?: boolean;
}

const NAV_ROUTES: Array<{ title: AppPage; icon: IconType }> = [
  { title: 'Dashboard', icon: FiHome },
  { title: 'Broker Profiles', icon: FiUsers },
  { title: 'Maps', icon: FiMap },
  { title: 'Leasing', icon: FiKey },
  { title: 'Sales', icon: FiTrendingUp },
  { title: 'Auction', icon: FiAward },
  { title: 'Deal Sheet', icon: FiClipboard },
  { title: 'Property Funds', icon: FiBriefcase },
  { title: 'Legal Docs', icon: FiFileText },
  { title: 'Reminders', icon: FiCalendar },
  { title: 'Brochures', icon: FiPaperclip },
  { title: 'Settings', icon: FiSettings },
];

export const RouteSelect: React.FC<RouteSelectProps> = ({
  currentPage = 'Dashboard',
  onPageChange,
  collapsed = false,
}) => {
  const { user } = useAuth();
  const { pendingCount } = useReminderNotifications();
  const allowedPages = getAllowedPages(user?.role);

  const visibleRoutes = NAV_ROUTES.filter(route => allowedPages.includes(route.title));

  return (
    <div className={`space-y-0.5 pt-0.5 ${collapsed ? 'px-0' : ''}`}>
      {visibleRoutes.map(route => (
        <Route
          key={route.title}
          Icon={route.icon}
          selected={currentPage === route.title}
          title={route.title}
          collapsed={collapsed}
          badgeCount={route.title === 'Reminders' ? pendingCount : undefined}
          onClick={() => onPageChange?.(route.title)}
        />
      ))}
    </div>
  );
};

const Route = ({
  selected,
  Icon,
  title,
  badgeCount,
  collapsed,
  onClick,
}: {
  selected: boolean;
  Icon: IconType;
  title: string;
  badgeCount?: number;
  collapsed?: boolean;
  onClick?: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      title={collapsed ? title : undefined}
      className={`flex items-center w-full rounded-md transition-colors ${
        collapsed ? 'justify-center px-0 py-2.5' : 'justify-start gap-2.5 px-2.5 py-2'
      } text-sm ${
        selected
          ? 'bg-white text-stone-950 shadow-sm'
          : 'hover:bg-stone-200 bg-transparent text-stone-500'
      }`}
    >
      <Icon className={`shrink-0 ${selected ? 'text-violet-500' : ''}`} size={16} />
      {!collapsed && <span className="truncate">{title}</span>}
      {!collapsed && badgeCount !== undefined && badgeCount > 0 && (
        <span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
          {badgeCount}
        </span>
      )}
      {collapsed && badgeCount !== undefined && badgeCount > 0 && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-violet-500" />
      )}
    </button>
  );
};
