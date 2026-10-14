import { DEFAULT_MATRIX, DEFAULT_PARAMS, companyAdmin } from '../../../frontend/src/utils/operationsDefaults.js';
export const emptyOperations = () => ({version:1,revision:0,matrix:structuredClone(DEFAULT_MATRIX),params:structuredClone(DEFAULT_PARAMS),members:[],budgets:[],expenseRequests:[],paymentRequests:[],otRequests:[],attendance:[],unlocks:[],checks:[],cashForecasts:[],syncEvents:[],notifications:[],audit:[]});
export const operations = db => ({...emptyOperations(),...db.operations,params:{...DEFAULT_PARAMS,...db.operations?.params}});
export function projectActor(db,user,projectId) {
 if(!projectId || companyAdmin(user.role))return user;
 const members=(db.operations?.members || []).filter(row=>row.projectId===projectId && !row.deletedAt);
 const member=members.find(row=>row.email===user.email);
 if(member)return {...user,role:member.role,employeeId:member.employeeId || user.employeeId,companyRole:user.role};
 if(members.length && !['accountant','chiefAccountant'].includes(user.role))return null;
 return user; // Existing projects keep their existing access until memberships are configured.
}
export const stamp = user => ({updatedBy:user.email,updatedAt:new Date().toISOString()});
