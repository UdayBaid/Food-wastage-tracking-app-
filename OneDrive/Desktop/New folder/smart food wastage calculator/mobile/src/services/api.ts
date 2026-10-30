import axios, { AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL_KEY = 'foodwise.apiBaseUrl';
const DEFAULT_TIMEOUT_MS = 10000;
let currentBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? '';

export const api = axios.create({ timeout: DEFAULT_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } });

export async function loadApiBaseUrl(): Promise<string> {
  const stored = await SecureStore.getItemAsync(API_URL_KEY);
  currentBaseUrl = stored?.trim() || currentBaseUrl;
  api.defaults.baseURL = currentBaseUrl || undefined;
  return currentBaseUrl;
}

export async function saveApiBaseUrl(value: string): Promise<string> {
  const normalized = value.trim().replace(/\/$/, '');
  if (normalized) {
    let parsed: URL;
    try { parsed = new URL(normalized); }
    catch { throw new Error('Enter a full server URL, such as http://192.168.1.20:8002.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('The server URL must use HTTP or HTTPS.');
    const octets = parsed.hostname.split('.').map(Number);
    const ipv4 = octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
    const privateAddress = ipv4 && (
      octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
      || (octets[0] === 169 && octets[1] === 254)
    );
    const localName = ['localhost', '10.0.2.2'].includes(parsed.hostname) || parsed.hostname.endsWith('.local') || parsed.hostname.endsWith('.lan');
    if (parsed.protocol === 'http:' && !privateAddress && !localName) {
      throw new Error('Plain HTTP is allowed only for a local/private host. Use HTTPS for remote servers.');
    }
  }
  if (normalized) await SecureStore.setItemAsync(API_URL_KEY, normalized);
  else await SecureStore.deleteItemAsync(API_URL_KEY);
  currentBaseUrl = normalized;
  api.defaults.baseURL = normalized || undefined;
  return currentBaseUrl;
}

export function getApiBaseUrl(): string {
  return currentBaseUrl;
}

export function explainApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    if (axiosError.response?.data?.detail) return axiosError.response.data.detail;
    if (axiosError.code === 'ECONNABORTED') return 'The local FoodWise service timed out.';
    if (!axiosError.response) return 'Local backend unavailable. Your records and local AI remain on this device.';
    return `Local service returned HTTP ${axiosError.response.status}.`;
  }
  return error instanceof Error ? error.message : 'The local operation could not be completed.';
}
