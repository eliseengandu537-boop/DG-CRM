export type AppRole = 'admin' | 'manager' | 'broker' | 'viewer';

export type AppPage =
  | 'Dashboard'
  | 'Broker Profiles'
  | 'Maps'
  | 'Leasing'
  | 'Sales'
  | 'Auction'
  | 'Deal Sheet'
  | 'Property Funds'
  | 'Legal Docs'
  | 'Reminders'
  | 'Brochures'
  | 'Settings'
  | 'User Profile';

const ROLE_PAGE_ACCESS: Record<AppRole, AppPage[]> = {
  admin: [
    'Dashboard',
    'Broker Profiles',
    'Maps',
    'Leasing',
    'Sales',
    'Auction',
    'Deal Sheet',
    'Property Funds',
    'Legal Docs',
    'Reminders',
    'Brochures',
    'Settings',
    'User Profile',
  ],
  manager: [
    'Dashboard',
    'Broker Profiles',
    'Maps',
    'Leasing',
    'Sales',
    'Auction',
    'Deal Sheet',
    'Property Funds',
    'Legal Docs',
    'Reminders',
    'Brochures',
    'Settings',
    'User Profile',
  ],
  broker: [
    'Dashboard',
    'Broker Profiles',
    'Maps',
    'Leasing',
    'Sales',
    'Auction',
    'Legal Docs',
    'Reminders',
    'Brochures',
    'User Profile',
  ],
  viewer: [
    'Dashboard',
    'Maps',
    'User Profile',
  ],
};

export const normalizeRole = (role: string | null | undefined): AppRole => {
  if (role === 'admin' || role === 'manager' || role === 'broker' || role === 'viewer') {
    return role;
  }
  return 'viewer';
};

export const getAllowedPages = (role: string | null | undefined): AppPage[] => {
  return ROLE_PAGE_ACCESS[normalizeRole(role)];
};

export const canAccessPage = (
  role: string | null | undefined,
  page: string | null | undefined
): boolean => {
  if (!page) return false;
  return getAllowedPages(role).includes(page as AppPage);
};

export const getDefaultPageForRole = (role: string | null | undefined): AppPage => {
  const pages = getAllowedPages(role);
  return pages[0] || 'Dashboard';
};
