export type User = { id: number; displayName?: string | null };
export type Exercise = {
  id: number;
  slug: string;
  name: string;
  movementPattern?: string | null;
  equipment?: string | null;
  description?: string | null;
  techniqueNotes?: string | null;
  safetyNotes?: string | null;
  videoUrl?: string | null;
  isActive: boolean;
};
export type RoutineSet = {
  setNumber: number;
  setType?: string | null;
  targetWeightKg?: number | null;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetSeconds?: number | null;
  targetRpe?: number | null;
  notes?: string | null;
};
export type RoutineExercise = {
  id?: number;
  exerciseId: number;
  position: number;
  exercise?: Exercise;
  sets: RoutineSet[];
  restSeconds?: number | null;
  targetRpe?: number | null;
  notes?: string | null;
};
export type RoutineSummary = {
  id: number;
  name: string;
  description?: string | null;
  currentVersion: {
    id: number;
    versionNumber: number;
    name: string | null;
    notes: string | null;
  };
};
export type RoutineDetail = Omit<RoutineSummary, "currentVersion"> & {
  version: {
    id: number;
    versionNumber: number;
    name: string | null;
    notes: string | null;
    isCurrent: boolean;
    exercises: RoutineExercise[];
  };
};
export type Routine = RoutineSummary | RoutineDetail;
export type WorkoutSet = {
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  rpe: number | null;
  completed: boolean;
  painLevel: number | null;
  painArea: string | null;
  notes: string | null;
};
export type Workout = {
  id: number;
  status: "in_progress" | "completed" | "cancelled";
  routineVersionId: number;
  startedAt: string;
  completedAt?: string | null;
  planning?: { name: string; version: RoutineDetail["version"] };
  results?: Array<{
    routineExerciseId: number;
    exerciseId: number;
    sets: WorkoutSet[];
    notes?: string | null;
  }>;
};
export type MetricType = {
  code: string;
  name: string;
  unit?: string | null;
  description?: string | null;
};
export type Measurement = {
  id: number;
  measuredAt: string;
  source?: string | null;
  notes?: string | null;
  metrics: Record<string, { value: number; unit?: string | null }>;
};
