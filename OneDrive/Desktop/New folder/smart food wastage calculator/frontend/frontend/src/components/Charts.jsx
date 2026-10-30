import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

const colors = ['#c95740', '#91a68a', '#d2a84f', '#7b8d84', '#df896d']
const axis = { fill: '#8a857a', fontSize: 11 }

export function TrendChart({ data = [], height = 250 }) {
  return <ResponsiveContainer width="100%" height={height}>
    <LineChart data={data} margin={{ top: 14, right: 12, left: -18, bottom: 0 }}>
      <CartesianGrid stroke="#ebe7de" vertical={false} />
      <XAxis dataKey="period" tick={axis} axisLine={false} tickLine={false} tickMargin={10} minTickGap={26} />
      <YAxis tick={axis} axisLine={false} tickLine={false} />
      <Tooltip contentStyle={{ border: '1px solid #e8e1d6', borderRadius: 8, fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Waste']} />
      <Line type="monotone" dataKey="waste_percentage" stroke="#c95740" strokeWidth={2.5} dot={{ r: 3, fill: '#c95740', strokeWidth: 0 }} activeDot={{ r: 5 }} />
    </LineChart>
  </ResponsiveContainer>
}

export function ComparisonChart({ data = [], height = 250 }) {
  return <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} margin={{ top: 12, right: 8, left: -20, bottom: 0 }} barGap={5}>
      <CartesianGrid stroke="#ebe7de" vertical={false} />
      <XAxis dataKey="period" tick={axis} axisLine={false} tickLine={false} tickMargin={10} minTickGap={24} />
      <YAxis tick={axis} axisLine={false} tickLine={false} />
      <Tooltip contentStyle={{ border: '1px solid #e8e1d6', borderRadius: 8, fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(1)} kg`]} />
      <Bar dataKey="prepared_kg" name="Prepared" fill="#d2a84f" radius={[4, 4, 0, 0]} />
      <Bar dataKey="consumed_kg" name="Consumed" fill="#91a68a" radius={[4, 4, 0, 0]} />
      <Bar dataKey="wasted_kg" name="Wasted" fill="#c95740" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
}

export function MealDonut({ data = [], height = 230 }) {
  const chartData = data.map((item) => ({
    name: item.meal_category,
    value: Number(item.wasted_kg || 0),
  })).filter((item) => item.value > 0)
  if (!chartData.length) return <div className="chart-empty">No meal waste data available</div>
  return <div className="donut-wrap">
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="84%" paddingAngle={3} stroke="none">
          {chartData.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ border: '1px solid #e8e1d6', borderRadius: 8, fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(1)} kg`, 'Waste']} />
      </PieChart>
    </ResponsiveContainer>
    <div className="donut-legend">
      {chartData.map((item, index) => <div key={item.name}><span style={{ backgroundColor: colors[index % colors.length] }} /><span>{item.name}</span><strong>{item.value.toFixed(1)} kg</strong></div>)}
    </div>
  </div>
}