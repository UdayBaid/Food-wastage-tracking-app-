import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { DatabaseProvider, useFoodWiseDatabase } from './src/db/provider';
import { RootNavigator } from './src/navigation';
import { AppServicesProvider, useAppServices } from './src/services/AppContext';
import { colors } from './src/theme';

function AppShell() {
  const { database, error } = useFoodWiseDatabase();
  const { internet, backend, models } = useAppServices();
  return <SafeAreaView style={styles.root} edges={['top']}>
    <StatusBar style="dark" />
    <View style={styles.statusStrip}>
      <View style={styles.statusCell}><View style={[styles.dot, { backgroundColor: internet === false ? colors.mustard : internet === true ? colors.green : colors.muted }]} /><Text style={styles.statusText}>{internet === false ? 'Internet offline' : internet === true ? 'Internet online' : 'Internet checking'}</Text></View>
      <View style={styles.statusCell}><View style={[styles.dot, { backgroundColor: backend === 'ready' ? colors.green : backend === 'unavailable' ? colors.terracotta : colors.mustard }]} /><Text style={styles.statusText}>{backend === 'ready' ? 'FastAPI ready' : backend === 'unavailable' ? 'Backend unavailable' : backend === 'not-configured' ? 'Local-only' : backend === 'database' ? 'Server DB issue' : backend === 'model' ? 'Server model issue' : 'API checking'}</Text></View>
      <View style={styles.statusCell}><View style={[styles.dot, { backgroundColor: models === 'ready' ? colors.green : models === 'failed' ? colors.terracotta : colors.mustard }]} /><Text style={styles.statusText}>{models === 'ready' ? 'On-device AI' : models === 'failed' ? 'AI load failed' : 'AI loading'}</Text></View>
    </View>
    {error ? <View style={styles.errorState}><Text style={styles.errorTitle}>Local database unavailable</Text><Text style={styles.errorText}>{error}</Text></View> : !database ? <View style={styles.loading}><ActivityIndicator color={colors.terracotta} /><Text style={styles.loadingText}>Opening secure local FoodWise storage</Text></View> : <RootNavigator />}
  </SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider><DatabaseProvider><AppServicesProvider><AppShell /></AppServicesProvider></DatabaseProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  statusStrip: { flexDirection: 'row', justifyContent: 'space-between', gap: 5, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.paper, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  statusCell: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: colors.muted, fontSize: 9, fontWeight: '600' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.muted, fontSize: 13 },
  errorState: { flex: 1, justifyContent: 'center', padding: 24, gap: 10 },
  errorTitle: { color: colors.terracotta, fontSize: 18, fontWeight: '700' },
  errorText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
});
