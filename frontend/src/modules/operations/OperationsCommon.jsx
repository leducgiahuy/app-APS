import { useCallback,useEffect,useLayoutEffect,useRef,useState } from 'react';
import { deliveryApi } from '../gantt/deliveryApi';
import { OP_ROLE_NAMES } from '../../utils/operationsDefaults';
import DeliveryResourceEditor from '../gantt/DeliveryResourceEditor';
import './OperationsPage.css';
import '../gantt/DeliveryPage.css';
export const num=value=>value==null?'—':Number(value).toLocaleString('vi-VN',{maximumFractionDigits:1});
export const vnd=value=>value==null?'—':`${Number(value).toLocaleString('vi-VN')} đ`;
export const million=value=>value==null?'—':num(value/1e6);
export const dateLabel=value=>value?new Date(value.length===10?`${value}T12:00:00+07:00`:value).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
export const stateLabel={draft:'Nháp',submitted:'Đã nộp',pending:'Chờ duyệt',approved:'Đã duyệt',returned:'Trả lại',rejected:'Từ chối',paid:'Đã chi',sent:'Đã gửi CĐT',settled:'Đã hoàn ứng'};
export const numberField=(key,label,other={})=>({key,label,type:'number',min:0,step:'any',...other});
export function useOperations(query) {
 const key=JSON.stringify(query),[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[editor,setEditor]=useState(null);
 const ref=useRef(null),sequence=useRef(0),busy=useRef(false),[previewUsers,setPreviewUsers]=useState([]),[mutationVersion,setMutationVersion]=useState(0);
 useLayoutEffect(()=>{ref.current=data;},[data]);
 const load=useCallback(async(quiet=false)=>{const n=++sequence.current;if(!quiet)setLoading(true);try{const response=await deliveryApi.operations(JSON.parse(key));if(n===sequence.current){setData(response.data);setError('');if(response.data.previewUsers?.length)setPreviewUsers(response.data.previewUsers);}}catch(err){if(n===sequence.current)setError(err.message);}finally{if(n===sequence.current)setLoading(false);}},[key]);
 useEffect(()=>{load();const refresh=()=>{if(!busy.current)load(true);},timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{sequence.current++;clearInterval(timer);window.removeEventListener('focus',refresh);};},[load]);
 const mutate=async(action,value={},id,projectId=query.projectId)=>{
  if(busy.current)throw new Error('Đang lưu thao tác trước.');if(data?.readOnly)throw new Error('Đang xem thử: chỉ đọc.');busy.current=true;setSaving(true);sequence.current++;
  try{const response=await deliveryApi.mutateOperations({revision:ref.current.revision,action,value,id,projectId,query});ref.current=response.data;setData(response.data);setMutationVersion(n=>n+1);setError('');return response.data;}
  catch(err){if(err.status===409)await load(true);throw err;}finally{busy.current=false;setSaving(false);}
 };
 const run=async action=>{try{await action();}catch(err){setError(err.message);}};
 const open=(title,fields,value,save)=>setEditor({title,fields,value,save});
 const modal=editor&&<DeliveryResourceEditor key={`${editor.title}:${editor.value?.id||''}`} title={editor.title} fields={editor.fields} value={editor.value||{}} onSave={editor.save} onClose={()=>setEditor(null)} saving={saving}/>;
 return {data,mutationVersion,error,loading,saving,mutate,load,run,open,modal,previewUsers,disabled:saving||loading||Boolean(data?.readOnly)};
}
export function OperationsFrame({api,query,setQuery,children,project=true,guide}) {
 const [showGuide,setShowGuide]=useState(false);
 return <div className="operations-page"><div className="operations-topbar">{project&&<select aria-label="Dự án" value={query.projectId||''} onChange={e=>setQuery({...query,projectId:e.target.value})}><option value="">Chọn dự án</option>{api.data?.projects.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>}<div className="operations-view-options">{api.data?.viewer&&<span className="operations-role">{api.data.viewer.name||api.data.viewer.email} · {OP_ROLE_NAMES[api.data.viewer.role]}</span>}{api.previewUsers.length>0&&<label>Xem thử vai trò <select value={query.asUser||''} onChange={e=>setQuery({...query,asUser:e.target.value})}><option value="">Vai trò đăng nhập</option>{api.previewUsers.map(row=><option value={row.email} key={row.email}>{row.name||row.email} · {OP_ROLE_NAMES[row.role]}</option>)}</select></label>}<label><input type="checkbox" checked={showGuide} onChange={e=>setShowGuide(e.target.checked)}/> Hiện cách tính</label><button onClick={()=>api.load()} disabled={api.loading}>Tải lại</button></div></div>{api.data?.readOnly&&<p className="operations-notice">Đang xem thử · chỉ đọc</p>}{api.error&&<p className="operations-error" role="alert">{api.error}</p>}{api.loading&&!api.data&&<p role="status" className="operations-empty">Đang tải dữ liệu…</p>}{showGuide&&<div className="operations-guide">{guide}</div>}{api.data&&children}{api.modal}</div>;
}
export function Tabs({items,value,onChange}){return <nav className="operations-tabs">{items.map(([key,label])=><button key={key} className={value===key?'active':''} onClick={()=>onChange(key)}>{label}</button>)}</nav>;}
export function Card({title,subtitle,actions,children,footer}){return <section className="operations-card"><header><h2>{title}</h2>{subtitle&&<span>{subtitle}</span>}<div>{actions}</div></header>{children}{footer&&<footer>{footer}</footer>}</section>;}
const numericColumn=/^(ngân sách|thực tế|đã cam kết|còn lại|%|tỷ lệ|giá trị|doanh thu|chi phí|lãi gộp|số tiền|đã thu|đã dùng|còn nợ|thu dự kiến|chi dự kiến|ròng|cuối kỳ|năng suất mục tiêu|kế hoạch thu|nộp đúng hạn|sản lượng|giờ(?:\s|\/|$)|chênh|số ca|số việc|tải kỳ)/i;
const centeredColumn=/^(#|nhóm|đợt|ngày|bắt đầu|kết thúc|hiệu lực|làm thêm|trạng thái|kết quả|thao tác|luồng|leader xn|bằng chứng|ai thấy|kỳ \/ hạn)/i;
function columnAlignment(label){const text=String(label??'').trim();return numericColumn.test(text)?'right':centeredColumn.test(text)?'center':'left';}
export function Table({head,children,empty,className='',align=[]}){const style=Object.fromEntries(head.map((label,index)=>[`--op-column-${index+1}-align`,align[index]||columnAlignment(label)]));return <div className="operations-table-scroll"><table className={`operations-data-table ${className}`.trim()} style={style}><thead><tr>{head.map((label,index)=><th key={index}>{label}</th>)}</tr></thead><tbody>{children}</tbody></table>{empty&&<p className="operations-empty">Chưa có dữ liệu trong kỳ / dự án đang chọn.</p>}</div>;}
export function Pill({status,children}){return <span className={`operations-pill ${['approved','paid','sent','settled'].includes(status)?'success':['rejected','returned'].includes(status)?'danger':'warning'}`}>{children||stateLabel[status]||status}</span>;}
export function Flow({steps=[]}){return <div className="operations-flow">{steps.map((step,index)=><span key={index}><Pill status={step.status}>{step.status==='approved'?'✓ ':step.status==='pending'?'● ':''}{step.label} {step.by&&`· ${step.by}`}</Pill>{index<steps.length-1&&' › '}</span>)}</div>;}
export function Kpis({items}){return <div className="operations-kpis">{items.map(([label,value,detail,tone])=><article key={label} className={tone||''}><span>{label}</span><strong>{value}</strong>{detail&&<small>{detail}</small>}</article>)}</div>;}
export function Decision({api,action,row,projectId}){
 const step=row.steps?.find(step=>step.status==='pending'),role=api.data.viewer.role;
 if(row.createdBy===api.data.viewer.email||!step||row.status!=='pending'||!(role===step.role||['admin','director'].includes(role)))return null;
 return <div className="operations-buttons"><button disabled={api.disabled} onClick={()=>api.open('Xử lý duyệt',[{key:'status',label:'Quyết định',type:'select',options:[{value:'approved',label:'Duyệt / Xác nhận'},{value:'rejected',label:'Trả lại / Từ chối'}]},{key:'reason',label:'Lý do / ghi chú',type:'textarea'},{key:'documentRef',label:'Mã / đường dẫn chứng từ (nếu có)'}],{status:'approved'},value=>api.mutate(action,value,row.id,projectId))}>Xử lý</button></div>;
}
