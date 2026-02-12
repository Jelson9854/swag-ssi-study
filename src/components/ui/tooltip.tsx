'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

type TooltipPlace = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  id: string;
  place?: TooltipPlace;
  className?: string;
  style?: CSSProperties;
  noArrow?: boolean;
  opacity?: number;
}

interface TooltipState {
  visible: boolean;
  anchor: HTMLElement | null;
  content: string;
  html: string;
}

const DEFAULT_TOOLTIP_CLASS =
  'pointer-events-none fixed z-50 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--popover))] px-2 py-1 text-xs text-[hsl(var(--popover-foreground))] shadow-md';

const getAnchorForId = (target: EventTarget | null, id: string): HTMLElement | null => {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLElement>(`[data-tooltip-id="${id}"]`);
};

const getPositionStyle = (rect: DOMRect, place: TooltipPlace): CSSProperties => {
  const gap = 8;

  switch (place) {
    case 'bottom':
      return {
        left: rect.left + rect.width / 2,
        top: rect.bottom + gap,
        transform: 'translate(-50%, 0)',
      };
    case 'left':
      return {
        left: rect.left - gap,
        top: rect.top + rect.height / 2,
        transform: 'translate(-100%, -50%)',
      };
    case 'right':
      return {
        left: rect.right + gap,
        top: rect.top + rect.height / 2,
        transform: 'translate(0, -50%)',
      };
    case 'top':
    default:
      return {
        left: rect.left + rect.width / 2,
        top: rect.top - gap,
        transform: 'translate(-50%, -100%)',
      };
  }
};

const getArrowStyle = (place: TooltipPlace): CSSProperties => {
  switch (place) {
    case 'bottom':
      return { top: -4, left: '50%', transform: 'translateX(-50%) rotate(45deg)' };
    case 'left':
      return { right: -4, top: '50%', transform: 'translateY(-50%) rotate(45deg)' };
    case 'right':
      return { left: -4, top: '50%', transform: 'translateY(-50%) rotate(45deg)' };
    case 'top':
    default:
      return { bottom: -4, left: '50%', transform: 'translateX(-50%) rotate(45deg)' };
  }
};

export function Tooltip({
  id,
  place = 'top',
  className = '',
  style,
  noArrow = false,
  opacity = 1,
}: TooltipProps) {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<TooltipState>({
    visible: false,
    anchor: null,
    content: '',
    html: '',
  });
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);

  const hideTooltip = () => {
    setState((prev) => {
      if (!prev.visible) return prev;
      return { ...prev, visible: false, anchor: null, content: '', html: '' };
    });
    setAnchorRect(null);
  };

  useEffect(() => {
    setMounted(true);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const scheduleRectUpdate = (anchor: HTMLElement) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        setAnchorRect(anchor.getBoundingClientRect());
      });
    };

    const showTooltip = (anchor: HTMLElement) => {
      const nextContent = anchor.getAttribute('data-tooltip-content') ?? '';
      const nextHtml = anchor.getAttribute('data-tooltip-html') ?? '';

      if (!nextContent && !nextHtml) {
        hideTooltip();
        return;
      }

      setState((prev) => {
        if (
          prev.visible &&
          prev.anchor === anchor &&
          prev.content === nextContent &&
          prev.html === nextHtml
        ) {
          return prev;
        }
        return {
          visible: true,
          anchor,
          content: nextContent,
          html: nextHtml,
        };
      });
      scheduleRectUpdate(anchor);
    };

    const handlePointerOver = (event: Event) => {
      const anchor = getAnchorForId(event.target, id);
      if (!anchor) {
        return;
      }
      showTooltip(anchor);
    };

    const handlePointerOut = (event: Event) => {
      const currentAnchor = state.anchor;
      if (!currentAnchor) {
        return;
      }
      const relatedTarget = (event as MouseEvent).relatedTarget;
      if (relatedTarget instanceof Element && currentAnchor.contains(relatedTarget)) {
        return;
      }
      hideTooltip();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const anchor = getAnchorForId(event.target, id);
      if (!anchor) {
        return;
      }
      showTooltip(anchor);
    };

    const handleFocusOut = () => {
      hideTooltip();
    };

    const handleViewportChange = () => {
      if (state.visible && state.anchor) {
        scheduleRectUpdate(state.anchor);
      }
    };

    document.addEventListener('pointerover', handlePointerOver);
    document.addEventListener('pointerout', handlePointerOut);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerout', handlePointerOut);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [id, state.anchor, state.visible]);

  const positionStyle = useMemo(() => {
    if (!anchorRect) {
      return {};
    }
    return getPositionStyle(anchorRect, place);
  }, [anchorRect, place]);

  if (!mounted || !state.visible || !anchorRect) {
    return null;
  }

  return createPortal(
    <div
      role="tooltip"
      className={`${DEFAULT_TOOLTIP_CLASS} ${className}`.trim()}
      style={{ ...positionStyle, ...style, opacity }}
    >
      {!noArrow && (
        <span
          aria-hidden="true"
          className="absolute block h-2 w-2 border-l border-t border-[hsl(var(--border))] bg-[hsl(var(--popover))]"
          style={getArrowStyle(place)}
        />
      )}
      {state.html ? (
        <div dangerouslySetInnerHTML={{ __html: state.html }} />
      ) : (
        <div>{state.content}</div>
      )}
    </div>,
    document.body
  );
}
