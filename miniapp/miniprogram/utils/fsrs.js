// utils/fsrs.js - FSRS 调度封装（基于 ts-fsrs UMD，web 版同款）
// ⚠️ 铁律：ts-fsrs 的 Rating 枚举是双向映射，必须用数字索引 res[rating]，Rating[rating] 会拿到字符串 key
const TSFSRS = require('../vendor/ts-fsrs.umd.js');

let scheduler = null;

function init() {
  if (scheduler) return;
  if (TSFSRS && TSFSRS.fsrs) {
    scheduler = TSFSRS.fsrs(TSFSRS.generatorParameters({ enable_short_term: false }));
  } else {
    // UMD 挂载形态兜底：globalThis.FSRS
    const g = (typeof globalThis !== 'undefined') ? globalThis : global;
    if (g && g.FSRS && g.FSRS.fsrs) {
      scheduler = g.FSRS.fsrs(g.FSRS.generatorParameters({ enable_short_term: false }));
    }
  }
  if (!scheduler) throw new Error('ts-fsrs 初始化失败');
}

// 评级数字：1=忘记 2=困难 3=记得 4=简单（ts-fsrs 6.x：Manual=0 无返回 key）
function newCard() {
  init();
  return TSFSRS.createEmptyCard(new Date());
}

// ⚠️ 铁律（web 版血泪）：repeat 返回 {1:{card,log},2:..}，必须 res[rating].card
// rating 用数字索引（1-4）；Rating[rating] 会拿到字符串 key 返回 undefined
function schedule(card, rating) {
  init();
  const res = scheduler.repeat(card, new Date());
  const next = res ? res[rating] : null;
  return next ? next.card : null;
}

// 计算下次到期时间戳（天级间隔，首次评级即天级）
function dueTs(fsrsCard) {
  if (!fsrsCard || !fsrsCard.due) return null;
  return new Date(fsrsCard.due).getTime();
}

module.exports = { newCard, schedule, dueTs };
