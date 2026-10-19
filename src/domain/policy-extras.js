/** 只提取金额与月份明确的大病医疗定额供政策详情展示，不参与工资测算。 */
export function readSeriousIllness(config = {}) {
  return Object.fromEntries(['personal', 'company'].map((side) => {
    const entries = config?.[`${side}SeriousIllnessAmounts`];
    const amounts = (Array.isArray(entries) ? entries : []).flatMap((entry) => {
      if (entry?.amount === '' || entry?.amount === null || entry?.amount === undefined) return [];
      const amount = Number(entry.amount);
      const months = Array.isArray(entry.months)
        ? [...new Set(entry.months.map(Number).filter((month) => Number.isInteger(month) && month >= 1 && month <= 12))]
        : [];
      if (!Number.isFinite(amount) || amount < 0 || !months.length) return [];
      return [{ amount, months }];
    });
    return [side, amounts];
  }));
}
