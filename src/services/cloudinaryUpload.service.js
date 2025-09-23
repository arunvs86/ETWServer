// services/cloudinaryUpload.service.js
const { v2: cloudinary } = require('cloudinary');

function uploadBufferToCloudinary(
  buffer,
  { folder = 'uploads', public_id, resource_type = 'auto' } = {}
) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id, resource_type }, 
      (err, res) => (err ? reject(err) : resolve(res))
    );
    stream.end(buffer);
  });
}

module.exports = { uploadBufferToCloudinary };
