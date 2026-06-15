/**
 * 阿里云OSS服务
 * 支持从OSS读取有声书文件
 */

let OSSClient = null;

function getOSSConfig() {
  return {
    region: process.env.OSS_REGION || '',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
    bucket: process.env.OSS_BUCKET || '',
    prefix: process.env.OSS_PREFIX || 'audiobooks/',
  };
}

function isOSSConfigured() {
  const config = getOSSConfig();
  return !!(config.region && config.accessKeyId && config.accessKeySecret && config.bucket);
}

function getClient() {
  if (!isOSSConfigured()) {
    throw new Error('OSS is not configured');
  }
  
  if (!OSSClient) {
    const OSS = require('ali-oss');
    const config = getOSSConfig();
    OSSClient = new OSS({
      region: config.region,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
    });
  }
  
  return OSSClient;
}

/**
 * 列出OSS上的有声书文件
 */
async function listOSSBooks() {
  if (!isOSSConfigured()) return [];
  
  const client = getClient();
  const config = getOSSConfig();
  const prefix = config.prefix;
  
  try {
    const result = await client.list({
      prefix,
      delimiter: '/',
    });
    
    const books = [];
    if (result.prefixes) {
      for (const bookPrefix of result.prefixes) {
        const bookName = bookPrefix.replace(prefix, '').replace(/\/$/, '');
        if (bookName) {
          books.push({
            name: bookName,
            prefix: bookPrefix,
            source: 'oss',
          });
        }
      }
    }
    
    return books;
  } catch (e) {
    console.error('Failed to list OSS books:', e);
    return [];
  }
}

/**
 * 获取OSS文件的签名URL（用于音频流）
 */
async function getSignedUrl(objectKey, expires = 3600) {
  if (!isOSSConfigured()) return null;
  
  const client = getClient();
  try {
    const url = client.signatureUrl(objectKey, { expires });
    return url;
  } catch (e) {
    console.error('Failed to generate signed URL:', e);
    return null;
  }
}

/**
 * 获取OSS文件流
 */
async function getStream(objectKey) {
  if (!isOSSConfigured()) return null;
  
  const client = getClient();
  try {
    const result = await client.getStream(objectKey);
    return result.stream;
  } catch (e) {
    console.error('Failed to get OSS stream:', e);
    return null;
  }
}

module.exports = {
  isOSSConfigured,
  listOSSBooks,
  getSignedUrl,
  getStream,
  getOSSConfig,
};
