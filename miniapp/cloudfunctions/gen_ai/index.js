// 云函数 gen_ai：AI 抽卡（DeepSeek）Node 版，零依赖（https 标准库）
// 部署时配置环境变量 DEEPSEEK_API_KEY
const https = require('https');

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

const SYSTEM_PROMPT = `你是一名医学教育内容专家，擅长将教材/讲义内容转化为适合间隔重复(Anki)的原子化记忆卡片。
要求：
1. 每张卡只考查一个独立知识点（原子化），避免复合问题。
2. front 为问题或概念提示；back 用三段式：「答案：」精炼要点，「解析：」一句话解释为什么，「关联考点：」标注所属科目章节（如 生理·肾脏滤过）。段落间用换行分隔。
3. 覆盖关键维度：定义、机制、鉴别诊断、重要数值、临床意义。
4. 医学准确性优先；对不确定的内容标注「需核实」。
5. 适度添加 tags，如 ["306","生理","循环"]。
6. 按内容密度生成 5-20 张卡片，宁缺毋滥。
7. 每张卡附带一个「选择题版」quiz 字段：{"question":"基于本卡知识点的题干","options":["选项A","选项B","选项C","选项D","选项E"],"answer":正确选项索引(0-4)}。仿考研真题五选一（A-E），选项简短清晰，干扰项合理有迷惑性。
8. 每张卡必须带 source 字段：**原样引用**输入资料中最能支撑该卡答案的一句话（不超过 80 字，不得改写或概括），用于用户对照原文核实。
9. 所有字符串值内部严禁使用英文双引号（会破坏 JSON），引用术语用「」。
只输出 JSON，结构：{"cards":[{"front":"...","back":"...","tags":["..."],"quiz":{"question":"...","options":["..."],"answer":0},"source":"..."}]}`;

const WRONG_PROMPT = `你是一名医学教育内容专家，专门帮助考研学生「把做错的题变成记忆卡」，下次不再错。
用户会粘贴一道 TA 做错的题（题干、选项、TA 的答案或当时纠结的点）。
要求：
1. 从错题中提炼背后的知识点，生成记忆卡——front 是「针对该考点的问题」（不是复述原题，而是考查题目背后的知识点）。
2. back 用三段式：「答案：」该考点的正确结论，「解析：」点破常见错误认知/为什么容易选错（结合用户错因），「关联考点：」所属科目章节（如 内科学·呼吸·COPD）。段落间用换行分隔。
3. 若题目涉及易混概念或鉴别诊断，优先做成「对比卡」（如 A vs B 的关键区别）。
4. tags 必须含「错题」，再加科目/章节标签，如 ["错题","306","内科学"]。
5. 医学准确性优先；对不确定的内容标注「需核实」。
6. 生成 1-5 张，宁缺毋滥——一道错题通常 1-2 张就够。
7. 每张卡附带一个「选择题版」quiz 字段：{"question":"基于该考点的题干","options":["选项A","选项B","选项C","选项D","选项E"],"answer":正确选项索引(0-4)}。仿考研真题五选一（A-E），选项简短清晰，干扰项合理有迷惑性。
8. 每张卡必须带 source 字段：**原样引用**用户粘贴的错题中最能支撑该卡答案的一句话（不超过 80 字，不得改写）。
9. 所有字符串值内部严禁使用英文双引号（会破坏 JSON），引用术语用「」。
只输出 JSON，结构：{"cards":[{"front":"...","back":"...","tags":["..."],"quiz":{"question":"...","options":["..."],"answer":0},"source":"..."}]}`;

function postJson(url, payload, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, headers),
      timeout: timeoutMs || 110000
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

function parseAiJson(content) {
  if (!content) return null;
  try { return JSON.parse(content); } catch (e) {}
  try {
    const s = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}

async function aiExtractCards(text, maxCards, mode, customTags) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key || key.startsWith('PUT_YOUR')) return null;
  let basePrompt;
  let userMsg;
  if (mode === 'wrong') {
    basePrompt = WRONG_PROMPT.replace('6. 生成 1-5 张，宁缺毋滥——一道错题通常 1-2 张就够。', '6. 生成最多 ' + maxCards + ' 张，宁缺毋滥——一道错题通常 1-2 张就够。');
    userMsg = '这是我做错的一道题，请帮我提炼知识点记忆卡：\n\n' + text;
  } else {
    basePrompt = SYSTEM_PROMPT.replace('按内容密度生成 5-20 张卡片，宁缺毋滥。', '按内容密度生成最多 ' + maxCards + ' 张卡片，宁缺毋滥。');
    userMsg = '请将以下医学教材/讲义内容转化为记忆卡片：\n\n' + text;
  }
  if (customTags && customTags.length) {
    basePrompt += '\n补充要求：用户自定义了标签体系：【' + customTags.join('、') + '】。生成 tags 时，若卡片知识点与其中某个标签匹配，必须使用该标签（可与其他标签并存）；确实不匹配时照常按科目/章节打标签。';
  }
  const payload = {
    model: 'deepseek-chat',
    messages: [{ role: 'system', content: basePrompt }, { role: 'user', content: userMsg }],
    response_format: { type: 'json_object' },
    temperature: 0.3
  };
  const headers = { Authorization: 'Bearer ' + key };
  let data = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await postJson(DEEPSEEK_URL, payload, headers);
      const content = resp.choices && resp.choices[0] && resp.choices[0].message ? resp.choices[0].message.content : '';
      data = parseAiJson(content);
      if (data && data.cards) return data.cards;
    } catch (e) {
      if (attempt === 1) throw e;
    }
  }
  return null;
}

function ruleExtractCards(text, maxCards) {
  const sentences = String(text || '').split(/(?<=[。；;.!?！？])\s*/);
  const cards = [];
  for (const s of sentences) {
    const t = (s || '').trim();
    if (t.length < 10) continue;
    const hint = t.slice(0, 12) + (t.length > 12 ? '…' : '');
    cards.push({ front: '请回忆/解释：' + hint, back: t, tags: ['演示', '规则抽卡'], source: t.slice(0, 80) });
    if (cards.length >= maxCards) break;
  }
  return cards;
}

exports.main = async (event) => {
  const data = (event && event.data && typeof event.data === 'object') ? event.data : (event || {});
  const text = String(data.text || '').trim().slice(0, 30000);
  if (!text) return { error: '请输入或上传内容' };
  let maxCards = parseInt(data.max_cards, 10) || 10;
  maxCards = Math.max(1, Math.min(20, maxCards));
  const mode = data.mode === 'wrong' ? 'wrong' : 'text';
  let customTags = Array.isArray(data.custom_tags) ? data.custom_tags : [];
  customTags = customTags.map(String).slice(0, 30);
  try {
    let cards = await aiExtractCards(text, maxCards, mode, customTags);
    let demo = false;
    if (!cards) {
      demo = true;
      cards = ruleExtractCards(text, maxCards);
      if (mode === 'wrong') cards.forEach(c => { if (!(c.tags || []).includes('错题')) c.tags = ['错题'].concat(c.tags || []); });
    }
    if (!cards || !cards.length) return { error: '未能生成卡片，请检查内容' };
    return { cards, count: cards.length, demo };
  } catch (e) {
    return { error: '生成失败：' + (e && e.message ? e.message : e) };
  }
};
