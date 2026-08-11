// utils/format.js - 展示格式化工具

// 时间戳 → 'MM-DD' 或 'YYYY-MM-DD HH:mm'
function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// 到期状态：返回 {cls, text}
function dueText(ts) {
  if (!ts) return { cls: '', text: '未学习' };
  const left = ts - Date.now();
  if (left <= 0) return { cls: 'due', text: '已到期' };
  const days = Math.ceil(left / 86400000);
  if (days <= 1) return { cls: '', text: '今天' };
  return { cls: '', text: days + ' 天后' };
}

// 轮数
function rounds(card) {
  return (card && card.fsrsCard && card.fsrsCard.reps) ? card.fsrsCard.reps : 0;
}

module.exports = { fmt, fmtDate, dueText, rounds };
