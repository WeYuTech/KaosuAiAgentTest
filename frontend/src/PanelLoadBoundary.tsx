import {Component,type ReactNode} from 'react';
import {OperationDialog} from './OperationDialog';
import {Button} from './components/ui/button';
import {t} from './i18n';

/** 更新後舊分頁可能缺少延遲載入檔案；只隔離管理面板，不清除 MES 作業。 */
export class PanelLoadBoundary extends Component<{open?:boolean;children:ReactNode;close:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(!this.state.failed)return this.props.children;
    return <OperationDialog open={this.props.open} title={t('管理介面載入失敗')} close={this.props.close}>
      <p role="alert">{t('原作業已保留。先關閉視窗；完成或取消作業後，再重新整理。')}</p>
    </OperationDialog>;
  }
}
