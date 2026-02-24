import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';

export interface ReplayPasteHighlight {
  id: string;
  messageId: string | number;
  snippet: string;
  timestamp: number;
  timeLabel: string;
}

interface HighlightMatch {
  start: number;
  end: number;
  highlight: ReplayPasteHighlight;
}

const normalizeForComparison = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[`*_#>|[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const getWordCount = (value: string): number => {
  return value.trim().split(/\s+/).filter(Boolean).length;
};

const hasListMarkers = (value: string): boolean => {
  return /(^|\n)\s*(?:[-*+]|\d+[.)])\s+/.test(value);
};

const buildCandidateSnippets = (rawSnippet: string): string[] => {
  const candidates = new Set<string>();
  const snippetContainsList = hasListMarkers(rawSnippet);

  const addCandidate = (value: string, options?: { allowShort?: boolean }) => {
    const trimmed = value.trim();
    const words = getWordCount(trimmed);
    const allowShort = options?.allowShort ?? false;
    const isStrongEnough = allowShort
      ? trimmed.length >= 6 && (words >= 2 || trimmed.length >= 12)
      : trimmed.length >= 10 && (words >= 3 || trimmed.length >= 20);
    if (isStrongEnough) {
      candidates.add(trimmed);
    }
  };

  const normalizedSnippet = rawSnippet.replace(/\s+/g, ' ').trim();
  addCandidate(rawSnippet);
  addCandidate(normalizedSnippet);
  addCandidate(rawSnippet.replace(/[`*_#>|[\]()-]/g, ' ').replace(/\s+/g, ' ').trim());

  // Long snippets (e.g., pasted markdown tables) often don't exist as one contiguous text node.
  // Add line/cell-level candidates so table cells can be highlighted individually.
  const lines = rawSnippet
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  lines.forEach((line) => {
    if (/^[:|\-\s]+$/.test(line)) {
      return;
    }

    const listItemMatch = line.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/);
    const baseLine = listItemMatch ? listItemMatch[1] : line;
    const allowShortForLine = snippetContainsList && Boolean(listItemMatch);

    addCandidate(baseLine, { allowShort: allowShortForLine });
    addCandidate(baseLine.replace(/\s+/g, ' ').trim(), { allowShort: allowShortForLine });
    addCandidate(
      baseLine.replace(/[`*_#>|[\]()-]/g, ' ').replace(/\s+/g, ' ').trim(),
      { allowShort: allowShortForLine }
    );

    if (line.includes('|')) {
      const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length >= 3 && !/^:?-{2,}:?$/.test(cell));
      cells.forEach((cell) => addCandidate(cell, { allowShort: snippetContainsList }));
    }
  });

  if (normalizedSnippet.length >= 60) {
    addCandidate(normalizedSnippet.slice(0, 120).trim());
    addCandidate(normalizedSnippet.slice(0, 60).trim());
  }

  return Array.from(candidates).slice(0, 40);
};

const collectHighlightMatches = (text: string, highlights: ReplayPasteHighlight[]): HighlightMatch[] => {
  if (!text || highlights.length === 0) {
    return [];
  }

  const allMatches: HighlightMatch[] = [];
  const lowerText = text.toLowerCase();

  highlights.forEach((highlight) => {
    const rawSnippet = highlight.snippet.trim();
    if (rawSnippet.length < 3) {
      return;
    }

    const candidateSnippets = buildCandidateSnippets(rawSnippet);

    for (const snippet of candidateSnippets) {
      const lowerSnippet = snippet.toLowerCase();
      let searchIndex = 0;

      while (searchIndex < lowerText.length) {
        const matchIndex = lowerText.indexOf(lowerSnippet, searchIndex);
        if (matchIndex === -1) {
          break;
        }

        allMatches.push({
          start: matchIndex,
          end: matchIndex + snippet.length,
          highlight,
        });
        searchIndex = matchIndex + snippet.length;
      }
    }
  });

  if (allMatches.length === 0) {
    // Fallback: if this whole text node is included in pasted content, highlight the node.
    // This is especially useful for plain-text copies of rendered tables where row text
    // may not preserve explicit cell delimiters.
    const normalizedText = normalizeForComparison(text);
    const textWordCount = getWordCount(normalizedText);
    if (normalizedText.length >= 20 && textWordCount >= 3) {
      const matchedHighlight = highlights.find((highlight) => {
        const normalizedSnippet = normalizeForComparison(highlight.snippet);
        return normalizedSnippet.includes(normalizedText);
      });

      if (matchedHighlight) {
        return [{
          start: 0,
          end: text.length,
          highlight: matchedHighlight,
        }];
      }
    }

    return [];
  }

  allMatches.sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    return (b.end - b.start) - (a.end - a.start);
  });

  const dedupedMatches: HighlightMatch[] = [];
  let cursor = 0;

  for (const match of allMatches) {
    if (match.start < cursor) {
      continue;
    }
    dedupedMatches.push(match);
    cursor = match.end;
  }

  return dedupedMatches;
};

const renderHighlightedText = (
  text: string,
  highlights: ReplayPasteHighlight[],
  onReplayPasteClick?: (timestamp: number) => void
): ReactNode => {
  const matches = collectHighlightMatches(text, highlights);
  if (matches.length === 0) {
    return text;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      parts.push(text.slice(cursor, match.start));
    }

    const highlightedText = text.slice(match.start, match.end);
    parts.push(
      <button
        key={`${match.highlight.id}-${match.start}-${index}`}
        type="button"
        className="inline rounded-sm bg-amber-200/90 px-0.5 text-amber-950 underline decoration-amber-500/70 underline-offset-2 hover:bg-amber-300 transition-colors"
        style={{ textAlign: 'inherit' }}
        data-tooltip-id="timeline-tooltip"
        data-tooltip-html={`<div style="max-width: 220px;"><div class="font-semibold text-emerald-300">Internal Paste</div><div class="text-xs text-gray-300 mt-1">at ${match.highlight.timeLabel}</div></div>`}
        aria-label={`Internal paste at ${match.highlight.timeLabel}`}
        data-replay-highlight-id={match.highlight.id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onReplayPasteClick?.(match.highlight.timestamp);
        }}
      >
        {highlightedText}
      </button>
    );

    cursor = match.end;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
};

export const renderHighlightedChildren = (
  children: ReactNode,
  highlights: ReplayPasteHighlight[],
  onReplayPasteClick?: (timestamp: number) => void
): ReactNode => {
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      return renderHighlightedText(child, highlights, onReplayPasteClick);
    }

    if (!isValidElement<{ children?: ReactNode }>(child)) {
      return child;
    }

    const typedChild = child as ReactElement<{ children?: ReactNode }>;
    if (typeof typedChild.type === 'string') {
      if (typedChild.type === 'code' || typedChild.type === 'pre' || typedChild.type === 'button') {
        return typedChild;
      }
    }

    if (typedChild.props.children === undefined) {
      return typedChild;
    }

    return cloneElement(
      typedChild,
      typedChild.props,
      renderHighlightedChildren(typedChild.props.children, highlights, onReplayPasteClick)
    );
  });
};
