import { randomUUID } from 'node:crypto';
import { readDb, writeDb } from '../models/db.js';
import { positionKey, RECRUITMENT_STAGES, buildWorkforceForecast } from '../../../frontend/src/utils/workforceForecast.js';

export const emptyWorkforcePlan = () => ({ demands: [], settings: [], recruitments: [], taskRoles: [] });
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const text = value => typeof value === 'string' ? value.trim() : '';

export function workforceMutation(existing, body) {
  const plan = structuredClone({ ...emptyWorkforcePlan(), ...existing });
  const { kind, data = {}, id } = body || {};
  if (!['demands', 'settings', 'recruitments', 'taskRoles'].includes(kind)) throw new Error('Loại dữ liệu kế hoạch không hợp lệ.');
  if (body.remove) {
    if (kind !== 'demands' || !text(id)) throw new Error('Chỉ có thể xóa nhu cầu bổ sung theo mã.');
    plan.demands = plan.demands.filter(item => item.id !== id);
    return plan;
  }
  const position = text(data.position);
  if (!position || position.length > 200) throw new Error('Vui lòng nhập vị trí (tối đa 200 ký tự).');
  let item;
  if (kind === 'demands') {
    if (!validDate(data.startDate) || !validDate(data.endDate) || data.endDate < data.startDate || Date.parse(data.endDate) - Date.parse(data.startDate) > 366 * 5 * 86400000) throw new Error('Chọn khoảng thời gian nhu cầu hợp lệ, tối đa 5 năm.');
    if (!Number.isFinite(Number(data.hours)) || Number(data.hours) <= 0 || Number(data.hours) > 10000000) throw new Error('Tổng giờ nhu cầu phải lớn hơn 0.');
    if (!Number.isFinite(Number(data.probability)) || Number(data.probability) < 0 || Number(data.probability) > 100) throw new Error('Xác suất phải từ 0 đến 100%.');
    if (id && !plan.demands.some(entry => entry.id === id)) throw new Error('Nhu cầu này đã bị xóa. Hãy tải lại.');
    item = { id: id || randomUUID(), position, projectId: text(data.projectId), projectName: text(data.projectName), startDate: data.startDate, endDate: data.endDate, hours: Number(data.hours), probability: Number(data.probability) };
  } else if (kind === 'settings') {
    if (!Number.isInteger(Number(data.leadDays)) || Number(data.leadDays) < 1 || Number(data.leadDays) > 730) throw new Error('Thời gian tuyển phải từ 1 đến 730 ngày.');
    item = { position, leadDays: Number(data.leadDays) };
  } else if (kind === 'recruitments') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.needMonth || '')) throw new Error('Tháng cần tuyển không hợp lệ.');
    if (!RECRUITMENT_STAGES.includes(data.status)) throw new Error('Trạng thái tuyển không hợp lệ.');
    if ((data.openedAt && !validDate(data.openedAt)) || (data.expectedStart && !validDate(data.expectedStart))) throw new Error('Ngày tuyển hoặc ngày nhận việc không hợp lệ.');
    if (RECRUITMENT_STAGES.indexOf(data.status) >= 2 && !data.openedAt) throw new Error('Vui lòng nhập ngày bắt đầu đăng tuyển.');
    if (data.status === 'Nhận việc' && !data.expectedStart) throw new Error('Vui lòng nhập ngày nhận việc.');
    if (data.expectedStart && data.openedAt && data.expectedStart < data.openedAt) throw new Error('Ngày nhận việc không được trước ngày đăng tuyển.');
    item = { position, needMonth: data.needMonth, status: data.status, openedAt: data.openedAt || '', expectedStart: data.expectedStart || '', temporary: text(data.temporary), notes: text(data.notes) };
  } else {
    if (!/^(gantt|task):.+/.test(text(data.taskKey))) throw new Error('Vui lòng chọn task cần gắn vị trí.');
    item = { taskKey: data.taskKey, position };
  }
  const match = entry => kind === 'demands' ? entry.id === item.id : kind === 'taskRoles' ? entry.taskKey === item.taskKey : positionKey(entry.position) === positionKey(position) && (kind !== 'recruitments' || entry.needMonth === item.needMonth);
  const index = plan[kind].findIndex(match);
  if (index < 0) plan[kind].push(item); else plan[kind][index] = item;
  return plan;
}

export function getWorkforcePlan(req, res) {
  return res.json({ success: true, data: { ...emptyWorkforcePlan(), ...readDb().workforcePlan } });
}
export function updateWorkforcePlan(req, res) {
  const db = readDb();
  try {
    const plan = workforceMutation(db.workforcePlan, req.body);
    if(req.body.kind==='recruitments'){
      const input=req.body.data,forecast=buildWorkforceForecast({...db,plan,now:new Date()}),row=forecast.recruitment.find(r=>positionKey(r.position)===positionKey(input.position)&&r.needMonth===input.needMonth);
      if(row?.lateDays>0&&!text(input.temporary))throw new Error('Tuyển dự kiến trễ: cần nhập phương án tạm.');
      const saved=plan.recruitments.find(r=>positionKey(r.position)===positionKey(input.position)&&r.needMonth===input.needMonth),old=db.workforcePlan?.recruitments?.find(r=>positionKey(r.position)===positionKey(input.position)&&r.needMonth===input.needMonth);
      saved.history=[...(old?.history||[]),...(old?.status!==saved.status?[{status:saved.status,at:new Date().toISOString(),actor:req.deliveryUser?.email||'local'}]:[])];
    }
    if (!writeDb({ ...db, workforcePlan: plan })) return res.status(500).json({ success: false, message: 'Không lưu được kế hoạch. Vui lòng thử lại.' });
    return res.json({ success: true, data: plan });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}
