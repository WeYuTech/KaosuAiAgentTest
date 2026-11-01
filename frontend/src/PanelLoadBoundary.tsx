import {Component,type ReactNode} from 'react';
import {OperationDialog} from './OperationDialog';
import {Button} from './components/ui/button';
import {t} from './i18n';

/** 更新後舊分頁可能缺少延遲載入檔案；只隔離管理面板，不清除 MES 作業。 */
export class PanelLoadBoundary extends Component<{children:ReactNode;close:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(!this.state.failed)return this.props.children;
    return <OperationDialog title={t('管理介面載入失敗')} close={this.props.close}>
      <p role="alert">{t('管理介面載入失敗。原作業已保留，請關閉此視窗；完成或取消目前作業後，再重新整理頁面。')}</p>
      <Button onClick={this.props.close}>{t('關閉')}</Button>
    </OperationDialog>;
  }
}
