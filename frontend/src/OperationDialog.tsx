import type {ReactNode} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './components/ui/dialog';
/** 來源共用 Dialog：Portal、焦點圍欄、Esc 與返回焦點交由 Radix。 */
export function OperationDialog({title,description,children,close,locked=false,className='',onEscape}:{
  title:string;description?:string;children:ReactNode;close:()=>void;locked?:boolean;className?:string;onEscape?:()=>void;
}) {
  return <Dialog open onOpenChange={value=>{if(!value&&!locked)close();}}>
    <DialogContent showCloseButton={false} className={`mes-operation-dialog ${className}`} {...(!description?{'aria-describedby':undefined}:{})}
      onInteractOutside={event=>event.preventDefault()}
      onEscapeKeyDown={event=>{event.stopPropagation();if(locked||onEscape){event.preventDefault();if(!locked)onEscape?.();}}}>
      <DialogTitle className="sr-only">{title}</DialogTitle>
      {description&&<DialogDescription className="sr-only">{description}</DialogDescription>}
      {children}
    </DialogContent>
  </Dialog>;
}
