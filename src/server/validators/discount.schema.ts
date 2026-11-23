import { z } from 'zod';
import { toEnDigits } from '@/lib/fa';

export const discountCodeInputSchema = z.string()
  .trim()
  .min(1)
  .max(24)
  .transform((value) => toEnDigits(value).toUpperCase());
