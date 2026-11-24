import { Router } from 'express'
import { businessRouter } from './business.ts'
import { coachRouter } from './coach.ts'
import { gameRouter } from './game.ts'
import { homeworkRouter } from './homework.ts'
import { planRouter } from './plan.ts'
import { profileRouter } from './profile.ts'
import { requireCustomer } from './shared.ts'

// The customer's own area ("/api/me"): plan, homework, game, coaches and character.
export const meRouter = Router()

meRouter.use(requireCustomer)
meRouter.use(planRouter)
meRouter.use(homeworkRouter)
meRouter.use(gameRouter)
meRouter.use(businessRouter)
meRouter.use(coachRouter)
meRouter.use(profileRouter)
