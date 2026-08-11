// pages/records/records.js - 复习记录页
const db = require('../../utils/db.js');
const fmt = require('../../utils/format.js');

const PAGE_SIZE = 10;

Page({
  data: {
    loading: true,
    tagOptions: ['全部'],
    activeTag: '全部',
    cards: [],        // 当前页卡片（含展示字段）
    page: 1,
    totalPages: 1,
    total: 0,
    weakList: [],     // 薄弱点分析
    expanded: {}      // id -> true（展开答案）
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const cards = db.getCards();
    const tags = db.getCustomTags();
    const tagSet = ['全部'].concat(Array.from(new Set(cards.reduce((a, c) => a.concat(c.tags || []), []).concat(tags))));
    this._allCards = cards;
    this.setData({
      loading: false,
      tagOptions: tagSet.slice(0, 30),
      total: cards.length
    });
    this.renderWeak(cards);
    this.applyFilter();
  },

  applyFilter() {
    const tag = this.data.activeTag;
    let list = this._allCards;
    if (tag !== '全部') {
      list = list.filter(c => (c.tags || []).includes(tag));
    }
    this._filtered = list;
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    this.setData({ totalPages, page: 1 });
    this.renderPage(1);
  },

  renderPage(p) {
    const list = this._filtered || [];
    const start = (p - 1) * PAGE_SIZE;
    const pageCards = list.slice(start, start + PAGE_SIZE).map(c => {
      const last = (c.history && c.history.length) ? c.history[c.history.length - 1].t : (c.created || 0);
      const due = fmt.dueText(c.due);
      return {
        id: c.id,
        front: c.front,
        back: c.back,
        tags: c.tags || [],
        source: c.source,
        lastText: fmt.fmtDate(last),
        dueText: due.text,
        dueCls: due.cls,
        rounds: fmt.rounds(c),
        hasQuiz: !!(c.quiz && c.quiz.options)
      };
    });
    this.setData({ cards: pageCards, page: p });
  },

  onPrev() {
    if (this.data.page > 1) this.renderPage(this.data.page - 1);
  },
  onNext() {
    if (this.data.page < this.data.totalPages) this.renderPage(this.data.page + 1);
  },
  onTag(e) {
    this.setData({ activeTag: e.currentTarget.dataset.tag });
    this.applyFilter();
  },

  toggleAnswer(e) {
    const id = e.currentTarget.dataset.id;
    const expanded = Object.assign({}, this.data.expanded);
    expanded[id] = !expanded[id];
    this.setData({ expanded });
  },

  // 薄弱点：按标签统计正确率（评级 3=记得 4=简单 算对，对齐 web 版 r>=3 阈值）
  renderWeak(cards) {
    const stat = {};
    cards.forEach(c => {
      const h = c.history || [];
      h.forEach(x => {
        (c.tags || []).forEach(t => {
          if (!stat[t]) stat[t] = { total: 0, correct: 0 };
          stat[t].total += 1;
          if (x.r >= 3) stat[t].correct += 1;
        });
      });
    });
    const weakList = Object.keys(stat)
      .map(t => {
        const s = stat[t];
        const rate = s.total ? Math.round(s.correct / s.total * 100) : 0;
        return { tag: t, total: s.total, correct: s.correct, rate, level: rate >= 80 ? 'green' : (rate >= 60 ? 'yellow' : 'red') };
      })
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 8);
    this.setData({ weakList });
  }
});
