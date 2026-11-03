const phases = ["morning", "forenoon", "lunch", "afternoon", "evening"];
const EXTRA_EVENT_CHANCE = 0.72;

export function createGame(role) {
  return {
    role,
    phaseIndex: 0,
    flags: {},
    visitedEvents: [],
    pendingSpecialAfterPhase: null,
    specialEventsPlayed: 0,
    choiceHistory: [],
    emissionRecords: [],
  };
}

function matchesConditions(conditions = {}, flags = {}) {
  return Object.entries(conditions).every(([key, value]) => flags[key] === value);
}

function weightedPick(events) {
  const total = events.reduce((sum, event) => sum + Math.max(0, event.weight ?? 1), 0);
  if (total <= 0) return events[0];
  let threshold = Math.random() * total;
  for (const event of events) {
    threshold -= Math.max(0, event.weight ?? 1);
    if (threshold < 0) return event;
  }
  return events.at(-1);
}

export function getCurrentEvent(state, scenario) {
  const phase = phases[state.phaseIndex];
  if (!phase) return null;
  if (state.pendingSpecialAfterPhase) {
    const specialCandidates = scenario.events.filter((event) =>
      event.special === true &&
      event.afterPhase === state.pendingSpecialAfterPhase &&
      event.phase === phase &&
      event.roles.includes(state.role) &&
      !state.visitedEvents.includes(event.id) &&
      matchesConditions(event.conditions, state.flags),
    );
    if (specialCandidates.length > 0) return weightedPick(specialCandidates);
    state.pendingSpecialAfterPhase = null;
  }
  const candidates = scenario.events.filter((event) =>
    event.special !== true &&
    event.phase === phase &&
    event.roles.includes(state.role) &&
    !state.visitedEvents.includes(event.id) &&
    matchesConditions(event.conditions, state.flags),
  );
  const event = weightedPick(candidates);
  if (!event) throw new Error(`기본 이벤트가 없습니다: ${phase}`);
  return event;
}

export function makeChoice(state, event, choice, factors, scenario) {
  state.visitedEvents.push(event.id);
  Object.assign(state.flags, choice.effects ?? {});
  const activity = choice.activity;
  state.choiceHistory.push({
    eventId: event.id,
    eventTitle: event.title,
    time: event.timeline?.clock ?? null,
    special: event.special === true,
    phase: event.phase,
    choiceId: choice.id,
    choiceText: choice.text,
    result: choice.result,
  });
  if (activity) {
    const factor = factors.factors[activity.mode];
    if (!factor) throw new Error(`배출계수가 없습니다: ${activity.mode}`);
    state.emissionRecords.push({
      eventId: event.id,
      eventTitle: event.title,
      choiceId: choice.id,
      choiceText: choice.text,
      category: activity.category,
      activityLabel: activity.label,
      amount: activity.distanceKm,
      unit: factor.unit,
      factor: factor.value,
      factorSource: factor.source,
      emission: activity.distanceKm * factor.value,
    });
  }
  if (event.special === true) {
    state.pendingSpecialAfterPhase = null;
    state.specialEventsPlayed += 1;
    return;
  }

  state.phaseIndex += 1;
  const hasSpecialEvents = scenario.events.some((specialEvent) =>
    specialEvent.special === true &&
    specialEvent.afterPhase === event.phase &&
    specialEvent.roles.includes(state.role) &&
    !state.visitedEvents.includes(specialEvent.id) &&
    matchesConditions(specialEvent.conditions, state.flags),
  );
  if (hasSpecialEvents) {
    state.pendingSpecialAfterPhase = state.specialEventsPlayed < 3 || Math.random() < EXTRA_EVENT_CHANCE
      ? event.phase
      : null;
  }
}

export function resetGame() {
  return createGame(null);
}