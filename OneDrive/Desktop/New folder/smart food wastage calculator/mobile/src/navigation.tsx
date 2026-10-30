import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Activity, ClipboardList, Home, Lightbulb, MoreHorizontal } from 'lucide-react-native';
import { View } from 'react-native';
import { colors } from './theme';
import { AboutScreen, AlertsScreen, CameraScreen, DashboardScreen, MoreScreen, RecommendationsScreen, RecordsScreen, ReportsScreen, SustainabilityScreen } from './screens';

export type RootStackParamList = {
  MainTabs: undefined;
  Alerts: undefined;
  Sustainability: undefined;
  About: undefined;
  Camera: undefined;
};

type MainTabParamList = {
  Dashboard: undefined;
  Records: undefined;
  Reports: undefined;
  Plan: undefined;
  More: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return <Tabs.Navigator screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.terracotta,
    tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.line, height: 62, paddingTop: 6, paddingBottom: 5 },
    tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
  }}>
    <Tabs.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
    <Tabs.Screen name="Records" component={RecordsScreen} options={{ tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }} />
    <Tabs.Screen name="Reports" component={ReportsScreen} options={{ tabBarIcon: ({ color, size }) => <Activity color={color} size={size} /> }} />
    <Tabs.Screen name="Plan" component={RecommendationsScreen} options={{ title: 'AI plan', tabBarIcon: ({ color, size }) => <Lightbulb color={color} size={size} /> }} />
    <Tabs.Screen name="More" component={MoreScreen} options={{ tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} /> }} />
  </Tabs.Navigator>;
}

export function RootNavigator() {
  return <NavigationContainer>
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Alerts" component={AlertsScreen} />
      <Stack.Screen name="Sustainability" component={SustainabilityScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Camera" component={CameraScreen} />
    </Stack.Navigator>
  </NavigationContainer>;
}
