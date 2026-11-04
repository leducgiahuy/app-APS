import { DEFAULT_PARAMS, companyAdmin } from '../../../frontend/src/utils/operationsDefaults.js';
export const emptyOperations = () => ({version:1,revision:0,params:structuredClone(DEFAULT_PARAMS),members:[],budgets:[],expenseRequests:[],paymentRequests:[],otRequests:[],attendance:[],unlocks:[],checks:[],cashForecasts:[],syncEvents:[],notifications:[],policyReads:[],companyImports:[],audit:[]});
// Dữ liệu của các trang / chức năng đã bỏ (bảng phân quyền cũ matrix, Tài chính, Khách hàng, HR mở rộng…): không còn code đọc / ghi.
// Dữ liệu cũ hoặc bản sao lưu còn các trường này thì tự xóa khi đọc / ghi, để db chỉ giữ dữ liệu web đang dùng.
export const RETIRED_OPERATIONS = ['matrix', 'importBatches', 'rfis', 'releases', 'attendanceExplanations', 'payables', 'debtLogs', 'debtDecisions', 'weeklyFinanceReviews', 'financeProposals', 'companyTargets', 'strategicGoals', 'acceptances', 'handoverRecords', 'commissioningRecords', 'projectSettlements', 'employeeProfiles', 'laborContracts', 'educationRecords', 'leaveRequests', 'fieldCheckins', 'monthlyTimesheets', 'timesheetConfirmations', 'payrollRuns', 'certificates', 'companyAssets', 'recruitmentNeeds', 'probationReviews', 'kpiRules', 'positionKpis', 'kpiScores', 'leaderAdjustments', 'bonusFunds', 'workNorms', 'calendarSuggestions', 'improvementPlans', 'fileActivities', 'prospectiveProjects', 'clientUsers', 'clientApprovalTasks', 'clientThreads', 'clientMessages', 'clientEvents', 'clientRequests', 'clientOtpChallenges', 'clientSessions', 'feedbackCases', 'permitProcedures', 'permitCases', 'calendarImports', 'notificationOutbox'];
export function dropRetiredOperations(db) {
  let changed = false;
  for (const key of RETIRED_OPERATIONS) if (db?.operations && Object.hasOwn(db.operations, key)) { delete db.operations[key]; changed = true; }
  return changed;
}
export const operations = db => { dropRetiredOperations(db); return {...emptyOperations(),...db.operations,params:{...DEFAULT_PARAMS,...db.operations?.params}}; };
export function projectActor(db,user,projectId) {
 if(!projectId || companyAdmin(user.role))return user;
 const members=(db.operations?.members || []).filter(row=>row.projectId===projectId && !row.deletedAt);
 const member=members.find(row=>row.email===user.email);
 if(member)return {...user,role:member.role,employeeId:member.employeeId || user.employeeId,companyRole:user.role};
 if(members.length && !['accountant','chiefAccountant'].includes(user.role))return null;
 return user; // Existing projects keep their existing access until memberships are configured.
}
export const stamp = user => ({updatedBy:user.email,updatedAt:new Date().toISOString()});
