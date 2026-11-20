import dns from 'node:dns'
import mongoose from 'mongoose'
import { env } from './env.ts'

const STATES: readonly string[] = ['disconnected', 'connected', 'connecting', 'disconnecting']

export async function connectDb(): Promise<void> {
  if (env.DNS_SERVERS) dns.setServers(env.DNS_SERVERS.split(',').map((s) => s.trim()))
  mongoose.set('strictQuery', true)
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB, serverSelectionTimeoutMS: 15_000 })
  const host = mongoose.connection.host.endsWith('.mongodb.net') ? 'MongoDB Atlas' : mongoose.connection.host
  console.log(`MongoDB connected (${host}, database: ${mongoose.connection.name})`)
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
}

export function dbState(): string {
  return STATES[mongoose.connection.readyState] ?? 'unknown'
}
