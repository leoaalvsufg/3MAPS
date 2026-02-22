import { useCallback, useRef, useState } from 'react';

const DEFAULT_MAX_HISTORY = 30;

interface UndoRedoResult<T> {
  state: T;
  setState: (newState: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (state: T) => void;
}

/**
 * Generic undo/redo hook using a history stack.
 *
 * Uses `useRef` for the history stack to avoid unnecessary re-renders.
 * Only the current state and cursor position trigger re-renders.
 */
export function useUndoRedo<T>(initialState: T, maxHistory = DEFAULT_MAX_HISTORY): UndoRedoResult<T> {
  // history[cursor] is the current state
  const historyRef = useRef<T[]>([initialState]);
  const cursorRef = useRef<number>(0);

  // We use a counter to force re-renders when undo/redo/setState is called
  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  const setState = useCallback(
    (newState: T) => {
      const history = historyRef.current;
      const cursor = cursorRef.current;

      // Discard any redo states beyond current cursor
      const trimmed = history.slice(0, cursor + 1);
      trimmed.push(newState);

      // Enforce max history size (keep the most recent entries)
      if (trimmed.length > maxHistory) {
        trimmed.splice(0, trimmed.length - maxHistory);
      }

      historyRef.current = trimmed;
      cursorRef.current = trimmed.length - 1;
      forceUpdate();
    },
    [maxHistory, forceUpdate]
  );

  const undo = useCallback(() => {
    if (cursorRef.current <= 0) return;
    cursorRef.current -= 1;
    forceUpdate();
  }, [forceUpdate]);

  const redo = useCallback(() => {
    if (cursorRef.current >= historyRef.current.length - 1) return;
    cursorRef.current += 1;
    forceUpdate();
  }, [forceUpdate]);

  const reset = useCallback(
    (newState: T) => {
      historyRef.current = [newState];
      cursorRef.current = 0;
      forceUpdate();
    },
    [forceUpdate]
  );

  const cursor = cursorRef.current;
  const history = historyRef.current;

  return {
    state: history[cursor],
    setState,
    undo,
    redo,
    canUndo: cursor > 0,
    canRedo: cursor < history.length - 1,
    reset,
  };
}
