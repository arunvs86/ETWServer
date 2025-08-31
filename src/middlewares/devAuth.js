// Minimal dev-only auth shim so curl/Postman works.
// Reads x-user-id and sets req.user = { id: <ObjectId> }
module.exports = function devAuth(req, _res, next) {
    const id = req.headers['x-user-id'];
    if (id) req.user = { id };
    next();
  };
  