import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "That email is too long.")
  .pipe(z.email("Enter a valid email address."));

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "That password is too long.");

export const nameSchema = z.string().trim().min(1, "Enter your name.").max(100, "That name is too long.");

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const uuidSchema = z.string().uuid();
