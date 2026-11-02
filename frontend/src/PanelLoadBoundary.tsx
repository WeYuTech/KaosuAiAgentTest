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
    return <OperationDialog open={this.props.open} title={t('管理介面載入失敗')} close={this.props.close}>
      <p role="alert">{t('原作業已保留，請重試載入此面板。')}</p><Button onClick={this.props.retry}>{t("重試載入")}</Button>
    </OperationDialog>;
  }
}
