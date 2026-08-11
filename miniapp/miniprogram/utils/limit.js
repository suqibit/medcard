// utils/limit.js - 每日限额与打卡（对齐 web 版 mc_* 计数逻辑）
// 限额项：gen（AI抽卡）ocr（拍照识别）upload（PDF/Word提取）new（新卡上限）rev（复习上限）

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getDone(k) {
  try {
    const v = wx.getStorageSync('mc_' + k + '_' + todayStr());
    return parseInt(v, 10) || 0;
  } catch (e) { return 0; }
}

function addDone(k) {
  wx.setStorageSync('mc_' + k + '_' + todayStr(), getDone(k) + 1);
}

function canUse(k, limit) {
  return getDone(k) < (limit || 10);
}

function remainText(k, limit) {
  const left = (limit || 10) - getDone(k);
  return left > 0 ? ('今日剩余 ' + left + ' 次') : '今日次数已用完，明天再来（或用网页版）';
}

// ---------- 连续打卡 ----------
// mc_streak: {last:'YYYY-MM-DD', count:n, total:n}
function streakInfo() {
  try {
    const s = wx.getStorageSync('mc_streak');
    if (!s || typeof s !== 'object') return { count: 0, total: 0 };
    return s;
  } catch (e) { return { count: 0, total: 0 }; }
}

// 打卡：今天已打过返回 false；连续天数按 last 是否昨天计算
function punch() {
  const today = todayStr();
  const s = streakInfo();
  if (s.last === today) return false;
  const y = new Date(Date.now() - 86400000);
  const yesterday = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
  const count = s.last === yesterday ? (s.count || 0) + 1 : 1;
  const ns = { last: today, count, total: (s.total || 0) + 1 };
  wx.setStorageSync('mc_streak', ns);
  return true;
}

module.exports = { todayStr, getDone, addDone, canUse, remainText, streakInfo, punch };
