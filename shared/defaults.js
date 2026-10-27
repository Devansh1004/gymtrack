export const uid = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 4);

export const DEFAULT_SETTINGS = {
  tz: 'Asia/Kolkata',
  notify: true,
  roast: 2,          // 0 off, 1 mild, 2 medium, 3 savage
  roastTime: '22:00', // end-of-day roast / summary
  nagAfter: 45,      // minutes after a missed reminder to nag once (0 = off)
  workoutWeight: 40, // % of score from workout (rest from tasks)
  streakMin: 70,     // score needed for a day to count in the streak
  height: null,
};

const ALL = [0, 1, 2, 3, 4, 5, 6];
export const PRESETS = [
  { title: 'Water', icon: '💧', amount: '500 ml', times: ['08:00', '10:30', '13:00', '15:30', '18:00', '20:30'] },
  { title: 'Creatine', icon: '🧪', amount: '5 g', times: ['09:00'] },
  { title: 'Protein shake', icon: '🥤', amount: '1 scoop', times: ['18:30'] },
  { title: 'Multivitamin', icon: '💊', amount: '', times: ['09:30'] },
  { title: 'Omega-3', icon: '🐟', amount: '', times: ['13:30'] },
  { title: 'Pre-workout meal', icon: '🍌', amount: '', times: ['16:30'] },
  { title: 'Protein goal', icon: '🎯', amount: '120 g', times: [] },
];
export function defaultTasks() {
  return PRESETS.slice(0, 3).concat(PRESETS.slice(6, 7)).map((p) => ({ id: uid(), enabled: true, days: ALL, ...p }));
}
export const newTask = (p = {}) => ({ id: uid(), title: '', icon: '✅', amount: '', times: [], days: ALL, enabled: true, ...p });

const ex = (name, sets, reps) => ({ name, sets, reps, weight: '', note: '' });
export const TEMPLATES = {
  Push: { name: 'Push day', exercises: [ex('Bench Press', 4, '8-10'), ex('Incline Dumbbell Press', 3, '10'), ex('Shoulder Press', 3, '10'), ex('Lateral Raise', 3, '15'), ex('Triceps Pushdown', 3, '12')] },
  Pull: { name: 'Pull day', exercises: [ex('Deadlift', 3, '5'), ex('Lat Pulldown', 4, '10'), ex('Seated Row', 3, '10'), ex('Face Pull', 3, '15'), ex('Biceps Curl', 3, '12')] },
  Legs: { name: 'Leg day', exercises: [ex('Squat', 4, '8'), ex('Leg Press', 3, '12'), ex('Romanian Deadlift', 3, '10'), ex('Leg Curl', 3, '12'), ex('Calf Raise', 4, '15')] },
  'Full body': { name: 'Full body', exercises: [ex('Squat', 3, '8'), ex('Bench Press', 3, '8'), ex('Barbell Row', 3, '8'), ex('Overhead Press', 3, '10'), ex('Plank', 3, '60s')] },
};

export const EXERCISES = ['Bench Press', 'Incline Bench Press', 'Incline Dumbbell Press', 'Dumbbell Fly', 'Push-up', 'Dips', 'Shoulder Press', 'Overhead Press', 'Lateral Raise', 'Rear Delt Fly', 'Face Pull', 'Triceps Pushdown', 'Skull Crusher', 'Deadlift', 'Pull-up', 'Chin-up', 'Lat Pulldown', 'Seated Row', 'Barbell Row', 'Dumbbell Row', 'Biceps Curl', 'Hammer Curl', 'Preacher Curl', 'Squat', 'Front Squat', 'Leg Press', 'Lunges', 'Romanian Deadlift', 'Leg Curl', 'Leg Extension', 'Hip Thrust', 'Calf Raise', 'Plank', 'Crunches', 'Hanging Leg Raise', 'Russian Twist', 'Farmer Walk', 'Cardio (min)'];
