import { useState } from 'react';
import { FilePenLine, ArrowRight } from 'lucide-react';
import { display, label, type Row, type Schema } from './api';

export function DraftForm({ actions, busy, onSubmit }: { actions: Record<string, Schema>; busy: boolean; onSubmit: (action: string, args: Row) => Promise<void> }) {
  const [action, setAction] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const raw = actions[action];
  const schema = raw?.parameters ?? raw?.input_schema ?? raw;
  function choose(next: string) {
    setAction(next); setError('');
    const item = actions[next]; const fields = item?.parameters ?? item?.input_schema ?? item;
    setValues(Object.fromEntries(Object.entries(fields?.properties ?? {}).filter(([, s]) => s.default !== undefined).map(([key, s]) => [key, typeof s.default === 'object' ? JSON.stringify(s.default, null, 2) : String(s.default)])));
  }
  return <details className="draft"><summary><FilePenLine size={17}/><span>結構化操作草稿</span><small>依伺服器規格填寫</small></summary><div className="draft-body"><p className="muted">這是人工表單，適合核對欄位或測試流程。送出只建立預覽，確認後才寫入。</p>
    <form onSubmit={async e => {
      e.preventDefault(); setError('');
      try {
        const args: Row = {};
        for (const [key, spec] of Object.entries(schema?.properties ?? {})) {
          const value = values[key] ?? '';
          if (!value.trim()) { if (schema?.required?.includes(key)) throw new Error(`請填寫${spec.title ?? label(key)}`); continue; }
          const type = Array.isArray(spec.type) ? spec.type.find(t => t !== 'null') : spec.type;
          args[key] = type === 'array' || type === 'object' ? JSON.parse(value) : type === 'number' || type === 'integer' ? Number(value) : type === 'boolean' ? value === 'true' : value;
          if ((type === 'number' || type === 'integer') && !Number.isFinite(args[key])) throw new Error(`${label(key)}必須為有效數字`);
          if (type === 'integer' && !Number.isInteger(args[key])) throw new Error(`${label(key)}必須為整數`);
        }
        await onSubmit(action, args);
      } catch (e) { setError(e instanceof Error ? e.message : '草稿格式不正確'); }
    }}>
      <label className="form-field">操作類型<select required value={action} onChange={e => choose(e.target.value)} disabled={busy}><option value="">選擇要執行的功能</option>{Object.entries(actions).map(([key, s]) => <option key={key} value={key}>{s.title ?? s.description ?? key}</option>)}</select></label>
      {schema?.description && <p className="muted">{schema.description}</p>}
      {Object.entries(schema?.properties ?? {}).map(([key, spec]) => {
        const type = Array.isArray(spec.type) ? spec.type.find(t => t !== 'null') : spec.type;
        const complex = type === 'array' || type === 'object';
        const required = schema?.required?.includes(key);
        const control = { id: `draft-${key}`, value: values[key] ?? '', disabled: busy, required, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues(old => ({ ...old, [key]: e.target.value })) };
        return <label key={key} className="form-field" htmlFor={control.id}><span>{spec.title ?? label(key)}{required && <span className="required"> *</span>}</span>
          {spec.enum ? <select {...control}><option value="">請選擇</option>{spec.enum.map(item => <option key={display(item)} value={display(item)}>{display(item)}</option>)}</select> : type === 'boolean' ? <select {...control}><option value="">請選擇</option><option value="true">是</option><option value="false">否</option></select> : complex ? <textarea {...control} rows={5} spellCheck={false} placeholder={type === 'array' ? '[]' : '{}'}/> : <input {...control} type={type === 'integer' || type === 'number' ? 'number' : spec.format === 'date' ? 'date' : 'text'} min={spec.minimum} max={spec.maximum} step={type === 'integer' ? 1 : 'any'}/>}
          {spec.description && <small>{spec.description}</small>}{complex && <small>請填寫 JSON；欄位格式會由伺服器再次驗證。</small>}
        </label>;
      })}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy || !action} type="submit">建立確認草稿<ArrowRight size={17}/></button>
    </form></div></details>;
}
