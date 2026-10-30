import { Activity, ArrowDown, Database, Leaf, Lightbulb, ScanLine, Sparkles } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Panel from '../components/Panel'
import LocalDataTools from '../components/LocalDataTools'

const workflow = [
  { icon: ScanLine, index: '01', title: 'Record meals', text: 'Capture prepared, consumed and wasted quantities with meal and attendance context.' },
  { icon: Database, index: '02', title: 'Build a kitchen history', text: 'Food records are stored in the local SQLite database and used by analytics.' },
  { icon: Sparkles, index: '03', title: 'Estimate and plan', text: 'Existing ML models estimate food waste and compare preparation scenarios.' },
  { icon: Activity, index: '04', title: 'Review patterns', text: 'Reports help teams see meal and time patterns and make informed adjustments.' },
]

export default function About() {
  return <>
    <PageHeader eyebrow="ABOUT THIS PROJECT" title="A more thoughtful kitchen." description="FoodWise turns everyday meal records into a practical view of food waste and preparation choices." />
    <section className="about-intro">
      <div className="about-art"><div className="art-ring art-ring-one" /><div className="art-ring art-ring-two" /><div className="art-core"><Leaf size={44} strokeWidth={1.4} /></div><span className="art-caption">GROW WITH BETTER DATA</span></div>
      <div className="about-copy"><span className="eyebrow">THE IDEA</span><h2>Waste is easier to reduce when it is visible.</h2><p>FoodWise is a food waste tracking and optimization project for institutional kitchens. It brings food records, historical analytics and model-assisted planning into one local workflow.</p><p>The goal is not to promise a perfect forecast. It is to give kitchen teams a consistent picture they can learn from, one meal at a time.</p></div>
    </section>
    <div className="about-feature-grid">
      <Panel title={<><Activity size={18} /> The challenge</>}><p className="body-copy">Preparation decisions often rely on rough estimates, while waste is only noticed after service. Without consistent records, it is difficult to identify which meals or days need a closer look.</p></Panel>
      <Panel title={<><Sparkles size={18} /> AI-assisted estimates</>}><p className="body-copy">The existing baseline model predicts waste from meal, attendance, capacity and calendar inputs. Results are estimates based on its training data, not guaranteed outcomes.</p></Panel>
      <Panel title={<><Lightbulb size={18} /> Preparation optimization</>}><p className="body-copy">A separate existing optimization model scores preparation quantities using predicted waste and configured shortage/waste costs. Teams can compare its recommendation with their current plan.</p></Panel>
      <Panel title={<><Database size={18} /> Local-first data</>}><p className="body-copy">The app connects to a FastAPI backend with SQLite persistence, so records and model logs remain in the project environment. The trained model artifacts remain local files.</p></Panel>
    </div>
    <Panel title="Project workflow" subtitle="From a service entry to an informed next step." className="workflow-panel">
      <div className="workflow-grid">{workflow.map(({ icon: Icon, index, title, text }, position) => <div className="workflow-step" key={index}><span className="workflow-icon"><Icon size={19} /></span><span className="workflow-index">{index}</span><h3>{title}</h3><p>{text}</p>{position < workflow.length - 1 && <ArrowDown className="workflow-arrow" size={17} />}</div>)}</div>
    </Panel>
    <LocalDataTools />
    <div className="stack-strip"><span>TECHNOLOGY</span><div>React <i>·</i> Vite <i>·</i> FastAPI <i>·</i> SQLite <i>·</i> scikit-learn <i>·</i> Recharts</div></div>
  </>
}