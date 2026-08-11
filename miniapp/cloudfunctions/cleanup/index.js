// 云函数 cleanup：云存储临时文件定期清理
// 删除 ocr/ 与 uploads/ 目录下超过 7 天的文件（隐私承诺"最短时间保存"落地）
// 定时触发：每天凌晨 4 点（config.json 已配置触发器）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const MAX_AGE_MS = 7 * 24 * 3600 * 1000; // 7 天
const PREFIXES = ['ocr/', 'uploads/'];
const BATCH = 100;

// 解析文件上传时间：兼容 ISO 字符串 / 秒级时间戳 / 毫秒时间戳
function parseTime(item) {
  const t = item.UploadTime || item.LastModified || item.upload_time;
  if (!t) return 0;
  if (typeof t === 'number') {
    return t < 1e12 ? t * 1000 : t; // 秒 → 毫秒
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

exports.main = async () => {
  const now = Date.now();
  let deleted = 0;
  let scanned = 0;

  for (const prefix of PREFIXES) {
    let marker = undefined;
    for (;;) {
      let res;
      try {
        res = await cloud.listFile({ prefix, limit: BATCH, marker });
      } catch (e) {
        console.error('listFile 失败', prefix, e.message);
        break;
      }
      const list = res.fileList || [];
      scanned += list.length;
      const expired = list.filter(it => {
        const t = parseTime(it);
        return t > 0 && (now - t) > MAX_AGE_MS;
      });
      if (expired.length) {
        try {
          const d = await cloud.deleteFile({ fileList: expired.map(it => it.fileID) });
          deleted += (d.fileList || []).filter(x => x.status === 0).length;
        } catch (e) {
          console.error('deleteFile 失败', e.message);
        }
      }
      if (!res.marker || !list.length) break;
      marker = res.marker;
    }
  }
  console.log(`cleanup done: scanned=${scanned} deleted=${deleted}`);
  return { scanned, deleted };
};
