import {StatusNotice} from './OperationStatus';
import {Component,type ReactNode} from 'react';
import {OperationDialog} from './OperationDialog';
import {Button} from './components/ui/button';
import {t} from './i18n';

/** 更新後舊分頁可能缺少延遲載入檔案；只隔離管理面板，不清除 MES 作業。 */
export class PanelLoadBoundary extends Component<{open?:boolean;children:ReactNode;close:()=>void;retry:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(!this.state.failed)return this.props.children;
    return <OperationDialog className="status-dialog" open={this.props.open} title={t('載入功能')} close={this.props.close} footer={<><Button onClick={this.props.close}>{t('關閉')}</Button><Button className="primary" onClick={this.props.retry}>{t('重試')}</Button></>}>
      <StatusNotice tone="error" title={t('暫時無法載入')} description={t('關閉此視窗不會影響目前作業。')}/>
    </OperationDialog>;
  }
}
