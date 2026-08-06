import { z } from "zod";
import { NEPAL_BOUNDS } from "./geo";

/**
 * Shared by React Hook Form on the client and by the Server Action on the server.
 * The server always re-parses — the client copy is a convenience, never the gate.
 */
export const dealerSchema = z.object({
  dealerName: z.string().trim().min(2, "Dealer name is required").max(200),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  district: z.string().trim().max(100).optional().or(z.literal("")),
  municipality: z.string().trim().max(100).optional().or(z.literal("")),
  latitude: z.coerce
    .number()
    .min(NEPAL_BOUNDS.minLat, `Latitude must be between ${NEPAL_BOUNDS.minLat} and ${NEPAL_BOUNDS.maxLat}`)
    .max(NEPAL_BOUNDS.maxLat, `Latitude must be between ${NEPAL_BOUNDS.minLat} and ${NEPAL_BOUNDS.maxLat}`),
  longitude: z.coerce
    .number()
    .min(NEPAL_BOUNDS.minLng, `Longitude must be between ${NEPAL_BOUNDS.minLng} and ${NEPAL_BOUNDS.maxLng}`)
    .max(NEPAL_BOUNDS.maxLng, `Longitude must be between ${NEPAL_BOUNDS.minLng} and ${NEPAL_BOUNDS.maxLng}`),
  // Nepali mobile (98/97/96 + 7 digits) or landline; blank is allowed since 365 of
  // the 409 imported dealers have no number on record.
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+?977[- ]?)?[0-9][0-9- ]{6,14}$/, "Enter a valid Nepali phone number")
    .optional()
    .or(z.literal("")),
  email: z.email("Enter a valid email").optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type DealerInput = z.infer<typeof dealerSchema>;

export const stockUpdateSchema = z.object({
  dealerId: z.string().min(1),
  newQuantity: z.coerce
    .number()
    .int("Cylinder count must be a whole number")
    .min(0, "Cylinder count cannot be negative")
    .max(100_000, "That looks like a typo — check the number"),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
