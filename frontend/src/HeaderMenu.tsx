import {useEffect,useRef} from 'react';
import {MoreHorizontal,Settings2,Bot,Gauge,CalendarClock,Sun,Moon,Palette,Factory,Monitor,ChartNoAxesCombined,X} from 'lucide-react';
import {t,type Locale} from './i18n';
import {type Theme} from './theme';
import {type ManagementSection} from './ManagementPanel';

/** 原版分組選單；只投影偏好，不擁有聊天或作業草稿。 */
export function HeaderMenu({signedIn,locale,theme,localeBusy,onLocale,onTheme,onManage,onUsage,onMinimize}:{
 signedIn:boolean;locale:Locale;theme:Theme;localeBusy:boolean;onLocale:(value:Locale)=>void;onTheme:(value:Theme)=>void;
 onManage:(section:ManagementSection,trigger:HTMLButtonElement)=>void;onUsage:()=>void;onMinimize:()=>void;
}) {
 const ref=useRef<HTMLDetailsElement>(null);
 const close=()=>{ref.current?.removeAttribute('open');ref.current?.querySelector('summary')?.focus();};
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(e.target instanceof Node&&!ref.current?.contains(e.target))ref.current?.removeAttribute('open');};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
 const sections=[['api','API 設定',Settings2],['agent','Agent API 設定',Bot],['budget','用量額度',Gauge],['reports','排程報告',CalendarClock]] as const;
 const themes=[['light','明亮模式',Sun],['dark','黑暗模式',Moon],['navy','深藍模式',Palette],['mes','MES 藍色',Factory],['system','跟隨系統',Monitor]] as const;
 return <details ref={ref} className="header-preferences" onKeyDown={e=>{
  if(e.key==='Escape'&&ref.current?.open){e.preventDefault();e.stopPropagation();close();}
  if(e.target instanceof HTMLSelectElement)return;
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();if(ref.current)ref.current.open=true;const items=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)')||[]);const i=items.indexOf(document.activeElement as HTMLElement);const next=e.key==='Home'?0:e.key==='End'?items.length-1:e.key==='ArrowDown'?(i+1)%items.length:i<0?items.length-1:(i-1+items.length)%items.length;items[next]?.focus();}
 }}><summary aria-label={t('更多功能')}><MoreHorizontal size={18}/><span className="sr-only">{t('設定')}</span></summary>
 <div className="preferences-menu" role="menu" aria-label={t('更多功能')}>
 {sections.map(([key,title,Icon])=><button role="menuitem" key={key} disabled={!signedIn} onClick={e=>{onManage(key,e.currentTarget);ref.current?.removeAttribute('open');}}><Icon size={18}/>{t(title)}</button>)}
 <hr/><p className="preferences-caption">{t('介面外觀')}</p>
 <div role="group" aria-label={t('主題')}>{themes.map(([value,title,Icon])=><button key={value} role="menuitemradio" aria-checked={theme===value} className="theme-choice" onClick={()=>{onTheme(value);close();}}><span className="theme-check" aria-hidden="true">{theme===value?'•':''}</span><Icon size={18}/>{t(title)}</button>)}</div>
 <hr/><label className="preferences-language">{t('語言')}<select aria-label={t('語言')} value={locale} disabled={localeBusy} onChange={e=>onLocale(e.target.value as Locale)}><option value="zh-TW">繁體中文</option><option value="en">English</option><option value="th">ไทย</option></select></label>
 <hr/><button role="menuitem" disabled={!signedIn} onClick={()=>{close();onUsage();}}><ChartNoAxesCombined size={18}/>{t('使用統計')}</button><button role="menuitem" onClick={()=>{close();onMinimize();}}><X size={18}/>{t('收合聊天室')}</button>
 </div></details>;
}
