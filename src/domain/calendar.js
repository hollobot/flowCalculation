const DAY = 86_400_000;

// 放假区间包括调休；paid 单列法定带薪节日，不能把整段长假全当作计薪日。
// 来源与维护方法见 README；新增年份必须核对国务院年度放假通知。
const calendars = {
  2025: {
    holidays: [['01-01', '01-01'], ['01-28', '02-04'], ['04-04', '04-06'], ['05-01', '05-05'], ['05-31', '06-02'], ['10-01', '10-08']],
    work: ['01-26', '02-08', '04-27', '09-28', '10-11'],
    paid: ['01-01', '01-28', '01-29', '01-30', '01-31', '04-04', '05-01', '05-02', '05-31', '10-01', '10-02', '10-03', '10-06'],
  },
  2026: {
    holidays: [['01-01', '01-03'], ['02-15', '02-23'], ['04-04', '04-06'], ['05-01', '05-05'], ['06-19', '06-21'], ['09-25', '09-27'], ['10-01', '10-07']],
    work: ['01-04', '02-14', '02-28', '05-09', '09-20', '10-10'],
    paid: ['01-01', '02-16', '02-17', '02-18', '02-19', '04-05', '05-01', '05-02', '06-19', '09-25', '10-01', '10-02', '10-03'],
  },
};

export const calendarYears = Object.keys(calendars).join('、');

export function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('请填写完整的入职、离职日期');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('日期无效');
  if (date.getUTCFullYear() < 2019) throw new Error('累计个税计算支持 2019 年及以后');
  return date;
}

export function listMonths(start, end) {
  const first = parseDate(start);
  const last = parseDate(end);
  if (first > last) throw new Error('离职日期不能早于入职日期');
  const result = [];
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  while (cursor <= last) {
    result.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

function isPaidDay(date, calendar) {
  const key = date.toISOString().slice(5, 10);
  if (calendar.paid.includes(key) || calendar.work.includes(key)) return true;
  if (calendar.holidays.some(([start, end]) => key >= start && key <= end)) return false;
  return date.getUTCDay() !== 0 && date.getUTCDay() !== 6;
}

export function getAttendance(month, start, end) {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const from = start > first ? start : first;
  const to = end < last ? end : last;
  const fullMonth = from === first && to === last;
  const calendar = calendars[year];
  if (!calendar) {
    if (fullMonth) return { fullMonth: true, paidDays: null, totalDays: null, from, to };
    throw new Error(`${year} 年节假日日历尚未收录，无法折算 ${month}；当前支持 ${calendarYears} 年的非整月计算`);
  }
  let totalDays = 0;
  let paidDays = 0;
  for (let stamp = Date.parse(`${first}T00:00:00Z`); stamp <= Date.parse(`${last}T00:00:00Z`); stamp += DAY) {
    const date = new Date(stamp);
    if (!isPaidDay(date, calendar)) continue;
    totalDays++;
    const day = date.toISOString().slice(0, 10);
    if (day >= from && day <= to) paidDays++;
  }
  return { fullMonth, paidDays, totalDays, from, to };
}
