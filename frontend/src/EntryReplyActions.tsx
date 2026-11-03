import {useState} from 'react';
import {Copy,Check,ThumbsUp,Search} from 'lucide-react';
import {t} from './i18n';
/** 回覆工具只操作目前訊息；不建立另一份草稿或確認來源。 */
export function EntryReplyActions({content,choices,disabled,query,report,more}:{content:string;choices?:'answered'|'clarify';disabled:boolean;query:()=>void;report:()=>void;more:()=>void}){
 const [copied,setCopied]=useState(false),[helpful,setHelpful]=useState(false),[failure,setFailure]=useState(false);
 async function copy(){try{await navigator.clipboard.writeText(content);setCopied(true);setFailure(false);}catch{setFailure(true);}}
 // 範例的多段長回覆使用完整閱讀區及「查看最新內容」，不附短答導引工具列。
 // 依 Markdown 結構呈現，不辨識工單或設備文字，也不影響原分類與查詢。
 if((content.match(/^#{1,6}\s+\S/gm)?.length??0)>1)return null;
 return <>{choices&&<div className="entry-reply-choices"><button disabled={disabled} onClick={query}><Search size={18}/>{t('查生產資料')}</button><button disabled={disabled} onClick={report}>{t('我要報工')}</button>{choices==='answered'&&<button disabled={disabled} onClick={more}>{t('其他作業')}</button>}</div>}<div className="entry-reply-actions"><button aria-label={t(copied?'已複製':'複製回覆')} onClick={()=>void copy()}>{copied?<Check size={18}/>:<Copy size={18}/>}</button><button aria-label={t('回覆有幫助')} aria-pressed={helpful} onClick={()=>setHelpful(v=>!v)}><ThumbsUp size={18}/></button></div>{failure&&<small role="status">{t('無法複製，請選取文字手動複製。')}</small>}</>;
}
