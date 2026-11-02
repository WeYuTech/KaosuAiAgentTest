import {OperationDialog} from './OperationDialog';
import {useTheme} from './theme';
import {t,type Locale} from './i18n';
import {SettingSelect} from './SettingSelect';
import {OperationActions} from './OperationDialog';
import {useLocale} from './i18n';
import type {OperationMode} from './operation-mode';
export function InterfaceSettings({mode,choose,deferred,close,returnFocus,onLocale,localeBusy=false}:{onLocale?:(locale:Locale)=>void;localeBusy?:boolean;mode:OperationMode;choose:(mode:OperationMode)=>void;deferred:boolean;close:()=>void;returnFocus:()=>HTMLElement|null}){
  const {locale,setLocale}=useLocale();const {theme,setTheme}=useTheme();const L=(zh:string,en:string,th:string)=>locale==='en'?en:locale==='th'?th:zh;
  return <OperationDialog title={L('介面設定','Interface settings','การตั้งค่าอินเทอร์เฟซ')} close={close} returnFocus={returnFocus} className="interface-settings">
    <fieldset><legend>{L('操作方式','Operation style','รูปแบบการทำงาน')}</legend>
      {([
        ['chat-sheet',L('聊天＋作業單','Chat + operation sheet','แชทและใบงาน'),L('聊天時在旁邊完成作業。','Complete the operation alongside your chat.','ทำงานข้างหน้าต่างแชท')],
        ['step-wizard',L('分步作業精靈','Step-by-step wizard','ตัวช่วยทีละขั้นตอน'),L('依步驟選擇、填寫與核對。','Choose, fill in and review step by step.','เลือก กรอก และตรวจสอบทีละขั้นตอน')],
      ] as const).map(([value,title,description])=><label key={value} className="operation-mode-option"><input type="radio" name="operation-mode" value={value} checked={mode===value} onChange={()=>choose(value)}/><span><strong>{title}</strong><small>{description}</small></span></label>)}
    </fieldset>
    <label className="settings-row">{t('介面外觀')}<SettingSelect label={t('主題')} value={theme} onChange={value=>setTheme(value as typeof theme)} options={(['light','dark','navy','mes','system'] as const).map((value,i)=>({value,label:t(['明亮模式','黑暗模式','深藍模式','MES 藍色','跟隨系統'][i])}))}/></label><label className="settings-row">{t('語言')}<SettingSelect label={t('語言')} value={locale} disabled={localeBusy} onChange={value=>(onLocale??setLocale)(value as Locale)} options={[{value:'zh-TW',label:'繁體中文'},{value:'en',label:'English'},{value:'th',label:'ไทย'}]}/></label>
    {deferred&&<p role="status">{L('目前作業完成後套用','Will apply when processing finishes','จะใช้เมื่อดำเนินการเสร็จ')}</p>}
    <OperationActions><button className="primary" onClick={close}>{t('完成')}</button></OperationActions>
  </OperationDialog>;
}
