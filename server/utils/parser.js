/**
 * 有声书文件夹解析工具
 * 
 * 文件夹结构规则：
 * 小说名/
 *   季（章节）文件夹/
 *     集（回）音频文件
 * 
 * 示例：
 * 盗墓笔记/
 *   盗墓笔记1之七星鲁王宫(周建龙)[42回]/
 *     盗墓笔记1-七星鲁王宫01.wma
 *     盗墓笔记1-七星鲁王宫02.wma
 */

// 支持的音频格式
const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wma', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.opus', '.ape', '.alac'
]);

// 需要转换的格式（浏览器不原生支持，将被永久转换为 AAC/.m4a）
const NEED_TRANSCODE = new Set(['.wma', '.ape']);

/**
 * 判断文件是否为音频文件
 */
function isAudioFile(filename) {
  const ext = getExtension(filename);
  return AUDIO_EXTENSIONS.has(ext);
}

/**
 * 获取文件扩展名（小写）
 */
function getExtension(filename) {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.substring(lastDot).toLowerCase();
}

/**
 * 判断是否需要转码
 */
function needsTranscode(filename) {
  return NEED_TRANSCODE.has(getExtension(filename));
}

/**
 * 从文件名/文件夹名中提取排序用的数字
 * 支持：第一季、第1季、Season1、01、1等格式
 */
function extractSortNumber(name) {
  // 中文数字映射
  const chineseNumMap = {
    '零': 0, '〇': 0,
    '一': 1, '壹': 1,
    '二': 2, '贰': 2, '两': 2,
    '三': 3, '叁': 3,
    '四': 4, '肆': 4,
    '五': 5, '伍': 5,
    '六': 6, '陆': 6,
    '七': 7, '柒': 7,
    '八': 8, '捌': 8,
    '九': 9, '玖': 9,
    '十': 10, '拾': 10,
    '百': 100, '佰': 100,
    '千': 1000, '仟': 1000,
  };

  // 尝试匹配 "第X季"、"第X部"、"第X卷" 等中文格式
  const chinesePatterns = [
    /第([零〇一壹二贰两三叁四肆五伍六陆七柒八捌九玖十拾百佰千仟]+)[季部卷章节集回]/,
    /第(\d+)[季部卷章节集回]/,
  ];
  
  for (const pattern of chinesePatterns) {
    const match = name.match(pattern);
    if (match) {
      const numStr = match[1];
      if (/^\d+$/.test(numStr)) {
        return parseInt(numStr, 10);
      }
      return chineseToNumber(numStr, chineseNumMap);
    }
  }

  // 尝试匹配名称中的数字，如 "盗墓笔记1之七星鲁王宫"
  // 优先匹配季名中的关键数字
  const seasonNumPatterns = [
    /[^\d](\d+)[之\-_\s]/,  // "盗墓笔记1之..."
    /(\d+)$/,                 // 结尾数字
    /^(\d+)/,                 // 开头数字
    /[Ss]eason\s*(\d+)/i,     // Season 1
    /[Vv]ol(?:ume)?\s*(\d+)/i, // Volume 1
  ];

  for (const pattern of seasonNumPatterns) {
    const match = name.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  // 提取任何数字
  const anyNum = name.match(/(\d+)/);
  if (anyNum) {
    return parseInt(anyNum[1], 10);
  }

  return 0;
}

/**
 * 中文数字转阿拉伯数字
 */
function chineseToNumber(str, numMap) {
  if (str.length === 1) {
    return numMap[str] || 0;
  }
  
  let result = 0;
  let current = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const val = numMap[char] || 0;
    
    if (val >= 10) {
      if (current === 0) current = 1;
      result += current * val;
      current = 0;
    } else {
      current = val;
    }
  }
  
  result += current;
  return result;
}

/**
 * 从文件名中提取集数
 */
function extractEpisodeNumber(filename) {
  // 去掉扩展名
  const name = filename.replace(/\.[^.]+$/, '');
  
  // 尝试匹配常见模式
  const patterns = [
    /第(\d+)[集回话]/,
    /[Ee](?:p|pisode)?\s*(\d+)/,
    /[-_\s](\d+)$/,          // 结尾数字
    /(\d+)$/,                 // 任何结尾数字
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  // 提取最后出现的数字
  const nums = name.match(/\d+/g);
  if (nums && nums.length > 0) {
    return parseInt(nums[nums.length - 1], 10);
  }

  return 0;
}

/**
 * 清理名称，去掉多余信息
 * 支持全角/半角分隔符、括号等
 */
function cleanName(name) {
  let cleaned = name;
  
  // 处理全角竖线分隔的名称格式，如 "盗墓笔记｜南派三叔｜演播周建龙｜"
  // 取第一段作为书名
  if (cleaned.includes('｜') || cleaned.includes('|')) {
    const parts = cleaned.split(/[｜|]/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      cleaned = parts[0]; // 取第一段为书名/季名
    }
  }
  
  return cleaned
    .replace(/\(\d+回\)/g, '')
    .replace(/\[(\d+)回\]/g, '')
    .replace(/\(([^)]*)\)/g, '')    // 去掉圆括号内容（如播音者）
    .replace(/\[([^\]]*)\]/g, '')   // 去掉方括号内容
    .replace(/（([^）]*)）/g, '')    // 去掉中文圆括号内容
    .replace(/【([^】]*)】/g, '')    // 去掉中文方括号内容
    .replace(/\s+/g, ' ')           // 合并多余空格
    .trim();
}

/**
 * 生成简单的ID（基于字符串哈希）
 */
function generateId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

module.exports = {
  isAudioFile,
  getExtension,
  needsTranscode,
  extractSortNumber,
  extractEpisodeNumber,
  cleanName,
  generateId,
  AUDIO_EXTENSIONS,
  NEED_TRANSCODE,
};
