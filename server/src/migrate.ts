import { Customer } from './models/Customer.ts'
import { XpEvent } from './models/Game.ts'

// Small, repeatable data fixes that run at startup.
export async function migrate(): Promise<void> {
  // A missing referral code must be absent: null values collide in the unique index.
  await Customer.updateMany({ referralCode: null }, { $unset: { referralCode: 1 } })
  // Business results and referrals stopped paying learning points: the two metrics are separate now.
  await XpEvent.deleteMany({ refKey: { $regex: /^(revenue|referral):/ } })
}
