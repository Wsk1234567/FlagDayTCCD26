import { PRICE, GROUP_IDS, getTeamForGroup, getAchievements, summarizeEvent } from './league.js';

const $ = id => document.getElementById(id);
const number = value => new Intl.NumberFormat('en-MY').format(value);
const money = value => `RM ${new Intl.NumberFormat('en-MY', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value)}`;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const teamStyles = {
  '1': { color: '#c7f36b', name: 'LIME', symbol: '↗' },
  '2': { color: '#8db7ff', name: 'AZURE', symbol: '◇' },
  '3': { color: '#ff997c', name: 'EMBER', symbol: 'ϟ' },
  '4': { color: '#c6a1ff', name: 'VIOLET', symbol: '✦' },
  '5': { color: '#79dfca', name: 'JADE', symbol: '◈' },
  '6': { color: '#f0cb76', name: 'GOLD', symbol: '⚑' },
  '7': { color: '#f598c4', name: 'ROSE', symbol: '✧' },
  'f5': { color: '#c6a1ff', name: 'SPECIAL', symbol: 'F5' },
};
function dateText(value) {
  return new Intl.DateTimeFormat('zh-Hans', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
function setText(id, value) { $(id).textContent = value; }

function render(data) {
  const summary = summarizeEvent(data);
  const final = data.status === 'final';
  setText('mission-total', number(summary.totalSold));
  $('mission-ring').style.setProperty('--total-size', `${Math.min(57, 240 / number(summary.totalSold).length)}px`);
  setText('mission-target', `下一站：累计 ${number(summary.nextMilestone)} 张`);
  setText('mission-percent', `${summary.milestoneProgress}%`);
  $('mission-ring').style.setProperty('--progress', `${summary.milestoneProgress * 3.6}deg`);
  $('mission-bar').style.width = `${summary.milestoneProgress}%`;
  setText('mission-caption', summary.milestones ? `已解锁 ${number(summary.milestones)} 站 · 距下一站还差 ${number(summary.nextMilestone - summary.totalSold)} 张。` : '第 1–7 组 + F5 Gang，共同贡献每一张。');
  setText('stat-sold', `${number(summary.totalSold)} 张`);
  setText('stat-value', money(summary.totalValue));
  setText('stat-received', money(summary.treasuryReceived));
  setText('stat-milestones', `${number(summary.milestones)} 站`);
  $('event-state').innerHTML = `<i></i>${final ? '结赛确认 · 最终成绩已锁定' : data.updatedAt ? '联赛进行中' : '战队已集结 · 等待首次成绩发布'}`;
  $('event-state').classList.toggle('final-state', final);
  setText('deadline', summary.deadline ? `交接截止：${dateText(summary.deadline)}（马来西亚时间）` : '截止日期待公布');
  setText('updated-at', summary.updatedAt ? `${final ? '结赛确认' : '最后更新'}：${dateText(summary.updatedAt)}（MYT）` : '尚未发布成绩');
  setText('board-state', final ? '最终排名' : '冠军待结赛确认');
  for (const team of summary.teams) {
    setText(`team-${team.id}-sold`, number(team.verifiedSold));
    setText(`team-${team.id}-value`, money(team.totalValue));
  }
  const [teamA, teamB] = summary.teams;
  const lead = Math.abs(teamA.verifiedSold - teamB.verifiedSold);
  setText('team-battle-state', lead ? `${teamA.verifiedSold > teamB.verifiedSold ? 'Team A' : 'Team B'} ${final ? '最终领先' : '当前领先'} ${number(lead)} 张` : teamA.verifiedSold > 0 ? `两队${final ? '最终' : '当前'}同分` : final ? '两队最终销量均为零' : '等待首份核实成绩');
  if (final) {
    setText('mission-target', '全团最终贡献');
    setText('mission-percent', '已结赛');
    setText('mission-caption', `已解锁 ${number(summary.milestones)} 个共同里程碑。感谢每一份自愿支持。`);
  }

  $('leaderboard-body').innerHTML = summary.rankings.map(group => {
    const style = teamStyles[group.id];
    const podium = group.verifiedSold > 0 && group.rank <= 3;
    const champion = summary.champions.some(g => g.id === group.id);
    return `<tr style="--team-color:${style.color}" class="${champion ? 'champion-row' : ''}"><td><span class="rank-badge ${podium ? `podium rank-${group.rank}` : ''}">${String(group.rank).padStart(2, '0')}</span></td><th scope="row"><div class="board-team"><span class="team-mini" aria-hidden="true">${style.symbol}</span><span>${escape(group.name)}${champion ? '<small class="champion-label">联赛冠军</small>' : ''}</span></div></th><td class="numeric sold-cell">${number(group.verifiedSold)}<span> 张</span></td><td class="numeric gap-column"><span class="gap-text">${group.gap ? `${number(group.gap)} 张` : group.verifiedSold ? '共同领先' : '—'}</span></td></tr>`;
  }).join('');

  summary.rankings.forEach((group, index) => {
    const label = document.createElement('small');
    label.className = 'team-affiliation';
    label.textContent = getTeamForGroup(group.id).name;
    $('leaderboard-body').children[index].querySelector('.board-team > span:last-child').append(label);
  });

  setText('f5-title', summary.f5.name);
  setText('f5-sold', number(summary.f5.verifiedSold));
  setText('f5-value', money(summary.f5.verifiedSold * PRICE));
  setText('f5-received', money(summary.f5.treasuryReceived));
  const f5Unlocked = getAchievements(summary.f5).filter(a => a.unlocked);
  $('f5-badges').innerHTML = f5Unlocked.map(a => `<span class="mini-achievement">${a.symbol} ${a.title}</span>`).join('') + (summary.f5.handoffComplete ? '<span class="mini-achievement">✓ 圆满交接</span>' : '');
  if (!f5Unlocked.length && !summary.f5.handoffComplete) setText('f5-badges', '首个销量成就：10 张 · 初露锋芒');

  $('squad-grid').innerHTML = GROUP_IDS.map(id => {
    const group = summary.groups.find(g => g.id === id);
    const style = teamStyles[id];
    const achievements = getAchievements(group);
    const next = achievements.find(a => !a.unlocked);
    const progress = next ? Math.min(100, group.verifiedSold / next.threshold * 100) : 100;
    const unlockedCount = achievements.filter(a => a.unlocked).length + Number(group.handoffComplete);
    return `<details class="squad-card" style="--team-color:${style.color}"><summary><div class="squad-top"><span class="squad-number">${id === 'f5' ? 'SPECIAL CHALLENGER' : `SQUAD / 0${id}`}</span><span class="squad-open" aria-hidden="true">+</span></div><div class="squad-identity"><span class="squad-emblem" aria-hidden="true">${style.symbol}</span><div><h3>${escape(group.name)}</h3><span class="squad-code">${style.name} ${id === 'f5' ? '/ F5' : `/ UNIT 0${id}`}</span></div></div><div class="squad-sales"><strong>${number(group.verifiedSold)}</strong><span>张已核实</span><span class="squad-value">${money(group.verifiedSold * PRICE)}</span></div><div class="squad-progress"><div style="width:${progress}%"></div></div><div class="squad-next"><span>${next ? `下一成就 · ${next.title}` : '四个销量成就全部解锁'}</span><span>${next ? `${number(group.verifiedSold)} / ${next.threshold}` : '100 / 100'}</span></div><div class="squad-badge-preview">${achievements.map(a => `<span class="preview-badge ${a.unlocked ? 'unlocked' : ''}" title="${a.threshold} 张 · ${a.title}${a.unlocked ? '（已解锁）' : '（未解锁）'}" aria-label="${a.title}${a.unlocked ? '已解锁' : '未解锁'}">${a.symbol}</span>`).join('')}<span class="preview-badge ${group.handoffComplete ? 'unlocked' : ''}" title="圆满交接${group.handoffComplete ? '（已解锁）' : '（待完成）'}" aria-label="圆满交接${group.handoffComplete ? '已解锁' : '待完成'}">✓</span><span class="badge-count">${unlockedCount}/5 成就</span></div></summary><div class="squad-detail"><ul class="achievement-list">${achievements.map(a => `<li class="${a.unlocked ? 'is-unlocked' : ''}"><span aria-hidden="true">${a.symbol}</span><strong>${a.title}</strong><span>${a.threshold} 张 · ${a.unlocked ? '已解锁' : '未解锁'}</span></li>`).join('')}<li class="${group.handoffComplete ? 'is-unlocked' : ''}"><span aria-hidden="true">✓</span><strong>圆满交接</strong><span>${group.handoffComplete ? '已完成' : '待完成'}</span></li></ul><div class="detail-finance"><span>财政已收 <strong>${money(group.treasuryReceived)}</strong></span><span>尚待交财政 <strong>${money(group.verifiedSold * PRICE - group.treasuryReceived)}</strong></span></div><p class="detail-note">圆满交接由负责人确认记录、钱款和剩余贴纸已全部交齐。</p></div></details>`;
  }).join('');
  setText('data-announcement', `${final ? '最终成绩' : '成绩'}已加载，全团核实 ${number(summary.totalSold)} 张贴纸。`);
  GROUP_IDS.forEach((id, index) => {
    const team = getTeamForGroup(id);
    $('squad-grid').children[index].querySelector('.squad-number').textContent = team ? `${team.name.toUpperCase()} / SQUAD 0${id}` : 'SPECIAL CHALLENGER';
  });
  $('stats').setAttribute('aria-busy', 'false');
}

function clearResults() {
  for (const id of ['mission-total', 'mission-percent', 'stat-sold', 'stat-value', 'stat-received', 'stat-milestones', 'f5-sold', 'f5-value', 'f5-received']) setText(id, '—');
  for (const id of ['team-a-sold', 'team-b-sold', 'team-a-value', 'team-b-value']) setText(id, '—');
  setText('team-battle-state', '两队成绩暂不可用');
  $('mission-ring').style.setProperty('--progress', '0deg');
  $('mission-bar').style.width = '0%';
  setText('mission-target', '共同进度暂不可用');
  setText('mission-caption', '读取有效成绩后显示共同里程碑。');
  $('leaderboard-body').innerHTML = '<tr><td colspan="4" class="empty-cell">成绩暂不可用，请重新加载。</td></tr>';
  $('squad-grid').innerHTML = '<p class="section-placeholder">战队成绩暂不可用。</p>';
  setText('f5-title', 'F5 Gang');
  setText('f5-badges', '成就暂不可用');
  setText('event-state', '成绩暂不可用');
  $('event-state').classList.remove('final-state');
  setText('deadline', '截止日期暂不可读取');
  setText('updated-at', '更新时间暂不可读取');
  setText('board-state', '成绩待读取');
}

async function load() {
  $('load-error').hidden = true;
  $('retry').disabled = true;
  $('stats').setAttribute('aria-busy', 'true');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(new URL('./data/event.json', import.meta.url), { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`成绩文件读取失败（HTTP ${response.status}）。`);
    const data = await response.json();
    render(data);
  } catch (error) {
    clearResults();
    $('load-error').hidden = false;
    setText('error-message', error.name === 'AbortError' ? '读取超时。请检查网络后重新加载。' : `未显示任何推测成绩。${error instanceof SyntaxError ? '成绩文件格式有误，请联系负责人。' : error.message}`);
    setText('data-announcement', '无法读取有效成绩，请重新加载或联系负责人。');
    $('stats').setAttribute('aria-busy', 'false');
  } finally {
    clearTimeout(timeout);
    $('retry').disabled = false;
  }
}

$('retry').addEventListener('click', load);
const navLinks = [...document.querySelectorAll('.nav-link')];
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (visible) navLinks.forEach(link => {
      const active = link.getAttribute('href') === `#${visible.target.id}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-15% 0px -55% 0px', threshold: 0 });
  document.querySelectorAll('.section-anchor').forEach(section => observer.observe(section));
}
load();
