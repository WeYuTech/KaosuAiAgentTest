import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from './components/ui/select';
/** 來源 Select：管理值仍由原表單持有，鍵盤與浮層採共用元件。 */
export function SettingSelect({label,value,options,disabled,onChange}:{label:string;value:string;options:{value:string;label:string}[];disabled?:boolean;onChange:(value:string)=>void}){
 return <Select value={value} disabled={disabled} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>;
}
