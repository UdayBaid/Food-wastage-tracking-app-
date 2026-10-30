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
  if (normalized && !/^https?:\/\//i.test(normalized)) throw new Error('Use a full local address such as http://192.168.1.20:8002.');
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
