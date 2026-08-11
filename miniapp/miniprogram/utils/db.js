// utils/db.js - 数据层：wx.storage 封装（替代 web 版 IndexedDB）
// 卡片模型：{id, deck, front, back, tags, quiz, source, flag, history, fsrsCard, due, created}

const CARD_KEY = 'mc_cards';
const TAG_KEY = 'mc_custom_tags';
const META_KEY = 'mc_meta';

function _get(key, def) {
  try {
    const v = wx.getStorageSync(key);
    return v === '' || v === undefined || v === null ? def : v;
  } catch (e) {
    return def;
  }
}
function _set(key, val) {
  wx.setStorageSync(key, val);
}

// ---------- 卡片 CRUD ----------
function getCards() { return _get(CARD_KEY, []); }
function saveCards(cards) { _set(CARD_KEY, cards); }
function getCard(id) { return getCards().find(c => c.id === id) || null; }

function addCards(newCards, deckName) {
  const cards = getCards();
  const now = Date.now();
  const list = newCards.map((c, i) => ({
    id: now + '_' + i + '_' + Math.floor(Math.random() * 1e6),
    deck: deckName || '默认牌组',
    front: c.front || '',
    back: c.back || '',
    tags: Array.isArray(c.tags) ? c.tags : [],
    quiz: c.quiz || null,
    source: c.source || '',
    flag: 0,
    history: [],
    fsrsCard: null,
    due: null,
    created: now
  }));
  saveCards(cards.concat(list));
  return list;
}

function updateCard(id, patch) {
  const cards = getCards();
  const idx = cards.findIndex(c => c.id === id);
  if (idx < 0) return;
  cards[idx] = Object.assign({}, cards[idx], patch);
  saveCards(cards);
}

function deleteCard(id) {
  saveCards(getCards().filter(c => c.id !== id));
}

function clearCards() { _set(CARD_KEY, []); }

// ---------- 标签 ----------
function getCustomTags() { return _get(TAG_KEY, []); }
function setCustomTags(a) { _set(TAG_KEY, a); }

// ---------- 元信息（备份/恢复用） ----------
function exportJSON() {
  return JSON.stringify({
    app: 'medcard-miniapp',
    version: 1,
    exported: Date.now(),
    cards: getCards(),
    tags: getCustomTags()
  });
}
function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.cards)) throw new Error('格式不正确');
  saveCards(d.cards);
  if (Array.isArray(d.tags)) setCustomTags(d.tags);
  return d.cards.length;
}

// ---------- 复习统计辅助 ----------
function totalCount() { return getCards().length; }
function learnedCount() { return getCards().filter(c => c.fsrsCard && c.fsrsCard.reps > 0).length; }
function dueCount(now) {
  now = now || Date.now();
  return getCards().filter(c => c.fsrsCard && c.fsrsCard.reps > 0 && (!c.due || c.due <= now)).length;
}
function newCount() {
  return getCards().filter(c => !c.fsrsCard || !c.fsrsCard.reps).length;
}

module.exports = {
  getCards, saveCards, getCard, addCards, updateCard, deleteCard, clearCards,
  getCustomTags, setCustomTags,
  exportJSON, importJSON,
  totalCount, learnedCount, dueCount, newCount
};
