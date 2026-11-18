import { useTranslation } from 'react-i18next';
import type { DashboardData, DashboardSnapshot } from '../../services/dashboard';
export type HistoryMetric = 'lemmas' | 'forms' | 'bytes';
import { calendarDays, dayLabel } from '../../services/dashboardFormat';
function ceiling(value: number) { if (!value) return 10; const scale = 10 ** Math.floor(Math.log10(value)); return Math.ceil(value / scale) * scale; }
export function ActivityChart({ data }: { data: DashboardData }) {
  const { t, i18n } = useTranslation(); const locale = i18n.language;
  const days = calendarDays(data.start, data.end); const counts = new Map(data.daily.map(day => [day.day, day]));
  const max = ceiling(Math.max(0,...data.daily.map(day => day.analyzer+day.wizard+day.legacy)));
  const width=530/days.length; const compact = new Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:0});
  return <><svg viewBox="0 0 610 220" preserveAspectRatio="none" role="img" aria-label={t('dashboard.activityChart')} className="dashboard-chart">
    <title>{t('dashboard.activityChart')}: {data.words.toLocaleString(locale)}</title>
    {[0,0.5,1].map(part=><g key={part}><line x1="52" x2="595" y1={174-part*145} y2={174-part*145} className="chart-grid"/><text x="42" y={179-part*145} textAnchor="end">{compact.format(max*part)}</text></g>)}
    {days.map((day,index)=>{ const value=counts.get(day);let bottom=174;return <g key={day}><title>{dayLabel(day,locale)}: {((value?.analyzer??0)+(value?.wizard??0)+(value?.legacy??0)).toLocaleString(locale)}</title>
      {(['analyzer','wizard','legacy'] as const).map(kind=>{const height=(value?.[kind]??0)/max*145;bottom-=height;return <rect key={kind} x={56+index*width} y={bottom} width={Math.max(.5,width-3)} height={height} className={`chart-${kind}`}/>;})}
      {(index===0||index===days.length-1||index===Math.floor(days.length/4)||index===Math.floor(days.length/2)||index===Math.floor(days.length*3/4))&&<text x={56+index*width+width/2} y="199" textAnchor={index===days.length-1?'end':'middle'}>{dayLabel(day,locale)}</text>}
    </g>;})}
  </svg><details className="chart-data"><summary>{t('dashboard.showChartData')}</summary><table><thead><tr><th>{t('home.table.date')}</th><th>{t('dashboard.words')}</th></tr></thead><tbody>{days.map(day=><tr key={day}><td>{dayLabel(day,locale)}</td><td>{((counts.get(day)?.analyzer??0)+(counts.get(day)?.wizard??0)+(counts.get(day)?.legacy??0)).toLocaleString(locale)}</td></tr>)}</tbody></table></details></>;
}
export function HistoryChart({ history, metric, start, end }: { history: DashboardSnapshot[]; metric: HistoryMetric; start: string; end: string }) {
  const {t,i18n}=useTranslation();const locale=i18n.language;const days=calendarDays(start,end);
  const values=history.map(row=>row[metric]);const low=Math.min(...values),high=Math.max(0,...values);
  const rawStep=(high-(Number.isFinite(low)?low:0))/2||high/2||1;
  const magnitude=10**Math.floor(Math.log10(rawStep));const step=[1,2,5,10].map(n=>n*magnitude).reduce((best,n)=>Math.abs(n-rawStep)<Math.abs(best-rawStep)?n:best);
  const min=values.length>1?Math.max(0,Math.floor(low/step)*step):0;const max=Math.max(min+step,high+(high-min)*.08);
  const ticks=Array.from({length:Math.floor((max-min)/step)+1},(_,i)=>min+i*step);
  const format=(n:number)=>metric==='bytes'?`${new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(n/1_000_000)} MB`:new Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:1}).format(n);
  const points=history.map(row=>({x:55+Math.max(0,days.indexOf(row.day))/Math.max(1,days.length-1)*450,y:174-(row[metric]-min)/(max-min)*145,row}));
  const segments:typeof points[]=[];for(const point of points){const previous=segments.at(-1)?.at(-1);if(!previous||days.indexOf(point.row.day)-days.indexOf(previous.row.day)>1)segments.push([]);segments.at(-1)!.push(point);}
  const paths=segments.map(segment=>segment.map((point,i)=>i===0?`M${point.x},${point.y}`:`H${point.x}V${point.y}`).join(' '));
  return <><svg viewBox="0 0 535 220" preserveAspectRatio="none" role="img" aria-label={t('dashboard.historyChart')} className="dashboard-chart">
    <title>{t('dashboard.historyChart')}: {t(`dashboard.${metric}`)}</title>
    {ticks.map(value=><g key={value}><line x1="55" x2="510" y1={174-(value-min)/(max-min)*145} y2={174-(value-min)/(max-min)*145} className="chart-grid"/><text x="45" y={179-(value-min)/(max-min)*145} textAnchor="end">{format(value)}</text></g>)}
    {paths.map((path,i)=><g key={i}><path d={`${path} L${segments[i].at(-1)!.x},174 L${segments[i][0].x},174 Z`} className="chart-area"/><path d={path} fill="none" className="chart-line"/></g>)}
    {points.map(({x,y,row},i)=><circle key={row.day} cx={x} cy={y} r={i===points.length-1?5:0} className="chart-analyzer"><title>{dayLabel(row.day,locale)}: {format(row[metric])}</title></circle>)}
    {points.length>0&&<rect x={Math.min(430,points[points.length-1].x-70)} y={Math.max(0,points[points.length-1].y-36)} width="80" height="28" rx="8" className="dashboard-history-label"/>}
    {points.length>0&&<text x={Math.min(500,points[points.length-1].x)} y={Math.max(17,points[points.length-1].y-12)} textAnchor="end" className="chart-current">{metric==='bytes'?format(points[points.length-1].row[metric]):points[points.length-1].row[metric].toLocaleString(locale)}</text>}
    {[0,.25,.5,.75,1].map((fraction,index)=><text key={index} x={55+450*fraction} y="199" textAnchor={index===4?'end':index===0?'start':'middle'}>{dayLabel(days[Math.round((days.length-1)*fraction)]??start,locale)}</text>)}
  </svg>{history.length<2&&<p className="dashboard-history-hint">{t('dashboard.historyStart')}</p>}<details className="chart-data"><summary>{t('dashboard.showChartData')}</summary><table><tbody>{history.map(row=><tr key={row.day}><th>{dayLabel(row.day,locale)}</th><td>{format(row[metric])}</td></tr>)}</tbody></table></details></>;
}
