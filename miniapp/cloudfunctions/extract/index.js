// 云函数 extract：PDF / Word 文本提取
// 流程：小程序端 wx.cloud.uploadFile 上传到云存储 → 本函数按 fileID 下载解析
// PDF：pdf-parse 提取文本层；扫描件（无文本层）提示改用错题拍照识别
// DOCX：mammoth 提取纯文本
const cloud = require('wx-server-sdk');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const mammoth = require('mammoth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const MAX_TEXT = 50000;

async function extractPdf(fileID) {
  const res = await cloud.downloadFile({ fileID });
  const buf = res.fileContent;
  if (!buf || !buf.length) throw new Error('文件下载失败');
  if (buf.length > 4 * 1024 * 1024) throw new Error('文件过大（限 4MB）');
  const data = await pdfParse(buf);
  let text = (data && data.text || '').trim();
  if (!text) {
    return { text: '', scanned: true };
  }
  return { text: text.slice(0, MAX_TEXT), scanned: false };
}

async function extractDocx(fileID) {
  const res = await cloud.downloadFile({ fileID });
  const buf = res.fileContent;
  if (!buf || !buf.length) throw new Error('文件下载失败');
  if (buf.length > 4 * 1024 * 1024) throw new Error('文件过大（限 4MB）');
  const result = await mammoth.extractRawText({ buffer: buf });
  let text = (result && result.value || '').trim();
  if (!text) throw new Error('未能提取到文字（可能是图片型 Word）');
  return { text: text.slice(0, MAX_TEXT), scanned: false };
}

exports.main = async (event) => {
  const data = event && event.data ? event.data : (event || {});
  const action = data.action || '';
  const fileID = data.fileID || '';
  if (!action || !fileID) return { error: '缺少参数' };
  try {
    if (action === 'pdf') return await extractPdf(fileID);
    if (action === 'docx') return await extractDocx(fileID);
    return { error: '未知类型' };
  } catch (e) {
    return { error: '解析失败：' + (e && e.message ? e.message : e) };
  }
};
