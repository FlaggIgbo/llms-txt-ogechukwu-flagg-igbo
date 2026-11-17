// Parameters for computing the next check schedule.
export interface CadenceCalculationInput {
  changed: boolean;
  currentIntervalHours: number;
  unchangedStreak: number;
  isInitial?: boolean;
}

// Result of the cadence calculation.
export interface CadenceCalculationOutput {
  newIntervalHours: number;
  newStreak: number;
  nextCheckAt: Date;
}

// Compute the next check interval using adaptive backoff.
export function computeNextCadence(input: CadenceCalculationInput): CadenceCalculationOutput {
  const FLOOR_HOURS = 6;
  const CEILING_HOURS = 24 * 30; // 30 days

  // If this is the initial crawl, initialize interval from category baseline without backoff
  if (input.isInitial) {
    const nextCheckAt = new Date(Date.now() + input.currentIntervalHours * 3600 * 1000);
    return {
      newIntervalHours: input.currentIntervalHours,
      newStreak: 0,
      nextCheckAt,
    };
  }

  // If content changed, halve interval and reset streak.
  if (input.changed) {
    const newInterval = Math.max(FLOOR_HOURS, Math.floor(input.currentIntervalHours / 2));
    const nextCheckAt = new Date(Date.now() + newInterval * 3600 * 1000);
    return {
      newIntervalHours: newInterval,
      newStreak: 0,
      nextCheckAt,
    };
  }

  // If unchanged, increment streak and multiply interval by 1.5.
  const newStreak = input.unchangedStreak + 1;
  const newInterval = Math.min(CEILING_HOURS, Math.floor(input.currentIntervalHours * 1.5));
  const nextCheckAt = new Date(Date.now() + newInterval * 3600 * 1000);

  return {
    newIntervalHours: newInterval,
    newStreak,
    nextCheckAt,
  };
}

