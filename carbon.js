const categoryLabels = { transport: "이동", energy: "전력", food: "식사" };

export function analyzeEmissions(records) {
  const totals = new Map();
  let biggest = null;
  let total = 0;
  for (const record of records) {
    total += record.emission;
    totals.set(record.category, (totals.get(record.category) ?? 0) + record.emission);
    if (!biggest || record.emission > biggest.emission) biggest = record;
  }
  const categories = [...totals.entries()].map(([key, value]) => ({ label: categoryLabels[key] ?? key, value }));
  return { total, categories, biggest, max: Math.max(0, ...categories.map(({ value }) => value)) };
}

export function reviewActivities(records, events, factors) {
  return records.map((record) => {
    const event = events.find((candidate) => candidate.id === record.eventId);
    const alternatives = (event?.choices ?? [])
      .filter((choice) => choice.id !== record.choiceId && choice.activity?.category === record.category)
      .map((choice) => {
        const activity = choice.activity;
        const factor = factors.factors[activity.mode];
        if (!factor || Math.abs(activity.distanceKm - record.amount) > 0.01) return null;
        return {
          choiceText: choice.text,
          emission: activity.distanceKm * factor.value,
          factor: factor.value,
          factorUnit: factor.unit,
        };
      })
      .filter((alternative) => alternative && alternative.emission < record.emission)
      .sort((left, right) => left.emission - right.emission);
    return { ...record, eventTitle: event?.title ?? record.eventTitle, alternatives };
  });
}

export function formatEmission(value) {
  return new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}