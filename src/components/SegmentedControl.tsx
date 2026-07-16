import { useRef, useState, useEffect, useCallback } from 'react';
import { usePressable } from '../hooks/usePressable';

export interface Segment {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps {
  segments: Segment[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export function SegmentedControl({ segments, activeId, onChange, className = '' }: SegmentedControlProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const pressable = usePressable();

  const updateIndicator = useCallback(() => {
    if (!containerRef.current) return;
    const activeEl = containerRef.current.querySelector(`[data-segment-id="${activeId}"]`) as HTMLElement | null;
    if (activeEl) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();
      setIndicatorStyle({
        left: activeRect.left - containerRect.left,
        width: activeRect.width,
      });
    }
  }, [activeId]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  // Recalculate on resize
  useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex rounded-[var(--radius-md)] bg-surface-muted p-0.5 ${className}`}
      role="tablist"
    >
      {/* Animated indicator */}
      <span
        className="absolute top-0.5 bottom-0.5 rounded-[var(--radius-sm)] bg-surface elevated-1 transition-all duration-base ease-standard pointer-events-none"
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
      />

      {segments.map((segment) => {
        const isActive = activeId === segment.id;
        return (
          <button
            key={segment.id}
            data-segment-id={segment.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(segment.id)}
            className={[
              'relative z-10 flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)]',
              'h-8 px-3 text-footnote font-medium whitespace-nowrap select-none',
              'transition-colors duration-fast ease-out cursor-pointer',
              isActive
                ? 'text-text'
                : 'text-text-tertiary hover:text-text-secondary',
            ].join(' ')}
            {...pressable}
          >
            {segment.icon && (
              <span className="h-3.5 w-3.5 shrink-0 flex items-center justify-center">
                {segment.icon}
              </span>
            )}
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
export default SegmentedControl;
