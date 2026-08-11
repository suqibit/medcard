// app.js - 医学记忆卡小程序
App({
  globalData: {
    // 云开发环境 ID
    cloudEnv: 'cloud1-d5glf5ott2a9a4b88',
    // 功能限额（每人/天），与 utils/limit.js 联动
    limits: {
      gen: 10,    // AI 抽卡
      ocr: 15,    // 拍照 OCR
      upload: 5,  // PDF/Word 提取
      newCards: 20,  // 每日学习新卡上限（沿用 web 版）
      reviewCards: 100 // 每日复习上限
    }
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库版本过低，请使用 2.2.3 及以上基础库');
      return;
    }
    wx.cloud.init({
      env: this.globalData.cloudEnv,
      traceUser: true
    });
  }
});
