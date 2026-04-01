'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ============================================================================
// PAGE CONTEXT - For navigation and pagination
// ============================================================================

export interface PageState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  searchQuery: string;
  sortBy?: string;
  filterBy?: Record<string, any>;
}

interface PageContextType {
  page: PageState;
  setPPage: (state: Partial<PageState>) => void;
  goToPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: string) => void;
  setFilter: (filter: Record<string, any>) => void;
  reset: () => void;
}

const defaultPageState: PageState = {
  currentPage: 1,
  pageSize: 10,
  totalItems: 0,
  searchQuery: '',
};

const PageContext = createContext<PageContextType | undefined>(undefined);

export const PageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [page, setPage] = useState<PageState>(defaultPageState);

  const setPageState = useCallback((state: Partial<PageState>) => {
    setPage(prev => ({ ...prev, ...state }));
  }, []);

  const goToPage = useCallback((pageNum: number) => {
    setPage(prev => ({ ...prev, currentPage: Math.max(1, pageNum) }));
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPage(prev => ({ ...prev, pageSize: size, currentPage: 1 }));
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setPage(prev => ({ ...prev, searchQuery: query, currentPage: 1 }));
  }, []);

  const setSortBy = useCallback((sort: string) => {
    setPage(prev => ({ ...prev, sortBy: sort }));
  }, []);

  const setFilter = useCallback((filter: Record<string, any>) => {
    setPage(prev => ({ ...prev, filterBy: filter, currentPage: 1 }));
  }, []);

  const reset = useCallback(() => {
    setPage(defaultPageState);
  }, []);

  return (
    <PageContext.Provider
      value={{
        page,
        setPPage: setPageState,
        goToPage,
        setPageSize,
        setSearchQuery,
        setSortBy,
        setFilter,
        reset,
      }}
    >
      {children}
    </PageContext.Provider>
  );
};

export const usePage = (): PageContextType => {
  const context = useContext(PageContext);
  if (!context) {
    throw new Error('usePage must be used within PageProvider');
  }
  return context;
};

// ============================================================================
// DATA CONTEXT - For managing entity data and loading states
// ============================================================================

export interface DataState<T> {
  items: T[];
  isLoading: boolean;
  error: string | null;
  selectedId: string | null;
}

interface DataContextType<T> {
  state: DataState<T>;
  setItems: (items: T[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectItem: (id: string | null) => void;
  addItem: (item: T) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<T>) => void;
  reset: () => void;
}

export function createDataContext<T extends { id: string }>(
  defaultState: DataState<T> = { items: [], isLoading: false, error: null, selectedId: null }
) {
  const Context = createContext<DataContextType<T> | undefined>(undefined);

  const Provider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<DataState<T>>(defaultState);

    const setItems = useCallback((items: T[]) => {
      setState(prev => ({ ...prev, items }));
    }, []);

    const setLoading = useCallback((loading: boolean) => {
      setState(prev => ({ ...prev, isLoading: loading }));
    }, []);

    const setError = useCallback((error: string | null) => {
      setState(prev => ({ ...prev, error }));
    }, []);

    const selectItem = useCallback((id: string | null) => {
      setState(prev => ({ ...prev, selectedId: id }));
    }, []);

    const addItem = useCallback((item: T) => {
      setState(prev => ({
        ...prev,
        items: [...prev.items, item],
      }));
    }, []);

    const removeItem = useCallback((id: string) => {
      setState(prev => ({
        ...prev,
        items: prev.items.filter(item => item.id !== id),
      }));
    }, []);

    const updateItem = useCallback((id: string, updates: Partial<T>) => {
      setState(prev => ({
        ...prev,
        items: prev.items.map(item =>
          item.id === id ? { ...item, ...updates } : item
        ),
      }));
    }, []);

    const reset = useCallback(() => {
      setState(defaultState);
    }, []);

    return (
      <Context.Provider
        value={{
          state,
          setItems,
          setLoading,
          setError,
          selectItem,
          addItem,
          removeItem,
          updateItem,
          reset,
        }}
      >
        {children}
      </Context.Provider>
    );
  };

  const useData = (): DataContextType<T> => {
    const context = useContext(Context);
    if (!context) {
      throw new Error('useData must be used within DataProvider');
    }
    return context;
  };

  return { Provider, useData, Context };
}

// ============================================================================
// FILTER CONTEXT - For managing filter state
// ============================================================================

interface FilterContextType<T> {
  filters: T;
  updateFilter: (key: keyof T, value: any) => void;
  updateMultiple: (filters: Partial<T>) => void;
  reset: () => void;
}

export function createFilterContext<T extends Record<string, any>>(defaultFilters: T) {
  const Context = createContext<FilterContextType<T> | undefined>(undefined);

  const Provider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [filters, setFilters] = useState<T>(defaultFilters);

    const updateFilter = useCallback((key: keyof T, value: any) => {
      setFilters(prev => ({ ...prev, [key]: value }));
    }, []);

    const updateMultiple = useCallback((newFilters: Partial<T>) => {
      setFilters(prev => ({ ...prev, ...newFilters }));
    }, []);

    const reset = useCallback(() => {
      setFilters(defaultFilters);
    }, []);

    return (
      <Context.Provider value={{ filters, updateFilter, updateMultiple, reset }}>
        {children}
      </Context.Provider>
    );
  };

  const useFilter = (): FilterContextType<T> => {
    const context = useContext(Context);
    if (!context) {
      throw new Error('useFilter must be used within FilterProvider');
    }
    return context;
  };

  return { Provider, useFilter, Context };
}

// ============================================================================
// COMMON CONTEXT INSTANCES
// ============================================================================

// Leads context
export const {
  Provider: LeadsDataProvider,
  useData: useLeadsData,
} = createDataContext({ items: [], isLoading: false, error: null, selectedId: null });

export const {
  Provider: LeadsFilterProvider,
  useFilter: useLeadsFilter,
} = createFilterContext({
  status: '',
  type: '',
  broker: '',
  minValue: 0,
  maxValue: 999999999,
});

// Properties context
export const {
  Provider: PropertiesDataProvider,
  useData: usePropertiesData,
} = createDataContext({ items: [], isLoading: false, error: null, selectedId: null });

export const {
  Provider: PropertiesFilterProvider,
  useFilter: usePropertiesFilter,
} = createFilterContext({
  type: '',
  status: 'Active',
  broker: '',
});

// Contacts context
export const {
  Provider: ContactsDataProvider,
  useData: useContactsData,
} = createDataContext({ items: [], isLoading: false, error: null, selectedId: null });

export const {
  Provider: ContactsFilterProvider,
  useFilter: useContactsFilter,
} = createFilterContext({
  type: '',
  status: 'Active',
});

// Deals context
export const {
  Provider: DealsDataProvider,
  useData: useDealsData,
} = createDataContext({ items: [], isLoading: false, error: null, selectedId: null });

export const {
  Provider: DealsFilterProvider,
  useFilter: useDealsFilter,
} = createFilterContext({
  status: '',
  type: '',
  minValue: 0,
  maxValue: 999999999,
});
