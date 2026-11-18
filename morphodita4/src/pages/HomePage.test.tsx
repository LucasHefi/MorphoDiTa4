import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { DashboardService, type DashboardData } from '../services/dashboard';
import { HomePage } from './HomePage';
vi.mock('../services/dashboard',()=>({DashboardService:{get:vi.fn()}}));
vi.mock('../components/analyzer/ModelSelector',()=>({ModelSelector:()=>null}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key,i18n:{language:'cs'}})}));
const fixture:DashboardData={start:'2026-11-01',end:'2026-11-30',words:12,runs:2,forms:3,lemmas:2,bytes:12000,daily:[{day:'2026-11-18',analyzer:8,wizard:4,legacy:0,runs:2}],history:[{day:'2026-11-18',forms:3,lemmas:2,bytes:12000}],frequent_forms:[{term:'kočky',count:3}],frequent_lemmas:[{term:'kočka',count:3}],recent:[{id:1,operation:'analyze',model:'czech-250909',words:12,status:'completed',created_at:'2026-11-18 12:00:00'}]};
describe('statistics overview',()=>{
 let container:HTMLDivElement,root:Root;
 beforeEach(()=>{vi.clearAllMocks();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
 afterEach(async()=>{await act(()=>root.unmount());container.remove();});
 const render=()=>act(async()=>{root.render(<MemoryRouter><HomePage/></MemoryRouter>);await new Promise(r=>setTimeout(r,0));});
 it('shows loading placeholders rather than fake zero statistics',async()=>{
  vi.mocked(DashboardService.get).mockReturnValue(new Promise(()=>{}));await render();
  expect(container.querySelector('[role=status]')?.textContent).toBe('dashboard.loading');expect(container.querySelector('.dashboard-kpi strong')?.textContent).toBe('—');
 });
 it('shows real statistics and accessible charts, retains database navigation and removes the two launchers',async()=>{
  vi.mocked(DashboardService.get).mockResolvedValue(fixture);await render();
  expect(container.querySelector('.dashboard-kpi strong')?.textContent).toBe('12');
  expect(container.querySelectorAll('svg[role=img]')).toHaveLength(2);
  expect(container.querySelector('a[href="/database"]')).not.toBeNull();
  expect(container.querySelector('a[href="/analyzer"],a[href="/wizard"]')).toBeNull();
  const history=container.querySelector('[aria-label="dashboard.historyMetric"]')!;
  await act(()=>[...history.querySelectorAll('button')].find(e=>e.textContent==='dashboard.forms')!.click());
  expect(history.querySelector('[aria-pressed=true]')?.textContent).toBe('dashboard.forms');
  const terms=container.querySelector('[aria-label="dashboard.termKind"]')!;
  await act(()=>[...terms.querySelectorAll('button')].find(e=>e.textContent==='dashboard.forms')!.click());
  expect(container.querySelector('.frequency-bars')?.textContent).toContain('kočky');
 });
 it('offers a real retry after a failed load',async()=>{
  vi.mocked(DashboardService.get).mockRejectedValueOnce(Error('private detail')).mockResolvedValue(fixture);await render();
  expect(container.querySelector('[role=alert]')?.textContent).toContain('dashboard.loadError');expect(container.textContent).not.toContain('private detail');
  await act(async()=>{container.querySelector<HTMLButtonElement>('[role=alert] button')!.click();await new Promise(r=>setTimeout(r,0));});
  expect(container.querySelector('[role=alert]')).toBeNull();expect(container.querySelector('.dashboard-kpi strong')?.textContent).toBe('12');
 });
 it('ignores an old response after switching the period',async()=>{
  let finish!:(data:DashboardData)=>void;
  vi.mocked(DashboardService.get).mockReturnValueOnce(new Promise(r=>finish=r)).mockResolvedValue({...fixture,words:7});await render();
  await act(()=>container.querySelector<HTMLButtonElement>('#dashboard-period')!.click());
  await act(async()=>{document.querySelector<HTMLElement>('[role=option][id$="-7"]')!.click();await new Promise(r=>setTimeout(r,0));});
  await act(()=>finish(fixture));expect(container.querySelector('.dashboard-kpi strong')?.textContent).toBe('7');expect(DashboardService.get).toHaveBeenLastCalledWith(7);
 });
 it('renders empty histories and rankings without fabricated bars',async()=>{
  vi.mocked(DashboardService.get).mockResolvedValue({...fixture,words:0,runs:0,forms:0,lemmas:0,daily:[],history:[],frequent_forms:[],frequent_lemmas:[],recent:[]});await render();
  expect(container.querySelector('.dashboard-kpi strong')?.textContent).toBe('0');expect(container.textContent).toContain('dashboard.noRuns');expect(container.textContent).toContain('dashboard.noTerms');expect(container.querySelector('.chart-line')).toBeNull();
 });
});
