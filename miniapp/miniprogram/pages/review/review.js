// pages/review/review.js - 学习/复习流（FSRS 调度）
const db = require('../../utils/db.js');
const fsrs = require('../../utils/fsrs.js');
const limit = require('../../utils/limit.js');
const fmt = require('../../utils/format.js');
const app = getApp();

Page({
  data: {
    loading: true,
    empty: false,
    queueTotal: 0,
    idx: 0,
    card: null,          // 当前卡对象
    front: '',
    back: '',
    tags: [],
    source: '',
    quiz: null,          // 选择题数据
    quizMode: false,
    quizModePref: false, // 用户选择的复习模式（问答/选择题）
    quizPicked: false,
    quizCorrect: null,
    showBack: false,
    done: false,
    doneMsg: '',
    streak: 0,
    errMsg: '',
    privacyShow: false
  },

  onLoad() {
    this.setData({
      quizModePref: wx.getStorageSync('mc_quiz_mode') === 'quiz',
      privacyShow: wx.getStorageSync('mc_privacy_ack') !== '1'
    });
    this.buildQueue();
  },

  ackPrivacy() {
    wx.setStorageSync('mc_privacy_ack', '1');
    this.setData({ privacyShow: false });
  },

  // 切换 问答/选择题 模式
  toggleQuizMode(e) {
    const m = e.currentTarget.dataset.m; // 'qa' | 'quiz'
    wx.setStorageSync('mc_quiz_mode', m);
    this.setData({ quizModePref: m === 'quiz', quizPicked: false, quizCorrect: null });
    // 用新模式重新渲染当前卡
    this.showCard(this.data.idx);
  },

  buildQueue() {
    const now = Date.now();
    const cards = db.getCards();
    const L = app.globalData.limits;
    // 到期卡：已学过且到期
    const due = cards
      .filter(c => c.fsrsCard && c.fsrsCard.reps > 0 && (!c.due || c.due <= now))
      .sort((a, b) => (a.due || 0) - (b.due || 0));
    // 新卡：未学过，每日上限（减去今日已学新卡数）
    const doneNew = limit.getDone('new');
    const newLimit = Math.max(0, L.newCards - doneNew);
    const fresh = cards.filter(c => !c.fsrsCard || !c.fsrsCard.reps).slice(0, newLimit);
    const queue = due.concat(fresh);
    if (!queue.length) {
      this.setData({ loading: false, empty: true });
      return;
    }
    this.setData({
      loading: false,
      empty: false,
      queueTotal: queue.length,
      idx: 0
    });
    this._queue = queue;
    this.showCard(0);
  },

  showCard(i) {
    const card = this._queue[i];
    const quizMode = wx.getStorageSync('mc_quiz_mode') !== 'quiz' ? false : true;
    const hasQuiz = !!(card.quiz && Array.isArray(card.quiz.options) && card.quiz.options.length >= 4 && card.quiz.options.length <= 5 && Number.isInteger(card.quiz.answer) && card.quiz.answer >= 0 && card.quiz.answer < card.quiz.options.length);
    // 选择题视图：字母映射在 JS 里算好（WXML 不支持 'ABCDE'[i] 表达式）
    const quiz = (quizMode && hasQuiz) ? {
      question: card.quiz.question,
      answerLetter: 'ABCDE'[card.quiz.answer],
      options: card.quiz.options.map((t, idx) => ({ letter: 'ABCDE'[idx], text: t, index: idx }))
    } : null;
    this.setData({
      idx: i,
      card,
      front: card.front || '',
      back: card.back || '',
      tags: card.tags || [],
      source: card.source || '',
      quiz,
      quizMode: !!quiz,
      quizPicked: false,
      quizCorrect: null,
      showBack: false,
      streak: limit.streakInfo().count || 0
    });
  },

  showAnswer() {
    this.setData({ showBack: true });
  },

  // ---------- 选择题 ----------
  pickQuiz(e) {
    if (this.data.quizPicked) return;
    const picked = +e.currentTarget.dataset.i;
    const q = this.data.quiz;
    this.setData({ quizPicked: true, quizCorrect: picked === q.answer });
  },

  // ---------- 评级：1忘记 2困难 3记得 4简单（ts-fsrs 6.x 枚举，Manual=0 无 key） ----------
  rate(e) {
    const r = +e.currentTarget.dataset.r;
    const card = this.data.card;
    if (!card) return;
    const old = card.fsrsCard || fsrs.newCard();
    const nf = fsrs.schedule(old, r);
    const dueTs = new Date(nf.due).getTime();
    const history = (card.history || []).concat([{ t: Date.now(), r }]);
    db.updateCard(card.id, { fsrsCard: nf, due: dueTs, history });
    // 新卡计数（每日上限）
    if (!card.fsrsCard || !card.fsrsCard.reps) limit.addDone('new');
    this.next();
  },

  next() {
    const i = this.data.idx + 1;
    if (i >= this._queue.length) {
      limit.punch(); // 完成一次队列即打卡
      this.setData({
        done: true,
        doneMsg: '本轮 ' + this._queue.length + ' 张完成 🎉 连续打卡 ' + (limit.streakInfo().count || 0) + ' 天'
      });
      return;
    }
    this.showCard(i);
  },

  restart() {
    this.setData({ done: false, errMsg: '' });
    this.buildQueue();
  },
  goHome() {
    wx.switchTab({ url: '/pages/home/home' });
  }
});
