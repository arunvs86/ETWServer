// // src/services/upload.service.js
// const crypto = require('crypto');
// const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
// const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// const S3_BUCKET  = process.env.S3_BUCKET;
// const S3_REGION  = process.env.S3_REGION || process.env.AWS_REGION;
// const S3_ENDPOINT = process.env.S3_ENDPOINT || undefined;
// const CDN_BASE_URL = process.env.CDN_BASE_URL || '';

// function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
// function safeName(name='file') { return String(name).replace(/[^a-zA-Z0-9._-]/g, '_'); }
// function makeKey({ userId, purpose, filename }) {
//   const ts = new Date().toISOString().replace(/[:.]/g, '-');
//   const rand = crypto.randomBytes(6).toString('hex');
//   return `${purpose}/${userId}/${ts}-${rand}-${safeName(filename)}`;
// }

// const creds = {
//   accessKeyId:  process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
// };

// const s3 = new S3Client({
//   region: S3_REGION,
//   endpoint: S3_ENDPOINT || undefined,
//   forcePathStyle: !!S3_ENDPOINT,              // needed for R2/MinIO
//   credentials: (creds.accessKeyId && creds.secretAccessKey) ? creds : undefined,
// });

// function publicUrlForKey(key) {
//   if (CDN_BASE_URL) return `${CDN_BASE_URL.replace(/\/$/, '')}/${key}`;
//   if (S3_ENDPOINT)  return `${S3_ENDPOINT.replace(/\/$/, '')}/${S3_BUCKET}/${key}`;
//   return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
// }

// async function signUpload({ userId, payload }) {
//   if (!userId) throw httpError(401, 'Auth required');
//   const purpose = String(payload?.purpose || '');
//   const filename = String(payload?.filename || '');
//   const contentType = String(payload?.contentType || '');
//   const provider = String(payload?.provider || 's3');

//   if (provider !== 's3') throw httpError(400, 'Only provider "s3" supported in this step');
//   if (!S3_BUCKET || !S3_REGION) throw httpError(500, 'S3 config missing');
//   if (!purpose) throw httpError(400, 'purpose is required');
//   if (!filename) throw httpError(400, 'filename is required');
//   if (!contentType) throw httpError(400, 'contentType is required');

//   const key = makeKey({ userId, purpose, filename });

//   const cmd = new PutObjectCommand({
//     Bucket: S3_BUCKET,
//     Key: key,
//     ContentType: contentType,
//     // ACL optional: rely on bucket policy; keep private by default
//     // ACL: 'private',
//   });

//   const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 600 });
//   const finalUrl = publicUrlForKey(key);

//   const sizeLimitMB = purpose === 'lesson_video' ? 1024 : 10;

//   return {
//     provider: 's3',
//     method: 'PUT',
//     uploadUrl,
//     headers: { 'Content-Type': contentType },
//     finalUrl,
//     key,
//     expiresIn: 600,
//     meta: { purpose, contentType, sizeLimitMB },
//   };
// }

// module.exports = { signUpload };
