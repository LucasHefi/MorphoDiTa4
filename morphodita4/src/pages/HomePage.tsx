import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ArrowRight, BookOpen, CalendarDays, Check, Database, Layers, RefreshCw } from 'lucide-react';
import { Badge, Button, Select } from '../components/common';
import { ModelSelector } from '../components/analyzer/ModelSelector';
import { ActivityChart, HistoryChart, type HistoryMetric } from '../components/common/DashboardCharts';
import { dayLabel } from '../services/dashboardFormat';
import { DashboardService, type DashboardData } from '../services/dashboard';

export const HomePage = () => {
  const { t, i18n } = useTranslation(); const locale=i18n.language;
  const [days,setDays]=useState(30),[metric,setMetric]=useState<HistoryMetric>('lemmas'),[termKind,setTermKind]=useState<'lemmas'|'forms'>('lemmas');
  const [data,setData]=useState<DashboardData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[reload,setReload]=useState(0);
  const request=useRef(0);
  useEffect(()=>{const id=++request.current;let active=true;
    const load=async()=>{setLoading(true);setError(false);try{const response=await DashboardService.get(days);if(active&&request.current===id)setData(response);}catch{if(active&&request.current===id){setData(null);setError(true);}}finally{if(active&&request.current===id)setLoading(false);}};
    void load();const timer=setInterval(()=>void load(),60_000);return()=>{active=false;clearInterval(timer);};
  },[days,reload]);
  const number=(value:number|undefined)=>value===undefined?'—':value.toLocaleString(locale);
  const terms=(termKind==='lemmas'?data?.frequent_lemmas:data?.frequent_forms)?.slice(0,5)??[];
  const stats=[
    {key:'words',value:number(data?.words),caption:data?t('dashboard.completedRuns',{count:data.runs,formatted:number(data.runs)}):'—',icon:Layers},
    {key:'forms',value:number(data?.forms),caption:t('dashboard.uniqueForms'),icon:Database},
    {key:'lemmas',value:number(data?.lemmas),caption:t('dashboard.currentDatabase'),icon:BookOpen},
    {key:'bytes',value:data?`${new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(data.bytes/1_000_000)} MB`:'—',caption:t('dashboard.onDisk'),icon:Database},
  ];
  const periodLabel=data?`${dayLabel(data.start,locale)} – ${dayLabel(data.end,locale)}`:'';
  return <main className="dashboard-page" aria-busy={loading}>
    <header className="dashboard-heading"><div><h1>{t('design.overview')}</h1><p>{t('dashboard.subtitle')}</p></div>
      <div className="dashboard-period"><CalendarDays size={22} aria-hidden="true"/><label className="sr-only" htmlFor="dashboard-period">{t('dashboard.period')}</label>
        <div className="dashboard-period-picker"><Select id="dashboard-period" value={String(days)}
          options={[7,30,90].map(value=>({value:String(value),label:t('dashboard.lastDays',{count:value})}))}
          onValueChange={value=>{setData(null);setDays(Number(value));}} /></div>
        {periodLabel&&<span>{periodLabel}</span>}<button aria-label={t('dashboard.refresh')} title={t('dashboard.refresh')} onClick={()=>setReload(x=>x+1)} disabled={loading}><RefreshCw size={18} aria-hidden="true"/></button>
      </div>
    </header>
    <section className="dashboard-model" aria-label={t('home.modelSelection')}><strong>{t('dashboard.languageModel')}</strong><ModelSelector compact/></section>
    {error&&<div role="alert" className="dashboard-error"><span>{t('dashboard.loadError')}</span><Button variant="secondary" onClick={()=>setReload(x=>x+1)}>{t('home.activity.retry')}</Button></div>}
    <div className="dashboard-kpis">{stats.map(({key,value,caption,icon:Icon})=><section className="dashboard-kpi" key={key}><span className="dashboard-kpi-icon"><Icon size={32} strokeWidth={1.65} aria-hidden="true"/></span><div><h2>{t(`dashboard.${key==='forms'?'storedForms':key==='lemmas'?'uniqueLemmas':key}`)}</h2><strong>{value}</strong><p>{caption}</p></div></section>)}</div>
    {loading&&!data&&<p role="status" className="dashboard-loading">{t('dashboard.loading')}</p>}
    {data&&<>
      <div className="dashboard-charts">
        <section className="dashboard-panel"><header><div><h2>{t('dashboard.activityChart')}</h2><p>{t('dashboard.daily')}</p></div><div className="chart-legend"><span><i className="chart-analyzer"/>{t('home.analyzer.title')}</span><span><i className="chart-wizard"/>{t('dashboard.wizard')}</span>{data.daily.some(row=>row.legacy>0)&&<span><i className="chart-legacy"/>{t('dashboard.legacy')}</span>}</div></header>
          {data.runs>0?<ActivityChart data={data}/>:<p className="dashboard-empty">{t('dashboard.noRuns')}</p>}
        </section>
        <section className="dashboard-panel"><header><h2>{t('dashboard.historyChart')}</h2><div className="dashboard-segments" role="group" aria-label={t('dashboard.historyMetric')}>{(['lemmas','forms','bytes'] as const).map(key=><button key={key} aria-pressed={metric===key} onClick={()=>setMetric(key)}>{t(`dashboard.${key==='bytes'?'size':key}`)}</button>)}</div></header><HistoryChart history={data.history} metric={metric} start={data.start} end={data.end}/></section>
      </div>
      <div className="dashboard-bottom">
        <section className="dashboard-panel dashboard-frequent"><header><h2>{t('dashboard.frequent')}</h2><div className="dashboard-segments" role="group" aria-label={t('dashboard.termKind')}>{(['lemmas','forms'] as const).map(key=><button key={key} aria-pressed={termKind===key} onClick={()=>setTermKind(key)}>{t(`dashboard.${key}`)}</button>)}</div></header>
          {terms.length>0?<ol className="frequency-bars">{terms.map(term=><li key={term.term}><span title={term.term}>{term.term}</span><div className="frequency-track"><i style={{width:`${term.count/terms[0].count*100}%`}}/></div><strong>{number(term.count)}</strong></li>)}</ol>:<p className="dashboard-empty">{t('dashboard.noTerms')}</p>}
        </section>
        <section className="dashboard-panel dashboard-recent"><header><h2>{t('home.recent_activity')}</h2><Link to="/database">{t('dashboard.viewAll')} <ArrowRight size={18} aria-hidden="true"/></Link></header>
          {data.recent.length?<div className="dashboard-table-scroll"><table><caption className="sr-only">{t('home.recent_activity')}</caption><thead><tr>{['operation','model','words','status','date'].map(key=><th scope="col" key={key}>{key==='words'?t('dashboard.wordColumn'):t(`home.table.${key}`)}</th>)}</tr></thead><tbody>{data.recent.map(row=><tr key={row.id}><td>{row.workflow==='wizard'?t('design.wordWizard'):t(`analyzer.operations.${row.operation}`)}</td><td><span title={row.model}>{row.model}</span></td><td>{number(row.words)}</td><td><Badge variant={row.status==='completed'?'success':row.status==='failed'?'error':'info'}>{row.status==='completed'&&<Check size={14} aria-hidden="true"/>}{t(`home.status.${row.status}`)}</Badge></td><td>{new Date(row.created_at.replace(' ','T')+(row.created_at.endsWith('Z')?'':'Z')).toLocaleString(locale,{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'})}</td></tr>)}</tbody></table></div>:<p className="dashboard-empty">{t('home.activity.empty')}</p>}
        </section>
      </div>
    </>}
    <footer className="dashboard-footnote">{t('dashboard.coverage')}{loading&&data&&<span role="status"> · {t('dashboard.refreshing')}</span>}</footer>
  </main>;
};
