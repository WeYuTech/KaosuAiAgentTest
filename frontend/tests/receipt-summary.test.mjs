import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportReceiptQuantities} from '../src/receipt-summary.ts';
const changes=[{table:'隔離資料',key:'同一筆',field:'OK_QTY',before:null,after:125},{table:'隔離資料',key:'同一筆',field:'NG_QTY',before:null,after:3}];
test('完成回執只顯示同一筆已證明數量，不推算缺欄位、跨主鍵或多列',()=>{
 assert.deepEqual(reportReceiptQuantities('report.add',changes),{good:125,defects:3});
 for(const rows of [[],changes.slice(0,1),[...changes,changes[0]],[changes[0],{...changes[1],key:'別筆'}],[changes[0],{...changes[1],after:null}],[changes[0],{...changes[1],after:-1}]])assert.equal(reportReceiptQuantities('report.add',rows),null);
 assert.equal(reportReceiptQuantities('report.delete',changes),null);
});
