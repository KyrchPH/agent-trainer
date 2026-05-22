import { Router } from 'express';
import { z } from 'zod';
import { getConfig, setConfig } from '../config.js';

export const adminRouter = Router();

adminRouter.get('/config', async (_req, res, next) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
});

const configUpdate = z.object({
  system_prompt: z.string().optional(),
  llm_provider: z.enum(['anthropic', 'openai', 'deepseek']).optional(),
  llm_model_anthropic: z.string().optional(),
  llm_model_openai: z.string().optional(),
  llm_model_deepseek: z.string().optional()
});

adminRouter.put('/config', async (req, res, next) => {
  try {
    const parsed = configUpdate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined)
    ) as Record<string, string>;
    await setConfig(updates);
    const config = await getConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
});
