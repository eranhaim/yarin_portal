import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'

// An admin account (Yarin, Oren, and so on). Admins sign in with email and password.
// The ADMIN_PASSWORD from .env also still opens the admin panel, as the main ("owner") login.

const adminSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export type AdminDoc = HydratedDocument<InferSchemaType<typeof adminSchema>>

export const Admin = model('Admin', adminSchema)

export function toAdminAccountView(a: AdminDoc) {
  return {
    id: a.id as string,
    name: a.name,
    email: a.email,
    createdAt: a.createdAt,
    lastLoginAt: a.lastLoginAt,
  }
}
