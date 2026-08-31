export function decorateAdvisorCounts(advisors) {
  const counts = advisors.map((advisor) => Number(advisor.count || 0));
  const max = counts.length ? Math.max(...counts) : 0;
  const min = counts.length ? Math.min(...counts) : 0;

  const decorated = advisors
    .map((advisor) => {
      const count = Number(advisor.count || 0);
      const difference = max - count;
      return {
        ...advisor,
        count,
        difference,
        level: difference === 0 ? 'green' : difference === 1 ? 'yellow' : 'red',
        priority: max - count >= 3,
      };
    })
    .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name, 'es'));

  return {
    advisors: decorated,
    priorityNames: decorated.filter((advisor) => advisor.priority).map((advisor) => advisor.name),
    spread: max - min,
    max,
    min,
  };
}
