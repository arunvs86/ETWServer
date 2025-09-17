// validators/tutorManage.validators.js
const { z } = require('zod');

const listQuery = z.object({
  status: z.string().optional(), // comma list
  from:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:   z.string().regex(/^\d+$/).optional(),
  limit:  z.string().regex(/^\d+$/).optional()
});

const cancelRequestBody = z.object({
  reason: z.string().trim().min(3).max(500)
});

function zodBody(schema) {
  return (req, res, next) => {
    const p = schema.safeParse(req.body);
    if (!p.success) {
      const msg = p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      return res.status(400).json({ message: msg });
    }
    req.validated = p.data;
    next();
  };
}

function zodQuery(schema) {
  return (req, res, next) => {
    const p = schema.safeParse(req.query);
    if (!p.success) {
      const msg = p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      return res.status(400).json({ message: msg });
    }
    req.validatedQuery = p.data;
    next();
  };
}

module.exports = { zodBody, zodQuery, listQuery, cancelRequestBody };
