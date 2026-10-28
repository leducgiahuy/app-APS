import { getOperations, mutateOperations, previewProject, getOperationsNotifications } from '../controllers/operationsController.js';
import express from 'express';
import { deliveryChangePassword, deliveryLogin, deliveryUsers, requireDeliveryUser } from '../utils/deliveryAuth.js';
import { deliveryReporting } from '../controllers/deliveryReportingController.js';
import { executiveReport } from '../controllers/executiveController.js';
import { getDeliveryProject, updateDeliveryProject, uploadDeliveryEvidence, downloadDeliveryEvidence, deliveryTemplates } from '../controllers/deliveryController.js';
import { getWorkforcePlan, updateWorkforcePlan } from '../controllers/workforceController.js';
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  toggleOnSite,
  toggleBreak,
  setActiveTask,
  deleteEmployee
} from '../controllers/hrController.js';
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  createOvertime,
  updateOvertime,
  deleteOvertime
} from '../controllers/taskController.js';
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getGanttItems,
  createGanttItem,
  updateGanttItem,
  moveGanttItem,
  deleteGanttItem
} from '../controllers/projectController.js';
import { getStats } from '../controllers/statsController.js';
import { clearActivityLogEntries, createActivityLogEntry, getActivityLog } from '../controllers/activityController.js';
import * as guard from '../utils/routeGuards.js';
import { deleteAccount, listDeletedAccounts, purgeDeletedAccounts, restoreDeletedAccount } from '../utils/deletedAccounts.js';

const router = express.Router();
router.post('/delivery/session', deliveryLogin);
router.post('/delivery/project-preview', requireDeliveryUser, previewProject);
router.get('/delivery/notifications',requireDeliveryUser,getOperationsNotifications);
router.get('/delivery/operations', requireDeliveryUser, getOperations);
router.patch('/delivery/operations', requireDeliveryUser, mutateOperations);
router.get('/delivery/users', requireDeliveryUser, deliveryUsers);
router.post('/delivery/users', requireDeliveryUser, deliveryUsers);
router.post('/delivery/password', requireDeliveryUser, deliveryChangePassword);
router.delete('/delivery/users', requireDeliveryUser, deleteAccount);
router.get('/delivery/users/deleted', requireDeliveryUser, listDeletedAccounts);
router.post('/delivery/users/deleted/:id/restore', requireDeliveryUser, restoreDeletedAccount);
router.delete('/delivery/users/deleted', requireDeliveryUser, purgeDeletedAccounts);
router.delete('/delivery/users/deleted/:id', requireDeliveryUser, purgeDeletedAccounts);
router.get('/delivery/templates', requireDeliveryUser, deliveryTemplates);
router.get('/delivery/reporting', requireDeliveryUser, deliveryReporting);
router.post('/delivery/reporting', requireDeliveryUser, deliveryReporting);
router.get('/delivery/executive', requireDeliveryUser, executiveReport);
router.patch('/delivery/executive', requireDeliveryUser, executiveReport);
router.post('/delivery/templates', requireDeliveryUser, deliveryTemplates);
router.get('/delivery/:projectId', requireDeliveryUser, getDeliveryProject);
router.patch('/delivery/:projectId', requireDeliveryUser, updateDeliveryProject);
router.post('/delivery/:projectId/evidence', requireDeliveryUser, uploadDeliveryEvidence);
router.get('/delivery/:projectId/evidence/:fileId', requireDeliveryUser, downloadDeliveryEvidence);
router.use(requireDeliveryUser);
router.get('/workforce-plan', guard.guardViewWorkforce, getWorkforcePlan);
router.patch('/workforce-plan', guard.guardEditWorkforce, updateWorkforcePlan);

// === NHẬT KÝ HOẠT ĐỘNG ===
router.get('/activity', getActivityLog);
router.post('/activity', createActivityLogEntry);
router.delete('/activity', clearActivityLogEntries);

// === PHÂN HỆ 1: NHÂN SỰ & CÔNG TRƯỜNG ===
router.get('/employees', getEmployees);
// Mỗi thao tác ghi đi qua guard.* (utils/routeGuards.js) để kiểm theo ma trận phân quyền.
router.post('/employees', guard.guardManageMembers, createEmployee);
router.patch('/employees/:id', guard.guardEditEmployee, updateEmployee);
router.patch('/employees/:id/toggle-onsite', guard.guardAttendance, toggleOnSite);
router.patch('/employees/:id/toggle-break', guard.guardAttendance, toggleBreak);
router.patch('/employees/:id/active-task', guard.guardAttendance, setActiveTask);
router.delete('/employees/:id', guard.guardManageMembers, deleteEmployee);

// === PHÂN HỆ 2: PHÂN CÔNG & TĂNG CA ===
router.get('/tasks', guard.scopeTaskList, getTasks);
router.post('/tasks', guard.guardCreateTask, createTask);
router.patch('/tasks/:id', guard.guardUpdateTask, updateTask);
router.delete('/tasks/:id', guard.guardDeleteTask, deleteTask);
router.post('/overtimes', guard.guardCreateOvertime, createOvertime);
router.patch('/overtimes/:id', guard.guardReviewOvertime, updateOvertime);
router.delete('/overtimes/:id', guard.guardDeleteOvertime, deleteOvertime);

// === PHÂN HỆ 3: DỰ ÁN & TIẾN ĐỘ GANTT ===
router.get('/projects', getProjects);
router.post('/projects', guard.guardCreateProject, createProject);
router.patch('/projects/:id', guard.guardUpdateProject, updateProject);
router.delete('/projects/:id', guard.guardDeleteProject, deleteProject);
router.get('/gantt', getGanttItems);
router.post('/gantt', guard.guardCreateGantt, createGanttItem);
router.patch('/gantt/:id', guard.guardUpdateGantt, updateGanttItem);
router.patch('/gantt/:id/move', guard.guardScheduleGantt, moveGanttItem);
router.delete('/gantt/:id', guard.guardScheduleGantt, deleteGanttItem);

// === PHÂN HỆ 4: THỐNG KÊ & BÁO CÁO ===
router.get('/stats', getStats);

export default router;
