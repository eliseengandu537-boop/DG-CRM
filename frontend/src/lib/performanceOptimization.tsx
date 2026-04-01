'use client';

import React, { useMemo, useCallback } from 'react';

/**
 * Performance Optimization Utilities
 * Helper functions for preventing unnecessary re-renders and optimizing performance
 */

/**
 * Memoization helper for expensive calculations
 */
export const useMemoValue = <T,>(
  factory: () => T,
  deps: React.DependencyList
): T => {
  return useMemo(factory, deps);
};

/**
 * Callback memoization with dependency tracking
 */
export const useCallbackMemo = <T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T => {
  return useCallback(callback, deps) as T;
};

/**
 * Debounce hook to prevent excessive function calls
 */
export const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Throttle hook to limit function execution
 */
export const useThrottle = <T,>(value: T, interval: number): T => {
  const [throttledValue, setThrottledValue] = React.useState(value);
  const lastUpdated = React.useRef<number>(Date.now());

  React.useEffect(() => {
    const now = Date.now();
    if (now >= lastUpdated.current + interval) {
      lastUpdated.current = now;
      setThrottledValue(value);
    }
  }, [value, interval]);

  return throttledValue;
};

/**
 * Prevent re-renders of components that haven't had prop changes
 */
export const useShallowCompare = <T extends object>(value: T): T => {
  const ref = React.useRef(value);

  React.useEffect(() => {
    if (
      !Object.keys(value).every(
        (key) =>
          key in ref.current &&
          (ref.current as any)[key] === (value as any)[key]
      )
    ) {
      ref.current = value;
    }
  }, [value]);

  return ref.current;
};

/**
 * Intersection Observer hook for lazy loading
 */
export const useIntersectionObserver = (ref: React.RefObject<HTMLElement>) => {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return isVisible;
};

/**
 * Lazy image loading component
 */
interface LazyImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  placeholder?: string;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"%3E%3Crect fill="%23e5e7eb" width="400" height="300"/%3E%3C/svg%3E',
  alt,
  ...props
}) => {
  const ref = React.useRef<HTMLImageElement>(null);
  const [imageSrc, setImageSrc] = React.useState(placeholder);
  const isVisible = useIntersectionObserver(ref);

  React.useEffect(() => {
    if (!isVisible) return;

    const img = new Image();
    img.src = src;
    img.onload = () => setImageSrc(src);
  }, [isVisible, src]);

  return (
    <img
      ref={ref}
      src={imageSrc}
      alt={alt}
      {...props}
      className={`${props.className} transition-opacity duration-300`}
    />
  );
};

/**
 * Performance monitor - logs render times in development
 */
export const useRenderTime = (componentName: string) => {
  const renderStartTime = React.useRef(Date.now());

  React.useEffect(() => {
    const renderTime = Date.now() - renderStartTime.current;
    if (process.env.NODE_ENV === 'development') {
      console.log(`${componentName} rendered in ${renderTime}ms`);
    }
  });
};

/**
 * Request animation frame hook for smooth animations
 */
export const useAnimationFrame = (callback: (time: number) => void) => {
  const frameRef = React.useRef<number>();

  const animate = (time: number) => {
    callback(time);
    frameRef.current = requestAnimationFrame(animate);
  };

  React.useEffect(() => {
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [callback]);
};

/**
 * Virtual scrolling for large lists - improves performance
 */
interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  containerHeight?: number;
  overscan?: number;
}

export const VirtualList = React.forwardRef<HTMLDivElement, VirtualListProps<any>>(
  (
    {
      items,
      itemHeight,
      renderItem,
      containerHeight = 500,
      overscan = 3,
    },
    ref
  ) => {
    const [scrollTop, setScrollTop] = React.useState(0);

    const visibleRange = Math.ceil(containerHeight / itemHeight) + overscan * 2;
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / itemHeight) - overscan
    );
    const endIndex = Math.min(items.length, startIndex + visibleRange);

    const visibleItems = items.slice(startIndex, endIndex);
    const offsetY = startIndex * itemHeight;

    return (
      <div
        ref={ref}
        style={{ height: containerHeight, overflow: 'auto' }}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        className="border border-stone-200 rounded-lg"
      >
        <div style={{ height: items.length * itemHeight }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleItems.map((item, idx) =>
              renderItem(item, startIndex + idx)
            )}
          </div>
        </div>
      </div>
    );
  }
);

VirtualList.displayName = 'VirtualList';
