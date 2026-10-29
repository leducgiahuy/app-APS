import { DEFAULT_PARAMS, companyAdmin } from '../../../frontend/src/utils/operationsDefaults.js';
export const emptyOperations = () => ({version:1,revision:0,params:structuredClone(DEFAULT_PARAMS),members:[],budgets:[],expenseRequests:[],paymentRequests:[],otRequests:[],attendance:[],unlocks:[],checks:[],cashForecasts:[],syncEvents:[],notifications:[],policyReads:[],companyImports:[],audit:[]});
// Bảng phân quyền cũ (operations.matrix) đã bỏ: dữ liệu cũ / bản sao lưu còn trường này thì tự xóa, lần ghi kế tiếp sẽ không còn.
export const operations = db => { if (db.operations?.matrix) delete db.operations.matrix; return {...emptyOperations(),...db.operations,params:{...DEFAULT_PARAMS,...db.operations?.params}}; };
export function projectActor(db,user,projectId) {
 if(!projectId || companyAdmin(user.role))return user;
 const members=(db.operations?.members || []).filter(row=>row.projectId===projectId && !row.deletedAt);
 const member=members.find(row=>row.email===user.email);
 if(member)return {...user,role:member.role,employeeId:member.employeeId || user.employeeId,companyRole:user.role};
 if(members.length && !['accountant','chiefAccountant'].includes(user.role))return null;
 return user; // Existing projects keep their existing access until memberships are configured.
}
export const stamp = user => ({updatedBy:user.email,updatedAt:new Date().toISOString()});
