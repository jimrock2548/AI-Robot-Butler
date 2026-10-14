import { z } from 'zod';

/**
 * Zod schemas ใช้ร่วมกันทั้ง frontend/backend (spec §4.1)
 */

export const usernameSchema = z
  .string()
  .min(3, 'อย่างน้อย 3 ตัวอักษร')
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, 'ใช้ตัวอักษร จำนวน _ . - ได้เท่านั้น');

export const passwordSchema = z.string().min(8, 'อย่างน้อย 8 ตัวอักษร').max(128);

export const registerSchema = z.object({
  username: usernameSchema,
  displayName: z.string().min(1).max(64),
  email: z.string().email().max(128).optional().or(z.literal('')),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const lockRequestSchema = z.object({
  mode: z.literal('manual'),
});
export type LockRequestInput = z.infer<typeof lockRequestSchema>;

export const manualControlSchema = z.object({
  /** m/s, -1..1 (1 = ความเร็วสูงสุด) */
  vx: z.number().min(-1).max(1),
  /** rad/s, -3..3 */
  vyaw: z.number().min(-3).max(3),
});
export type ManualControlInput = z.infer<typeof manualControlSchema>;

export const jobCreateSchema = z.object({
  destPoiCode: z.string().min(1).max(16),
  source: z.enum(['operator', 'kiosk_touch', 'kiosk_voice', 'auto']).default('operator'),
});
export type JobCreateInput = z.infer<typeof jobCreateSchema>;

export const jobCancelSchema = z.object({
  reason: z.string().max(200).optional(),
});

export const userCreateSchema = z.object({
  username: usernameSchema,
  displayName: z.string().min(1).max(64),
  email: z.string().email().max(128).optional(),
  password: passwordSchema,
  role: z.enum(['viewer', 'operator', 'admin']),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userPatchSchema = z
  .object({
    displayName: z.string().min(1).max(64).optional(),
    email: z.string().email().max(128).nullable().optional(),
    role: z.enum(['viewer', 'operator', 'admin']).optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'ต้องมีการแก้ค่าอย่างน้อย 1 ข้อ' });
export type UserPatchInput = z.infer<typeof userPatchSchema>;

export const poiUpsertSchema = z.object({
  code: z.string().min(1).max(16),
  nameTh: z.string().min(1).max(64),
  nameEn: z.string().min(1).max(64),
  x: z.number(),
  y: z.number(),
  headingDeg: z.number().min(0).max(360).nullable().optional(),
  zone: z.string().max(64).nullable().optional(),
  isPublic: z.boolean().default(true),
  isDock: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});
export type PoiUpsertInput = z.infer<typeof poiUpsertSchema>;

export const keepoutsSchema = z.array(
  z.object({
    id: z.number().optional(),
    name: z.string().min(1).max(64),
    polygon: z.array(z.tuple([z.number(), z.number()])).min(3),
  }),
);
export type KeepoutsInput = z.infer<typeof keepoutsSchema>;

export const mapImportSchema = z.object({
  name: z.string().min(1).max(100),
  widthM: z.number().positive().max(1000),
  heightM: z.number().positive().max(1000),
  slamMapRef: z.string().max(255).nullable().optional(),
  rooms: z.array(z.object({
    id: z.string().min(1), x: z.number(), y: z.number(),
    w: z.number().positive(), h: z.number().positive(),
    nameTh: z.string().optional(), nameEn: z.string().optional(),
    kind: z.enum(['lobby', 'room', 'corridor']).optional(),
  })),
  pois: z.array(poiUpsertSchema).min(1),
  keepouts: keepoutsSchema.default([]),
}).superRefine((map, ctx) => {
  const codes = new Set<string>();
  for (const [index, poi] of map.pois.entries()) {
    if (codes.has(poi.code)) ctx.addIssue({ code: 'custom', path: ['pois', index, 'code'], message: 'รหัสจุดรับซ้ำ' });
    codes.add(poi.code);
    if (poi.x < 0 || poi.x > map.widthM || poi.y < 0 || poi.y > map.heightM) {
      ctx.addIssue({ code: 'custom', path: ['pois', index], message: 'จุดรับอยู่นอกแผนที่' });
    }
  }
});
export type MapImportInput = z.infer<typeof mapImportSchema>;

export const kioskEscortSchema = z.object({
  destPoiCode: z.string().min(1).max(64),
  lang: z.enum(['th', 'en']).default('th'),
});
export type KioskEscortInput = z.infer<typeof kioskEscortSchema>;
