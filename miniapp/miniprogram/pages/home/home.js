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
    placeholder: '粘贴教材/讲义内容，或拍错题照片、上传 PDF/Word…'
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
        // 压缩到 1280 宽内，控制 base64 体积
        wx.compressImage({
          src: filePath,
          quality: 60,
          success: (cres) => app2.uploadOcr(cres.tempFilePath),
          fail: () => app2.uploadOcr(filePath)
        });
      }
    });
  },

  uploadOcr(filePath) {
    const app2 = this;
    app2.setData({ ocrLoading: true, errMsg: '', okMsg: '' });
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (r) => {
        const b64 = r.data;
        if (b64.length > 1.8 * 1024 * 1024) {
          app2.setData({ ocrLoading: false, errMsg: '图片过大，请换一张或截图后重试' });
          return;
        }
        wx.cloud.callFunction({
          name: 'ocr',
          data: { image: b64, mime: 'image/jpeg' },
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
              mode: 'wrong',
              okMsg: '识别完成，已填入下方输入框（可修改）'
            });
          },
          fail: (e) => app2.setData({ ocrLoading: false, errMsg: '识别失败：' + (e.errMsg || e) })
        });
      },
      fail: () => app2.setData({ ocrLoading: false, errMsg: '读取图片失败' })
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
      name: 'generate',
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
