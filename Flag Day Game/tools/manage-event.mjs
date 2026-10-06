import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateEvent, summarizeEvent } from '../league.js';

const path = fileURLToPath(new URL('../data/event.json', import.meta.url));
try {
  const command = process.argv[2] || 'validate';
  if (!['validate', 'finalize'].includes(command)) throw new Error('Usage: node tools/manage-event.mjs validate|finalize');
  const data = validateEvent(JSON.parse(await readFile(path, 'utf8')));
  if (command === 'finalize') {
    if (data.status === 'final') throw new Error('最终成绩已锁定，不会覆盖现有快照。');
    if (!data.updatedAt) throw new Error('请先填写 updatedAt 并确认各组成绩。');
    const confirmedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    data.status = 'final';
    data.finalSnapshot = { confirmedAt, deadline: data.deadline, groups: structuredClone(data.groups) };
    validateEvent(data);
    const temporaryPath = `${path}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
      await rename(temporaryPath, path);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
    console.log('最终成绩已锁定。请检查 data/event.json 后提交并发布。');
  }
  const result = summarizeEvent(data);
  console.log(`数据有效 | ${data.status} | 核实 ${result.totalSold} 张 | RM${result.totalValue} | 财政已收 RM${result.treasuryReceived}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
