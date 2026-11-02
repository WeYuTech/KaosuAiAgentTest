import {X} from 'lucide-react';
import {t} from './i18n';
import {useRef,type ReactNode} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './components/ui/dialog';
/** 來源共用 Dialog：Portal、焦點圍欄、Esc 與返回焦點交由 Radix。 */
export function OperationDialog({title,description,children,footer,close,locked=false,className='',onEscape,open=true,returnFocus}:{
  open?:boolean;returnFocus?:()=>HTMLElement|null;title:string;description?:string;children:ReactNode;footer?:ReactNode;close:()=>void;locked?:boolean;className?:string;onEscape?:()=>void;
}) {
  const trigger=useRef<HTMLElement|null>(null);
  return <Dialog open={open} onOpenChange={value=>{if(!value&&!locked)close();}}>
    <DialogContent layout="operation" showCloseButton={false} inert={!open?true:undefined} aria-hidden={!open?true:undefined}
      onOpenAutoFocus={()=>{trigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;}}
      onCloseAutoFocus={event=>{event.preventDefault();if(document.querySelector('[data-slot="dialog-content"][data-state="open"]'))return;const target=returnFocus?.()??trigger.current;if(target?.isConnected)target.focus({preventScroll:true});}}
      className={`mes-operation-dialog ${className}`} {...(!description?{'aria-describedby':undefined}:{})}
      onInteractOutside={event=>event.preventDefault()}
      onEscapeKeyDown={event=>{event.stopPropagation();if(event.isComposing||event.keyCode===229){event.preventDefault();return;}if(locked||onEscape){event.preventDefault();if(!locked)onEscape?.();}}}>
      <header className="operation-dialog-header"><DialogTitle>{title}</DialogTitle><button type="button" className="icon-button" aria-label={t('關閉')} disabled={locked} onClick={close}><X size={18}/></button></header>
      {description&&<DialogDescription className="operation-dialog-description">{description}</DialogDescription>}
      <div className="operation-dialog-body">{children}</div>
      {footer&&<div className="operation-dialog-footer">{footer}</div>}
    </DialogContent>
  </Dialog>;
}

export function OperationActions({children}:{children:ReactNode}){return <div className="operation-dialog-actions">{children}</div>;}
