import {useRef} from 'react';
import {MoreHorizontal,Settings2,Bot,Gauge,CalendarClock,Sun,Moon,Palette,Factory,Monitor} from 'lucide-react';
import {t,type Locale} from './i18n';
import {type Theme} from './theme';
import {type ManagementSection} from './ManagementPanel';
import {TooltipIconButton} from './components/assistant-ui/elements/tooltip-icon-button';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuRadioGroup,DropdownMenuRadioItem,DropdownMenuSeparator} from './components/ui/dropdown-menu';
/** 來源 AssistantMoreMenu；三語、MES 主題及既有受限管理為明列適配。 */
export function HeaderMenu({signedIn,locale,theme,localeBusy,onLocale,onTheme,onManage,onUsage,onMinimize}:{
 signedIn:boolean;locale:Locale;theme:Theme;localeBusy:boolean;onLocale:(value:Locale)=>void;onTheme:(value:Theme)=>void;
 onManage:(section:ManagementSection,trigger:HTMLButtonElement)=>void;onUsage:()=>void;onMinimize:()=>void;
}) {
 const trigger=useRef<HTMLButtonElement>(null);
 const sections=[['api','API 設定',Settings2],['agent','Agent API 設定',Bot],['budget','用量額度',Gauge],['reports','排程報告',CalendarClock]] as const;
 const themes=[['light','明亮模式',Sun],['dark','黑暗模式',Moon],['navy','深藍模式',Palette],['mes','MES 藍色',Factory],['system','跟隨系統',Monitor]] as const;
 return <DropdownMenu modal={false}>
  <DropdownMenuTrigger asChild><TooltipIconButton ref={trigger} tooltip={t('更多功能')} aria-label={t('更多功能')} className="size-7 rounded-md p-0 text-muted-foreground hover:text-foreground"><MoreHorizontal className="size-3.5"/></TooltipIconButton></DropdownMenuTrigger>
  <DropdownMenuContent align="end">
   {sections.map(([key,title,Icon])=><DropdownMenuItem key={key} disabled={!signedIn} onSelect={()=>trigger.current&&onManage(key,trigger.current)}><Icon/>{t(title)}</DropdownMenuItem>)}
   <DropdownMenuSeparator/><DropdownMenuLabel>{t('介面外觀')}</DropdownMenuLabel>
   <DropdownMenuRadioGroup aria-label={t('主題')} value={theme} onValueChange={v=>onTheme(v as Theme)}>{themes.map(([value,title,Icon])=><DropdownMenuRadioItem key={value} value={value}><Icon/>{t(title)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>
   <DropdownMenuSeparator/><DropdownMenuLabel>{t('語言')}</DropdownMenuLabel>
   <DropdownMenuRadioGroup aria-label={t('語言')} value={locale} onValueChange={v=>onLocale(v as Locale)}>{[['zh-TW','繁體中文'],['en','English'],['th','ไทย']].map(([value,title])=><DropdownMenuRadioItem key={value} value={value} disabled={localeBusy}>{title}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>
   <DropdownMenuSeparator/><DropdownMenuItem disabled={!signedIn} onSelect={onUsage}>{t('使用統計')}</DropdownMenuItem><DropdownMenuItem onSelect={onMinimize}>{t('收合聊天室')}</DropdownMenuItem>
  </DropdownMenuContent>
 </DropdownMenu>;
}
