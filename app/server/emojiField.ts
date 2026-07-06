import { isKnownCustom } from './customEmoji.js'

const CUSTOM_PREFIX = 'custom:'

/** Shared emoji validation for the sightings and profiles POST routes.
 *  Returns an error message, or null when valid. */
export function validateEmoji(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40) {
    return 'required, 1-40 characters'
  }
  if (value.startsWith(CUSTOM_PREFIX) && !isKnownCustom(value)) {
    return 'unknown custom emoji'
  }
  return null
}
