import {forwardRef,type ComponentProps} from 'react';
import {ThreadListPrimitive} from '@assistant-ui/react';
import {Plus,Search} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Skeleton} from '@/components/ui/skeleton';
import {t} from '@/i18n';
/** 294bc02d 的共用清單元件；搜尋與分頁交回 MES 既有 API。 */
export function ThreadListNew(props:ComponentProps<typeof Button>){
  return <ThreadListPrimitive.New asChild><Button type="button" variant="ghost" data-slot="aui_thread-list-new" className="hover:bg-muted h-8 justify-start gap-2 rounded-md px-2.5 text-sm font-normal" {...props}><Plus className="size-4 shrink-0"/><span>{t('新聊天')}</span></Button></ThreadListPrimitive.New>;
}
export const ThreadListSearch=forwardRef<HTMLInputElement,ComponentProps<typeof Input>>((props,ref)=><div data-slot="aui_thread-list-search" className="relative px-0.5 py-1"><Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"/><Input ref={ref} type="search" className="h-8 ps-8 text-sm" {...props}/></div>);
export function ThreadListSkeleton(){return <div className="flex flex-col gap-0.5" role="status" aria-label={t('正在讀取資料…')}>{Array.from({length:5},(_,i)=><div key={i} className="flex h-8 items-center px-2.5"><Skeleton className="h-3.5 w-full"/></div>)}</div>;}
export function historyGroup(entry:{is_pinned:boolean;updated_at:string},now=Date.now()){
  if(entry.is_pinned)return '已釘選';
  const day=(value:number)=>new Date(value+7*3600000).toISOString().slice(0,10);
  const time=Date.parse(entry.updated_at);if(!Number.isFinite(time))return '更早';
  return day(time)===day(now)?'今天':day(time)===day(now-86400000)?'昨天':'更早';
}
