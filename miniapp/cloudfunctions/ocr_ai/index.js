// 云函数 ocr_ai：图片文字识别（智谱免费视觉 glm-4v-flash）
// v2：图片走云存储中转（前端 uploadFile → 本函数 downloadFile → 智谱），绕开 callFunction 1MB 限制
// 部署时配置环境变量 ZHIPU_API_KEY
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

function postJson(url, payload, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, headers),
      timeout: timeoutMs || 100000
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(j);
          else reject(new Error('HTTP ' + res.statusCode + ': ' + (j && j.message ? j.message : data.slice(0, 200))));
        } catch (e) { reject(new Error('JSON 解析失败: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('请求超时')); });
    req.write(body);
    req.end();
  });
}

function cleanOcrText(text) {
  const dropPrefix = ['统计', '标签', '来源', '难度', '本题', '全部考生', '本人答', '正确率'];
  const dropKw = ['纠错', '1.1万', '写评论', '收藏', '点赞', '评论', '笔记', '有争议', '已过时'];
  return String(text || '').split('\n').map(l => l.trim()).filter(s => {
    if (!s) return false;
    if (dropPrefix.some(p => s.startsWith(p))) return false;
    if (dropKw.some(k => s.includes(k))) return false;
    return true;
  }).join('\n');
}

async function zhipuOcrImage(b64, mime) {
  const key = process.env.ZHIPU_API_KEY;
  if (!key || key.startsWith('PUT_YOUR')) throw new Error('未配置 ZHIPU_API_KEY');
  const payload = {
    model: 'glm-4v-flash',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + b64 } },
        { type: 'text', text: '请提取这张图片中的医学题目内容。\n如果图片是练习/考试 App 的题目截图：提取「题干」「选项（A/B/C/D/E 及内容）」「答案与解析（如有）」，可保留顶部科目/章节信息（如：外科学 第二十三章 乳房疾病）和题型标注（如 A3/A4 型题）。\n必须忽略所有与题目无关的界面元素：状态栏（时间/信号/电量）、导航栏、搜索栏、按钮文字（写评论/笔记/收藏/评论/点赞）、「5条纠错」「难度」「标签」「来源」「1.1万」等。特别注意：任何以「统计：」开头的整行（包含收藏数/作答次数/正确率/本人答等数字）必须整行丢弃。\n如果图片不是题目截图，则提取全部文字。\n原样输出，保持段落与选项分行，不要添加任何解释、评论或格式标记。如果图片里没有文字，只输出：无文字' }
      ]
    }],
    temperature: 0.1
  };
  let resp = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      resp = await postJson(ZHIPU_URL, payload, { Authorization: 'Bearer ' + key });
      break;
    } catch (e) {
      if (attempt === 1) throw e;
    }
  }
  const content = resp.choices && resp.choices[0] && resp.choices[0].message ? (resp.choices[0].message.content || '') : '';
  return cleanOcrText(content.trim());
}

exports.main = async (event) => {
  const data = (event && event.data && typeof event.data === 'object') ? event.data : (event || {});
  const fileID = data.fileID || '';
  if (!fileID) return { error: '缺少 fileID' };
  try {
    const dl = await cloud.downloadFile({ fileID });
    const buf = dl.fileContent;
    if (!buf || !buf.length) return { error: '图片下载失败' };
    if (buf.length > 4 * 1024 * 1024) return { error: '图片过大（限 4MB）' };
    const text = (await zhipuOcrImage(buf.toString('base64'), 'image/jpeg')).slice(0, 50000);
    return { text };
  } catch (e) {
    return { error: '图片识别失败：' + (e && e.message ? e.message : e) };
  }
};
