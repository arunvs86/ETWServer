// validators/tutorProfile.validators.js
const { z } = require('zod');

const currencyRegex = /^[A-Z]{3}$/; // e.g., GBP, USD, EUR
const tzRegex = /^[A-Za-z_\/-]+$/;  // light check; deeper tz validation later

const baseProfileSchema = z.object({
  headline:        z.string().trim().max(120).optional(),
  bio:             z.string().trim().max(4000).optional(),
  subjects:        z.array(z.string().trim().min(1)).max(50).optional(),
  languages:       z.array(z.string().trim().min(2).max(10)).max(10).optional(),
  timezone:        z.string().regex(tzRegex, 'Invalid timezone').optional(),
  hourlyRateMinor: z.number().int().min(0).max(1_000_000).optional(),
  currency:        z.string().regex(currencyRegex, 'Invalid currency code').optional(),
  meetingProvider: z.enum(['zoom','google_meet','custom']).optional(),
  meetingNote:     z.string().trim().max(500).optional(),
  isListed:        z.boolean().optional()
});

const createProfileSchema = baseProfileSchema.partial().strip();
const updateProfileSchema = baseProfileSchema.partial().strip();

function zodValidator(schema) {
  return (req, res, next) => {
    const parse = schema.safeParse(req.body);
    if (!parse.success) {
      const msg = parse.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      return res.status(400).json({ message: msg });
    }
    req.validated = parse.data;
    next();
  };
}

module.exports = {
  createProfileSchema,
  updateProfileSchema,
  zodValidator
};
