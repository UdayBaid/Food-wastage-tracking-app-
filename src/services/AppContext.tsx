import * as Network from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useFoodWiseDatabase } from '../db/provider';
import { getApiBaseUrl, loadApiBaseUrl, saveApiBaseUrl as persistApiBaseUrl, api } from './api';
import { getModelLoadError, initializeLocalModels } from './localModels';
import { syncPendingRecords } from './sync';

export type BackendState = 'not-configured' | 'checking' | 'ready' | 'unavailable' | 'database' | 'model';
export type ModelState = 'loading' | 'ready' | 'failed';

interface AppContextValue {
  internet: boolean | null;
  backend: BackendState;
  models: ModelState;
  modelError: string;
  apiBaseUrl: string;
  setApiBaseUrl: (value: string) => Promise<void>;
  checkBackend: () => Promise<void>;
  syncNow: () => Promise<{ synced: number; conflicts: number }>;
  syncMessage: string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppServicesProvider({ children }: PropsWithChildren) {
  const { database, error: databaseError } = useFoodWiseDatabase();
  const [internet, setInternet] = useState<boolean | null>(null);
  const [backend, setBackend] = useState<BackendState>('checking');
  const [models, setModels] = useState<ModelState>('loading');
  const [modelError, setModelError] = useState('');
  const [apiBaseUrl, setApiBaseUrlState] = useState('');
  const [syncMessage, setSyncMessage] = useState('');

  const checkBackend = useCallback(async () => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      setBackend('not-configured');
      return;
    }
    setBackend('checking');
    try {
      const { data } = await api.get('/health/local', { timeout: 5000 });
      if (data.database_available === false) setBackend('database');
      else if (data.prediction_model_loaded === false || data.optimization_model_available === false) setBackend('model');
      else setBackend('ready');
    } catch {
      setBackend('unavailable');
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!database) throw new Error(databaseError || 'Local database is unavailable.');
    if (backend !== 'ready') throw new Error('Configure and connect the local FastAPI service before syncing.');
    const result = await syncPendingRecords(database);
    setSyncMessage(`${result.synced} synced · ${result.conflicts} conflicts`);
    return result;
  }, [backend, database, databaseError]);

  const setApiBaseUrl = useCallback(async (value: string) => {
    const normalized = await persistApiBaseUrl(value);
    setApiBaseUrlState(normalized);
    await checkBackend();
  }, [checkBackend]);

  useEffect(() => {
    let mounted = true;
    void Network.getNetworkStateAsync().then((network) => {
      if (mounted) setInternet(network.isInternetReachable ?? network.isConnected ?? null);
    }).catch(() => { if (mounted) setInternet(null); });
    void loadApiBaseUrl().then((baseUrl) => {
      if (mounted) setApiBaseUrlState(baseUrl);
    }).catch(() => { if (mounted) setBackend('not-configured'); });
    void initializeLocalModels().then(() => {
      if (mounted) setModels('ready');
    }).catch((error: unknown) => {
      if (!mounted) return;
      const message = error instanceof Error ? error.message : getModelLoadError();
      setModelError(message);
      setModels('failed');
    });

    const subscription = Network.addNetworkStateListener((state) => {
      setInternet(state.isInternetReachable ?? state.isConnected ?? null);
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    void checkBackend();
    const timer = setInterval(() => { void checkBackend(); }, 20000);
    return () => clearInterval(timer);
  }, [apiBaseUrl, checkBackend]);

  useEffect(() => {
    if (!database || backend !== 'ready') return;
    void syncPendingRecords(database).then((result) => {
      if (result.synced || result.conflicts) setSyncMessage(`${result.synced} synced · ${result.conflicts} conflicts`);
    });
    const timer = setInterval(() => {
      void syncPendingRecords(database).then((result) => {
        if (result.synced || result.conflicts) setSyncMessage(`${result.synced} synced · ${result.conflicts} conflicts`);
      });
    }, 20000);
    return () => clearInterval(timer);
  }, [backend, database]);

  const value = useMemo(() => ({ internet, backend, models, modelError, apiBaseUrl, setApiBaseUrl, checkBackend, syncNow, syncMessage }), [internet, backend, models, modelError, apiBaseUrl, setApiBaseUrl, checkBackend, syncNow, syncMessage]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppServices() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useAppServices must be rendered inside AppServicesProvider.');
  return value;
}
