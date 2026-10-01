import { Check, ChevronsRight, Clock, FolderInput, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { Decision } from './types';

/** Where a card flies when it leaves the stage. */
export type ExitDir = 'right' | 'left' | 'down' | 'up' | 'fade';

export type DecisionKind = 'keep' | 'delete' | 'later' | 'shortcut' | 'skip';

export function decisionKind(decision: Decision | string): DecisionKind {
  if (decision === 'keep' || decision === 'delete' || decision === 'later' || decision === 'skip') {
    return decision;
  }
  return 'shortcut';
}

export const EXIT_DIR: Record<DecisionKind, ExitDir> = {
  keep: 'right',
  delete: 'left',
  later: 'down',
  shortcut: 'up',
  skip: 'fade',
};

export const DECISION_ICON: Record<DecisionKind, LucideIcon> = {
  keep: Check,
  delete: Trash2,
  later: Clock,
  shortcut: FolderInput,
  skip: ChevronsRight,
};
