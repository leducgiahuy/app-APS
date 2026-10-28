import { getOperations, mutateOperations, previewProject, getOperationsNotifications } from '../controllers/operationsController.js';
import express from 'express';
import { deliveryLogin, deliveryUsers, requireDeliveryUser } from '../utils/deliveryAuth.js';
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

const router = express.Router();
router.post('/delivery/session', deliveryLogin);
router.post('/delivery/project-preview', requireDeliveryUser, previewProject);
router.get('/delivery/notifications',requireDeliveryUser,getOperationsNotifications);
router.get('/delivery/operations', requireDeliveryUser, getOperations);
router.patch('/delivery/operations', requireDeliveryUser, mutateOperations);
router.get('/delivery/users', requireDeliveryUser, deliveryUsers);
router.post('/delivery/users', requireDeliveryUser, deliveryUsers);
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
router.get('/workforce-plan', getWorkforcePlan);
router.patch('/workforce-plan', updateWorkforcePlan);

// === NHẬT KÝ HOẠT ĐỘNG ===
router.get('/activity', getActivityLog);
router.post('/activity', createActivityLogEntry);
router.delete('/activity', clearActivityLogEntries);

// === PHÂN HỆ 1: NHÂN SỰ & CÔNG TRƯỜNG ===
router.get('/employees', getEmployees);
router.post('/employees', createEmployee);
router.patch('/employees/:id', updateEmployee);
router.patch('/employees/:id/toggle-onsite', toggleOnSite);
router.patch('/employees/:id/toggle-break', toggleBreak);
router.patch('/employees/:id/active-task', setActiveTask);
router.delete('/employees/:id', deleteEmployee);

// === PHÂN HỆ 2: PHÂN CÔNG & TĂNG CA ===
router.get('/tasks', getTasks);
router.post('/tasks', createTask);
router.patch('/tasks/:id', updateTask);
router.delete('/tasks/:id', deleteTask);
router.post('/overtimes', createOvertime);
router.delete('/overtimes/:id', deleteOvertime);

// === PHÂN HỆ 3: DỰ ÁN & TIẾN ĐỘ GANTT ===
router.get('/projects', getProjects);
router.post('/projects', createProject);
router.patch('/projects/:id', updateProject);
router.delete('/projects/:id', deleteProject);
router.get('/gantt', getGanttItems);
router.post('/gantt', createGanttItem);
router.patch('/gantt/:id', updateGanttItem);
router.patch('/gantt/:id/move', moveGanttItem);
router.delete('/gantt/:id', deleteGanttItem);

// === PHÂN HỆ 4: THỐNG KÊ & BÁO CÁO ===
router.get('/stats', getStats);

export default router;
