import { randomUUID } from 'node:crypto'
import express, { Router } from 'express'
import { z } from 'zod'
import { aiJson, sendAiError, useAiQuota } from '../../ai/claude.ts'
import { LOOK_SYSTEM } from '../../ai/prompts.ts'
import { defaultLook, lookSchema, type Look } from '../../game/content.ts'
import { PERSON_IDS } from '../../game/people.ts'
import { parseBody } from '../../http.ts'
import { detectImageType, IMAGE_TYPES, type ImageType } from '../../images.ts'
import { toCustomerView } from '../../models/Customer.ts'
import { deleteObject, getObjectBytes, putObject, storageEnabled } from '../../storage.ts'
import { customerOf } from './shared.ts'

// The customer's game character: its look, their profile photo, and "make my character from my photo".
export const profileRouter = Router()

/** Asks Claude to pick character features that match the person in the photo. */
export async function lookFromPhoto(image: Buffer, type: ImageType): Promise<Look> {
  return aiJson({
    // From a photo the person is always chosen.
    schema: lookSchema.extend({ person: z.enum(PERSON_IDS) }),
    system: LOOK_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: type.mime, data: image.toString('base64') } },
          { type: 'text', text: 'Design the character for this person.' },
        ],
      },
    ],
    effort: 'low',
  })
}

profileRouter.get('/profile', async (_req, res) => {
  const customer = customerOf(res)
  res.json({ look: (customer.look as Look | null) ?? defaultLook(customer.name), custom: Boolean(customer.look) })
})

profileRouter.put('/look', async (req, res) => {
  const body = parseBody(z.object({ look: lookSchema }), req, res)
  if (!body) return
  const customer = customerOf(res)
  customer.look = body.look
  await customer.save()
  res.json({ look: body.look, custom: true })
})

profileRouter.put('/photo', express.raw({ type: IMAGE_TYPES, limit: '5mb' }), async (req, res) => {
  if (!storageEnabled) {
    res.status(503).json({ error: 'אחסון הקבצים לא מוגדר' })
    return
  }
  const data: unknown = req.body
  const type = Buffer.isBuffer(data) ? detectImageType(data) : null
  if (!Buffer.isBuffer(data) || !type) {
    res.status(415).json({ error: 'העלו תמונה מסוג JPEG, PNG או WebP' })
    return
  }
  const customer = customerOf(res)
  const key = `avatars/${customer.id}/${randomUUID()}.${type.ext}`
  await putObject(key, data, type.mime)
  const previousKey = customer.avatarKey
  customer.avatarKey = key
  await customer.save()
  if (previousKey) await deleteObject(previousKey).catch((err) => console.warn('Could not delete old avatar', err))
  res.json({ customer: await toCustomerView(customer) })
})

profileRouter.post('/look/detect', async (_req, res) => {
  const customer = customerOf(res)
  if (!customer.avatarKey) {
    res.status(409).json({ error: 'העלו קודם תמונת פרופיל.' })
    return
  }
  const image = await getObjectBytes(customer.avatarKey)
  const type = image ? detectImageType(image) : null
  if (!image || !type) {
    res.status(409).json({ error: 'לא הצלחנו לקרוא את תמונת הפרופיל. העלו אותה שוב.' })
    return
  }
  try {
    await useAiQuota(customer._id)
    res.json({ look: await lookFromPhoto(image, type) })
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})
