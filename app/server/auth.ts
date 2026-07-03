import { timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  // Length comparison leaks only length, not content; timingSafeEqual needs equal sizes.
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

function reject(res: Response) {
  res
    .set('WWW-Authenticate', 'Basic realm="critter-tracker"')
    .status(401)
    .json({ error: 'unauthorized' })
}

export function requireWriteAuth(user: string, password: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? ''
    if (!header.startsWith('Basic ')) {
      reject(res)
      return
    }
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString()
    const separator = decoded.indexOf(':')
    if (separator < 0) {
      reject(res)
      return
    }
    const gotUser = decoded.slice(0, separator)
    const gotPassword = decoded.slice(separator + 1)
    const userOk = safeEqual(gotUser, user)
    const passwordOk = safeEqual(gotPassword, password)
    if (!userOk || !passwordOk) {
      reject(res)
      return
    }
    next()
  }
}
