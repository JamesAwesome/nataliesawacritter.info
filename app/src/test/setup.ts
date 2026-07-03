import '@testing-library/jest-dom'

// Ensure localStorage is properly initialized in jsdom
if (typeof localStorage !== 'undefined' && !localStorage.getItem) {
  const storage: Record<string, string> = {}

  const storageObj = {
    getItem(key: string) {
      return storage[key] ?? null
    },
    setItem(key: string, value: string) {
      storage[key] = value
    },
    removeItem(key: string) {
      delete storage[key]
    },
    clear() {
      Object.keys(storage).forEach((key) => delete storage[key])
    },
    key(index: number) {
      const keys = Object.keys(storage)
      return keys[index] ?? null
    },
    get length() {
      return Object.keys(storage).length
    },
  }

  Object.defineProperty(window, 'localStorage', {
    value: storageObj,
    writable: false,
  })
}
