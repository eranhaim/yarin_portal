import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'

// One WhatsApp message: waiting to be sent, sent, or failed. The key makes each message unique, so the same
// event never sends twice (for example "decision:<work>:<time>" or "monthly:<customer>:2026-11").

export const WHATSAPP_KINDS = ['welcome', 'decision', 'reminder', 'monthly', 'adminRequest', 'adminLead', 'adminDigest', 'adminAi', 'test'] as const
export type WhatsAppKind = (typeof WHATSAPP_KINDS)[number]

const whatsAppMessageSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, maxlength: 300 },
    kind: { type: String, enum: WHATSAPP_KINDS, required: true },
    /** The WhatsApp chat (number@c.us). */
    chatId: { type: String, required: true, maxlength: 60 },
    /** Who it is for, as the admins see it (a customer's name, "Yarin", ...). */
    toName: { type: String, default: '', maxlength: 120 },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    text: { type: String, required: true, maxlength: 4000 },
    status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' },
    /** Not before this time (quiet hours, or a retry). */
    sendAfter: { type: Date, default: () => new Date() },
    /** Test messages go out at once, also at night. */
    urgent: { type: Boolean, default: false },
    tries: { type: Number, default: 0 },
    error: { type: String, default: '', maxlength: 500 },
    providerId: { type: String, default: '' },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
)
whatsAppMessageSchema.index({ status: 1, sendAfter: 1 })
whatsAppMessageSchema.index({ createdAt: -1 })

export type WhatsAppMessageDoc = HydratedDocument<InferSchemaType<typeof whatsAppMessageSchema>>
export const WhatsAppMessage = model('WhatsAppMessage', whatsAppMessageSchema)
