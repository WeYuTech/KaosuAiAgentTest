import {OperationDialog} from './OperationDialog';
import {useLocale} from './i18n';
import type {OperationMode} from './operation-mode';
export function InterfaceSettings({mode,choose,deferred,close,returnFocus}:{mode:OperationMode;choose:(mode:OperationMode)=>void;deferred:boolean;close:()=>void;returnFocus:()=>HTMLElement|null}){
  const {locale}=useLocale();const L=(zh:string,en:string,th:string)=>locale==='en'?en:locale==='th'?th:zh;
  return <OperationDialog title={L('介面設定','Interface settings','การตั้งค่าอินเทอร์เฟซ')} close={close} returnFocus={returnFocus} className="interface-settings">
    <fieldset><legend>{L('操作方式','Operation style','รูปแบบการทำงาน')}</legend>
      {([
        ['chat-sheet',L('聊天＋作業單','Chat + operation sheet','แชทและใบงาน'),L('聊天時在旁邊完成作業。','Complete the operation alongside your chat.','ทำงานข้างหน้าต่างแชท')],
        ['step-wizard',L('分步作業精靈','Step-by-step wizard','ตัวช่วยทีละขั้นตอน'),L('依步驟選擇、填寫與核對。','Choose, fill in and review step by step.','เลือก กรอก และตรวจสอบทีละขั้นตอน')],
      ] as const).map(([value,title,description])=><label key={value} className="operation-mode-option"><input type="radio" name="operation-mode" value={value} checked={mode===value} onChange={()=>choose(value)}/><span><strong>{title}</strong><small>{description}</small></span></label>)}
    </fieldset>
    {deferred&&<p role="status">{L('處理完成後套用','Will apply when processing finishes','จะใช้เมื่อดำเนินการเสร็จ')}</p>}
  </OperationDialog>;
}
