import {forwardRef,type ComponentProps} from 'react';
import {ThreadListPrimitive} from '@assistant-ui/react';
import {SquarePen,Search} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Skeleton} from '@/components/ui/skeleton';
import {t} from '@/i18n';
/** 294bc02d 的共用清單元件；搜尋與分頁交回 MES 既有 API。 */
export function ThreadListNew(props:ComponentProps<typeof Button>){
  return <ThreadListPrimitive.New asChild><Button type="button" variant="ghost" data-slot="aui_thread-list-new" className="h-[42px] w-full justify-start gap-[10px] rounded-[9px] px-[12px] has-[>svg]:px-[12px] py-0 text-[14px] leading-[21px] font-medium hover:bg-[var(--history-hover)] dark:hover:bg-[var(--history-hover)] hover:text-inherit" {...props}><SquarePen className="size-[18px]"/><span>{t('新聊天')}</span></Button></ThreadListPrimitive.New>;
}
export const ThreadListSearch=forwardRef<HTMLInputElement,ComponentProps<typeof Input>>((props,ref)=><div data-slot="aui_thread-list-search" className="history-search-field"><Search size={18}/><Input ref={ref} type="search" className="h-[39px] rounded-[9px] border-[var(--history-line)] bg-[var(--background)] py-[8px] pr-[40px] pl-[36px] text-[14px] md:text-[14px] leading-[22px] shadow-none dark:bg-[var(--background)]" {...props}/></div>);
export function ThreadListSkeleton(){return <div className="flex flex-col gap-0.5" role="status" aria-label={t('正在讀取資料…')}>{Array.from({length:5},(_,i)=><div key={i} className="flex h-8 items-center px-2.5"><Skeleton className="h-3.5 w-full"/></div>)}</div>;}
