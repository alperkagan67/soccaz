import { z } from "zod";

export const CITIES = [
  "Gelsenkirchen",
  "Essen",
  "Bochum",
  "Dortmund",
  "Duisburg",
  "Oberhausen",
  "Herne",
  "Recklinghausen",
  "Bottrop",
  "Mülheim an der Ruhr",
  "Düsseldorf",
  "Köln",
  "Münster",
  "Bielefeld",
  "Andere (NRW)",
] as const;

export const POSITIONS = ["Torwart", "Abwehr", "Mittelfeld", "Angriff", "Flexibel"] as const;

export const onboardingSchema = z.object({
  name: z.string().trim().min(2, "Bitte gib einen Namen an (mindestens 2 Zeichen).").max(40),
  city: z.enum(CITIES, { message: "Bitte wähle eine Stadt." }),
  position: z.enum(POSITIONS, { message: "Bitte wähle eine Position." }),
  birthDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Bitte gib dein Geburtsdatum an."),
  terms: z.literal("on", { message: "Bitte akzeptiere Datenschutz und Hausordnung." }),
});

export const teamSchema = z.object({
  name: z.string().trim().min(3, "Der Teamname braucht mindestens 3 Zeichen.").max(40, "Maximal 40 Zeichen."),
  city: z.enum(CITIES, { message: "Bitte wähle eine Stadt." }),
  strength: z.coerce.number().int().min(1).max(5),
});

export const requestSchema = z.object({
  teamId: z.string().uuid("Bitte wähle ein Team."),
  city: z.enum(CITIES, { message: "Bitte wähle eine Stadt." }),
  startsAt: z.string().min(1, "Bitte wähle Datum und Uhrzeit."),
  durationMin: z.coerce.number().refine((v) => v === 60 || v === 90, "Dauer: 60 oder 90 Minuten."),
  strength: z.coerce.number().int().min(1).max(5),
  visibility: z.enum(["public", "private"]),
  note: z.string().trim().max(200, "Maximal 200 Zeichen.").optional(),
  targetTeamId: z.string().uuid().optional().catch(undefined),
  repeatWeeks: z.coerce.number().int().min(1).max(4).optional().catch(1),
});

export const filterSchema = z.object({
  city: z.enum(CITIES).optional().catch(undefined),
  durationMin: z.coerce.number().refine((v) => v === 60 || v === 90).optional().catch(undefined),
  minStrength: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
  maxStrength: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});

export type ActionState = { error?: string; fieldErrors?: Record<string, string>; needsTopupCents?: number; ok?: boolean } | undefined;

export function zodToState(error: z.ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { error: Object.values(fieldErrors)[0], fieldErrors };
}
