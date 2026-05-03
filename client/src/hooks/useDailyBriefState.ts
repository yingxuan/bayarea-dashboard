import { useCallback, useEffect, useMemo, useState } from "react";

export type BriefSectionKey = "home" | "finance" | "work" | "food" | "housing" | "video" | "startup";

export interface BriefItem {
  id?: string;
  url?: string;
  title?: string;
  publishedAt?: string;
}

interface DailyBriefState {
  lastBriefDate?: string;
  lastVisitAtBySection: Partial<Record<BriefSectionKey, number>>;
  seenItemsBySection: Partial<Record<BriefSectionKey, Record<string, number>>>;
}

const STORAGE_KEY = "bayareaDash.dailyBrief.v1";
const STATE_EVENT = "bayareaDash:dailyBriefStateChanged";
const MAX_SEEN_ITEMS_PER_SECTION = 120;

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
}

function getDateKey(timestamp?: number) {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
}

function getEmptyState(): DailyBriefState {
  return {
    lastVisitAtBySection: {},
    seenItemsBySection: {},
  };
}

function readState(): DailyBriefState {
  if (typeof window === "undefined") return getEmptyState();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getEmptyState();
    const parsed = JSON.parse(raw) as Partial<DailyBriefState>;
    return {
      lastBriefDate: parsed.lastBriefDate,
      lastVisitAtBySection: parsed.lastVisitAtBySection || {},
      seenItemsBySection: parsed.seenItemsBySection || {},
    };
  } catch {
    return getEmptyState();
  }
}

function writeState(next: DailyBriefState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(STATE_EVENT));
}

function getItemKey(item: BriefItem) {
  return item.id || item.url || `${item.title || "item"}:${item.publishedAt || "na"}`;
}

function trimSeenItems(items: Record<string, number>) {
  const trimmed: Record<string, number> = {};
  const entries = Object.entries(items)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SEEN_ITEMS_PER_SECTION);

  for (const [key, value] of entries) {
    trimmed[key] = value;
  }

  return trimmed;
}

export function useDailyBriefState() {
  const [state, setState] = useState<DailyBriefState>(() => readState());
  const todayKey = useMemo(() => getTodayKey(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sync = () => setState(readState());
    window.addEventListener("storage", sync);
    window.addEventListener(STATE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(STATE_EVENT, sync);
    };
  }, []);

  const updateState = useCallback((updater: (current: DailyBriefState) => DailyBriefState) => {
    const next = updater(readState());
    writeState(next);
    setState(next);
  }, []);

  const markBriefSeen = useCallback(() => {
    updateState((current) => ({
      ...current,
      lastBriefDate: todayKey,
      lastVisitAtBySection: {
        ...current.lastVisitAtBySection,
        home: Date.now(),
      },
    }));
  }, [todayKey, updateState]);

  const markSectionVisited = useCallback(
    (section: BriefSectionKey) => {
      updateState((current) => ({
        ...current,
        lastVisitAtBySection: {
          ...current.lastVisitAtBySection,
          [section]: Date.now(),
        },
      }));
    },
    [updateState],
  );

  const markItemsSeen = useCallback(
    (section: BriefSectionKey, items: BriefItem[]) => {
      if (items.length === 0) return;
      updateState((current) => {
        const existing = current.seenItemsBySection[section] || {};
        const now = Date.now();
        const nextSeen = { ...existing };
        for (const item of items) {
          nextSeen[getItemKey(item)] = now;
        }
        return {
          ...current,
          seenItemsBySection: {
            ...current.seenItemsBySection,
            [section]: trimSeenItems(nextSeen),
          },
        };
      });
    },
    [updateState],
  );

  const getUnreadCount = useCallback(
    (section: BriefSectionKey, items: BriefItem[]) => {
      const seen = state.seenItemsBySection[section] || {};
      return items.filter((item) => !seen[getItemKey(item)]).length;
    },
    [state.seenItemsBySection],
  );

  const sectionNeedsReview = useCallback(
    (section: BriefSectionKey) => {
      if (section === "home") return state.lastBriefDate !== todayKey;
      return getDateKey(state.lastVisitAtBySection[section]) !== todayKey;
    },
    [state.lastBriefDate, state.lastVisitAtBySection, todayKey],
  );

  return {
    todayKey,
    isFirstBriefToday: state.lastBriefDate !== todayKey,
    markBriefSeen,
    markSectionVisited,
    markItemsSeen,
    getUnreadCount,
    sectionNeedsReview,
  };
}
