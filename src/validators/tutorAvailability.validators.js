// validators/tutorAvailability.validators.js
const { z } = require('zod');

const DOW = z.enum(['MON','TUE','WED','THU','FRI','SAT','SUN']);
const tzRegex = /^[A-Za-z_\/-]+$/;

const WindowSchema = z.object({
  dow: DOW.nullable().optional(),            // weekly windows use dow
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), // exceptions use date
  startMin: z.number().int().min(0).max(1439),
  endMin:   z.number().int().min(1).max(1440)
}).refine(v => v.endMin > v.startMin, { message: 'endMin must be > startMin' });

// ---- PUT /me/tutor-availability/weekly
const upsertWeeklySchema = z.object({
  weekly: z.array(
    z.object({
      dow: DOW,                                // required for weekly
      startMin: z.number().int().min(0).max(1439),
      endMin:   z.number().int().min(1).max(1440)
    }).refine(v => v.endMin > v.startMin, { message: 'endMin must be > startMin' })
  ).max(100)
});

// ---- PUT /me/tutor-availability/exceptions
const upsertExceptionsSchema = z.object({
  exceptions: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),  // required for exceptions
      startMin: z.number().int().min(0).max(1439),
      endMin:   z.number().int().min(1).max(1440)
    }).refine(v => v.endMin > v.startMin, { message: 'endMin must be > startMin' })
  ).max(200)
});

// ---- PATCH /me/tutor-availability/settings
const updateSettingsSchema = z.object({
  timezone:    z.string().regex(tzRegex, 'Invalid timezone').optional(),
  slotSizeMin: z.number().int().min(15).max(240).optional(),
  bufferMin:   z.number().int().min(0).max(60).optional()
});

// ---- Public availability search
const publicAvailabilityQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // inclusive
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // inclusive
  durationMin: z.string().regex(/^\d+$/).optional(), // will parseInt later
});

function zodValidator(schema, pick = 'body') {
  return (req, res, next) => {
    const target = pick === 'query' ? req.query : req.body;
    const parse = schema.safeParse(target);
    if (!parse.success) {
      const msg = parse.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      return res.status(400).json({ message: msg });
    }
    if (pick === 'query') req.validatedQuery = parse.data;
    else req.validated = parse.data;
    next();
  };
}

module.exports = {
  WindowSchema,
  upsertWeeklySchema,
  upsertExceptionsSchema,
  updateSettingsSchema,
  publicAvailabilityQuerySchema,
  zodValidator
};
