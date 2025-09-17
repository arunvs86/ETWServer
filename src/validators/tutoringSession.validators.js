// validators/tutoringSession.validators.js
const { z } = require('zod');

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T/);

const createSessionSchema = z.object({
  startAt: iso, // ISO string (UTC)
  endAt:   iso
}).refine(v => new Date(v.endAt) > new Date(v.startAt), { message: 'endAt must be after startAt' });

const rescheduleSchema = z.object({
  startAt: iso,
  endAt:   iso
}).refine(v => new Date(v.endAt) > new Date(v.startAt), { message: 'endAt must be after startAt' });

const listMySessionsQuerySchema = z.object({
  role: z.enum(['student','tutor']).optional(),
  status: z.string().optional(), // comma list e.g. confirmed,hold
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit:z.string().regex(/^\d+$/).optional()
});

function zodBody(schema) {
  return (req,res,next) => {
    const p = schema.safeParse(req.body);
    if(!p.success){
      const msg = p.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join(', ');
      return res.status(400).json({ message: msg });
    }
    req.validated = p.data; next();
  };
}
function zodQuery(schema) {
  return (req,res,next) => {
    const p = schema.safeParse(req.query);
    if(!p.success){
      const msg = p.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join(', ');
      return res.status(400).json({ message: msg });
    }
    req.validatedQuery = p.data; next();
  };
}

module.exports = {
  createSessionSchema,
  rescheduleSchema,
  listMySessionsQuerySchema,
  zodBody, zodQuery
};
