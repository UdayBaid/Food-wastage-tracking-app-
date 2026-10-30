import * as SQLite from 'expo-sqlite';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabase } from './migrations';

interface DatabaseContextValue {
  database: SQLiteDatabase | null;
  error: string;
}

const DatabaseContext = createContext<DatabaseContextValue>({ database: null, error: '' });

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [database, setDatabase] = useState<SQLiteDatabase | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    SQLite.openDatabaseAsync('foodwise-mobile.db')
      .then(async (opened) => {
        await migrateDatabase(opened);
        if (mounted) setDatabase(opened);
        else await opened.closeAsync();
      })
      .catch((cause: unknown) => {
        if (mounted) setError(cause instanceof Error ? cause.message : 'The local FoodWise database could not be opened.');
      });
    return () => { mounted = false; };
  }, []);

  const value = useMemo(() => ({ database, error }), [database, error]);
  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

export function useFoodWiseDatabase() {
  return useContext(DatabaseContext);
}
