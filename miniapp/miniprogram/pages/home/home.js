// pages/home/home.js - 首页：生成卡片 + 复习入口
const db = require('../../utils/db.js');
const limit = require('../../utils/limit.js');
const app = getApp();

Page({
  data: {
    mode: 'text',          // text=学习新卡 wrong=错题制卡
    inputText: '',
    deckName: '',
    maxCards: 10,
    maxCardsOptions: [5, 10, 15, 20],
    customTags: '',
    loading: false,
    ocrLoading: false,
    uploadLoading: false,
    cardsPreview: [],
    errMsg: '',
    okMsg: '',
    genLeft: 0,
    ocrLeft: 0,
    uploadLeft: 0,
    stats: { total: 0, due: 0, new: 0, streak: 0 },
    placeholder: '粘贴教材/讲义内容，或拍错题照片、上传 PDF/Word…',
    privacyShow: false,
    helpShow: false,
    tagMgmtShow: false,
    tagList: [],
    tagNewInput: ''
  },

  onLoad() {
    const privacyAck = wx.getStorageSync('mc_privacy_ack') === '1';
    this.setData({
      privacyShow: !privacyAck,
      // 隐私确认过、但没看过新手引导 → 显示帮助
      helpShow: privacyAck && wx.getStorageSync('mc_help_ack') !== '1'
    });
  },

  ackPrivacy() {
    wx.setStorageSync('mc_privacy_ack', '1');
    this.setData({
      privacyShow: false,
      helpShow: wx.getStorageSync('mc_help_ack') !== '1'
    });
  },

  ackHelp() {
    wx.setStorageSync('mc_help_ack', '1');
    this.setData({ helpShow: false });
  },

  // ---------- 自定义标签管理 ----------
  openTagMgmt() {
    this.setData({ tagMgmtShow: true, tagList: db.getCustomTags(), tagNewInput: '' });
  },
  closeTagMgmt() {
    this.setData({ tagMgmtShow: false });
  },
  onTagNewInput(e) {
    this.setData({ tagNewInput: e.detail.value });
  },
  addTag() {
    const t = (this.data.tagNewInput || '').trim();
    if (!t) return;
    const list = db.getCustomTags();
    if (list.includes(t)) {
      this.setData({ tagNewInput: '' });
      return;
    }
    const next = list.concat(t).slice(0, 30);
    db.setCustomTags(next);
    this.setData({ tagList: next, tagNewInput: '' });
  },
  delTag(e) {
    const t = e.currentTarget.dataset.tag;
    const next = db.getCustomTags().filter(x => x !== t);
    db.setCustomTags(next);
    this.setData({ tagList: next });
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const L = app.globalData.limits;
    const s = limit.streakInfo();
    this.setData({
      genLeft: Math.max(0, L.gen - limit.getDone('gen')),
      ocrLeft: Math.max(0, L.ocr - limit.getDone('ocr')),
      uploadLeft: Math.max(0, L.upload - limit.getDone('upload')),
      stats: {
        total: db.totalCount(),
        due: db.dueCount(),
        new: db.newCount(),
        streak: s.count || 0
      }
    });
  },

  // ---------- 输入控制 ----------
  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode, errMsg: '', okMsg: '' });
  },
  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },
  onDeckInput(e) {
    this.setData({ deckName: e.detail.value });
  },
  onMaxCards(e) {
    this.setData({ maxCards: +e.currentTarget.dataset.v });
  },
  onTagsInput(e) {
    this.setData({ customTags: e.detail.value });
  },

  // ---------- 拍照 OCR（错题制卡） ----------
  async chooseImage() {
    const app2 = this;
    if (app2.data.ocrLoading) return;
    if (!limit.canUse('ocr', app.globalData.limits.ocr)) {
      app2.setData({ errMsg: '今日拍照识别次数已用完，明天再来' });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: (res) => {
        const filePath = res.tempFiles[0].tempFilePath;
        // 压缩后走云存储中转（绕开 callFunction 1MB 入参限制）
        wx.compressImage({
          src: filePath,
          quality: 60,
          compressedWidth: 1280,
          success: (cres) => app2.uploadOcr(cres.tempFilePath),
          fail: () => app2.uploadOcr(filePath)
        });
      }
    });
  },

  // 图片 → 云存储 → 云函数按 fileID 下载识别（与 extract 同模式）
  uploadOcr(filePath) {
    const app2 = this;
    app2.setData({ ocrLoading: true, errMsg: '', okMsg: '' });
    const cloudPath = 'ocr/' + Date.now() + '.jpg';
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (u) => {
        wx.cloud.callFunction({
          name: 'ocr_ai',
          data: { fileID: u.fileID },
          success: (res) => {
            limit.addDone('ocr');
            const r2 = res.result || {};
            if (r2.error) {
              app2.setData({ ocrLoading: false, errMsg: r2.error });
              return;
            }
            app2.setData({
              ocrLoading: false,
              inputText: r2.text || '',
              // 保持当前模式：学习新卡拍教材页 = 继续 text；错题制卡拍错题 = wrong（用户自行切换）
              okMsg: '识别完成，已填入下方输入框（可修改）'
            });
          },
          fail: (e) => app2.setData({ ocrLoading: false, errMsg: '识别失败：' + (e.errMsg || e) })
        });
      },
      fail: (e) => app2.setData({ ocrLoading: false, errMsg: '图片上传失败：' + (e.errMsg || e) })
    });
  },

  // ---------- 上传 PDF/Word ----------
  chooseFile() {
    const app2 = this;
    if (app2.data.uploadLoading) return;
    if (!limit.canUse('upload', app.globalData.limits.upload)) {
      app2.setData({ errMsg: '今日上传次数已用完，明天再来' });
      return;
    }
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'docx'],
      success: (res) => {
        const f = res.tempFiles[0];
        if (f.size > 4 * 1024 * 1024) {
          app2.setData({ errMsg: '文件过大（限 4MB）' });
          return;
        }
        const ext = (f.name || '').split('.').pop().toLowerCase();
        if (ext !== 'pdf' && ext !== 'docx') {
          app2.setData({ errMsg: '仅支持 PDF / Word(.docx)' });
          return;
        }
        app2.setData({ uploadLoading: true, errMsg: '', okMsg: '上传中…' });
        const cloudPath = 'uploads/' + Date.now() + '_' + f.name.replace(/[\\/:*?"<>|]/g, '_');
        wx.cloud.uploadFile({
          cloudPath,
          filePath: f.path,
          success: (u) => {
            wx.cloud.callFunction({
              name: 'extract',
              data: { action: ext, fileID: u.fileID },
              success: (r) => {
                limit.addDone('upload');
                const r2 = r.result || {};
                app2.setData({ uploadLoading: false });
                if (r2.error) {
                  app2.setData({ errMsg: r2.error });
                  return;
                }
                if (r2.scanned) {
                  app2.setData({ errMsg: '该 PDF 是扫描件（图片版），请截图后用「拍照识别」' });
                  return;
                }
                app2.setData({
                  inputText: r2.text || '',
                  mode: 'text',
                  okMsg: '提取完成，已填入输入框（可修改）'
                });
              },
              fail: (e) => app2.setData({ uploadLoading: false, errMsg: '解析失败：' + (e.errMsg || e) })
            });
          },
          fail: (e) => app2.setData({ uploadLoading: false, errMsg: '上传失败：' + (e.errMsg || e) })
        });
      }
    });
  },

  // ---------- 生成卡片 ----------
  generate() {
    const app2 = this;
    if (app2.data.loading) return;
    const text = (app2.data.inputText || '').trim();
    if (!text) {
      app2.setData({ errMsg: '请先输入内容或上传文件' });
      return;
    }
    if (!limit.canUse('gen', app.globalData.limits.gen)) {
      app2.setData({ errMsg: '今日生成次数已用完，明天再来（或用网页版 medcard.icu）' });
      return;
    }
    const tags = app2.data.customTags.split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 30);
    app2.setData({ loading: true, errMsg: '', okMsg: '', cardsPreview: [] });
    wx.cloud.callFunction({
      name: 'gen_ai',
      data: {
        text,
        max_cards: app2.data.maxCards,
        mode: app2.data.mode,
        custom_tags: tags
      },
      success: (res) => {
        const r = res.result || {};
        if (r.error) {
          app2.setData({ loading: false, errMsg: r.error });
          return;
        }
        limit.addDone('gen');
        app2.setData({
          loading: false,
          cardsPreview: r.cards || [],
          okMsg: '生成 ' + (r.cards || []).length + ' 张卡片' + (r.demo ? '（演示模式，配置 API Key 后更准）' : '') + '，请核对后保存'
        });
      },
      fail: (e) => app2.setData({ loading: false, errMsg: '生成失败：' + (e.errMsg || e) })
    });
  },

  savePreview() {
    const app2 = this;
    const cards = app2.data.cardsPreview;
    if (!cards || !cards.length) return;
    db.addCards(cards, app2.data.deckName.trim() || '默认牌组');
    app2.setData({
      cardsPreview: [],
      inputText: '',
      deckName: '',
      okMsg: '已保存 ' + cards.length + ' 张卡片 ✅'
    });
    app2.refresh();
  },

  discardPreview() {
    this.setData({ cardsPreview: [], okMsg: '' });
  },

  // ---------- 复习入口 ----------
  startReview() {
    wx.navigateTo({ url: '/pages/review/review' });
  },
  goRecords() {
    wx.switchTab({ url: '/pages/records/records' });
  }
});
