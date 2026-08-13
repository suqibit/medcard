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
    privacyShow: false,
    cardShown: true,   // 纯视觉：换卡时 false→true 重建节点，驱动卡片入场动画
    cardH: ''          // 纯视觉：模式切换时的高度过渡（'' = auto）
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

  // 切换 问答/选择题 模式（web 版同款：高度平滑过渡 + 新内容淡入）
  toggleQuizMode(e) {
    const m = e.currentTarget.dataset.m; // 'qa' | 'quiz'
    if ((m === 'quiz') === this.data.quizModePref) return; // 同模式不重做
    wx.setStorageSync('mc_quiz_mode', m);
    // 1. 量当前卡片高度
    this._measureCard((oldH) => {
      // 2. 切换内容（不重建整卡，避免 fadeUp 重放干扰高度过渡）
      this.setData({ quizModePref: m === 'quiz', quizPicked: false, quizCorrect: null });
      this.showCard(this.data.idx, true);
      // 3. 渲染后量新高度 → 高度过渡
      wx.nextTick(() => {
        this._measureCard((newH) => {
          if (oldH > 0 && newH > 0 && Math.abs(newH - oldH) > 2) {
            this.setData({ cardH: oldH });
            wx.nextTick(() => {
              this.setData({ cardH: newH });
              setTimeout(() => this.setData({ cardH: '' }), 380); // 过渡完恢复 auto
            });
          }
        });
      });
    });
  },

  // 量卡片容器高度（小程序版 offsetHeight；boundingClientRect 返回 px，换算成 rpx 供 wxml 使用）
  _measureCard(cb) {
    let winW = 375;
    try { winW = (wx.getWindowInfo && wx.getWindowInfo().windowWidth) || 375; } catch (e) {}
    wx.createSelectorQuery().in(this).select('.card-anim').boundingClientRect((rect) => {
      cb(rect ? Math.round(rect.height * 750 / winW) : 0);
    }).exec();
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

  // i: 索引；noRebuild: true = 仅换内容（模式切换用，不重建整卡）
  showCard(i, noRebuild) {
    const card = this._queue[i];
    const quizMode = wx.getStorageSync('mc_quiz_mode') !== 'quiz' ? false : true;
    const hasQuiz = !!(card.quiz && Array.isArray(card.quiz.options) && card.quiz.options.length >= 4 && card.quiz.options.length <= 5 && Number.isInteger(card.quiz.answer) && card.quiz.answer >= 0 && card.quiz.answer < card.quiz.options.length);
    // 选择题视图：字母映射在 JS 里算好（WXML 不支持 'ABCDE'[i] 表达式）
    const quiz = (quizMode && hasQuiz) ? {
      question: card.quiz.question,
      answerLetter: 'ABCDE'[card.quiz.answer],
      options: card.quiz.options.map((t, idx) => ({ letter: 'ABCDE'[idx], text: t, index: idx }))
    } : null;
    const patch = {
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
    };
    if (!noRebuild) {
      // 换卡：重建整卡触发入场动画
      patch.cardShown = false;
      this.setData(patch);
      setTimeout(() => this.setData({ cardShown: true }), 30);
    } else {
      this.setData(patch);
    }
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
