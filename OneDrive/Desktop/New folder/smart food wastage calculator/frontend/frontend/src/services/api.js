import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 12000,
})

const pendingGets = new Map()

export function getData(path, config = {}) {
  const key = `${path}?${new URLSearchParams(config.params || {}).toString()}`
  if (pendingGets.has(key)) return pendingGets.get(key)

  const request = api.get(path, config)
    .then(({ data }) => data)
    .finally(() => pendingGets.delete(key))
  pendingGets.set(key, request)
  return request
}

export async function getAllRecords() {
  const limit = 1000
  const firstPage = await getData('/records', { params: { skip: 0, limit } })
  const records = [...firstPage.records]
  for (let skip = limit; skip < firstPage.total; skip += limit) {
    const page = await getData('/records', { params: { skip, limit } })
    records.push(...page.records)
    if (!page.records.length) break
  }
  return { records, total: firstPage.total }
}

export function getApiError(error) {
  if (error.response?.data?.detail) {
    return typeof error.response.data.detail === 'string'
      ? error.response.data.detail
      : 'The request was not accepted. Check the submitted fields.'
  }
  if (error.code === 'ECONNABORTED') return 'The local FoodWise service took too long to respond. Try again.'
  if (!error.response) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 'This browser has no network connection. Cached app pages remain available; local data actions need the local backend.'
    }
    return 'Cannot reach the local FoodWise backend. Internet access is not required; start or check the local API service.'
  }
  return `Request failed (${error.response.status}). Please try again.`
}

export default api