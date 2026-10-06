export const PRICE = 5;
export const GROUP_IDS = ['1', '2', '3', '4', '5', '6', '7', 'f5'];
export const TEAMS = [
  { id: 'a', name: 'Team A', groupIds: ['1', '2', '3'] },
  { id: 'b', name: 'Team B', groupIds: ['4', '5', '6', '7'] },
];
export function getTeamForGroup(id) { return TEAMS.find(team => team.groupIds.includes(id)) ?? null; }
export const ACHIEVEMENTS = [
  { threshold: 10, title: '初露锋芒', symbol: '✦' },
  { threshold: 25, title: '默契集结', symbol: '◆' },
  { threshold: 50, title: '善意先锋', symbol: '⚑' },
  { threshold: 100, title: '百张荣耀', symbol: '★' },
];

function fail(message) { throw new Error(message); }

function validateDate(value, label, nullable = true) {
  if (value === null && nullable) return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    fail(`${label}须为包含时区的日期时间，或 null。`);
  }
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) fail(`${label}日期无效。`);
}

function validateGroups(groups) {
  if (!Array.isArray(groups) || groups.length !== GROUP_IDS.length) fail('必须包含第 1–7 组和 F5 共八组。');
  const seen = new Set();
  for (const group of groups) {
    if (!group || !GROUP_IDS.includes(group.id) || seen.has(group.id)) fail('小组编号缺失、重复或无效。');
    seen.add(group.id);
    if (typeof group.name !== 'string' || !group.name.trim() || group.name.length > 40) fail(`组 ${group.id} 的队名须为 1–40 个字符。`);
    if (!Number.isSafeInteger(group.verifiedSold) || group.verifiedSold < 0 || group.verifiedSold > 1_000_000) fail(`组 ${group.id} 的核实销量须为非负整数，且不超过 1,000,000。`);
    if (typeof group.treasuryReceived !== 'number' || !Number.isFinite(group.treasuryReceived) || group.treasuryReceived < 0 || group.treasuryReceived > group.verifiedSold * PRICE || Math.abs(group.treasuryReceived * 100 - Math.round(group.treasuryReceived * 100)) > 0.000001) fail(`组 ${group.id} 的财政已收金额须为有效 RM 金额，不超过核实销量 × RM5。`);
    if (typeof group.handoffComplete !== 'boolean') fail(`组 ${group.id} 的交接状态须为 true 或 false。`);
    if (group.handoffComplete && group.treasuryReceived !== group.verifiedSold * PRICE) fail(`组 ${group.id} 标记圆满交接前，财政须收齐对应钱款。`);
  }
}

export function validateEvent(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('活动数据格式无效。');
  if (!['live', 'final'].includes(data.status)) fail('活动状态须为 live 或 final。');
  validateDate(data.updatedAt, '更新时间');
  validateDate(data.deadline, '截止日期');
  validateGroups(data.groups);
  if (data.updatedAt === null && data.groups.some(g => g.verifiedSold > 0 || g.treasuryReceived > 0 || g.handoffComplete)) fail('发布成绩时须填写更新时间。');
  if (data.status === 'final') {
    if (!data.finalSnapshot || typeof data.finalSnapshot !== 'object') fail('结赛须先生成最终成绩快照。');
    validateDate(data.finalSnapshot.confirmedAt, '结赛确认时间', false);
    validateDate(data.finalSnapshot.deadline, '最终截止日期');
    validateGroups(data.finalSnapshot.groups);
  } else if (data.finalSnapshot !== null) {
    fail('已有最终成绩快照，请使用 final 状态或先明确解除结赛锁定。');
  }
  return data;
}

export function rankGroups(groups) {
  const sorted = groups.filter(g => g.id !== 'f5').slice().sort((a, b) => b.verifiedSold - a.verifiedSold || Number(a.id) - Number(b.id));
  return sorted.map((group, index) => {
    const firstEqual = sorted.findIndex(g => g.verifiedSold === group.verifiedSold);
    const higher = sorted.slice(0, index).filter(g => g.verifiedSold > group.verifiedSold).at(-1);
    return { ...group, rank: firstEqual + 1, gap: higher ? higher.verifiedSold - group.verifiedSold : 0 };
  });
}

export function getAchievements(group) {
  return ACHIEVEMENTS.map(a => ({ ...a, unlocked: group.verifiedSold >= a.threshold }));
}

export function summarizeEvent(data) {
  validateEvent(data);
  const groups = data.status === 'final' ? data.finalSnapshot.groups : data.groups;
  const totalSold = groups.reduce((sum, g) => sum + g.verifiedSold, 0);
  const treasuryReceived = groups.reduce((sum, g) => sum + Math.round(g.treasuryReceived * 100), 0) / 100;
  const milestones = Math.floor(totalSold / 100);
  const nextMilestone = (milestones + 1) * 100;
  const rankings = rankGroups(groups);
  const teams = TEAMS.map(team => {
    const members = groups.filter(group => team.groupIds.includes(group.id));
    const verifiedSold = members.reduce((sum, group) => sum + group.verifiedSold, 0);
    return { ...team, verifiedSold, totalValue: verifiedSold * PRICE };
  });
  return {
    groups, teams, rankings, totalSold, treasuryReceived, totalValue: totalSold * PRICE,
    milestones, nextMilestone, milestoneProgress: totalSold % 100,
    deadline: data.status === 'final' ? data.finalSnapshot.deadline : data.deadline,
    updatedAt: data.status === 'final' ? data.finalSnapshot.confirmedAt : data.updatedAt,
    champions: data.status === 'final' && rankings[0].verifiedSold > 0 ? rankings.filter(g => g.rank === 1) : [],
    f5: groups.find(g => g.id === 'f5'),
  };
}
