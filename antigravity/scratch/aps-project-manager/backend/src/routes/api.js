import express from 'express';
import {
  getEmployees,
  createEmployee,
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

const router = express.Router();

// === PHÂN HỆ 1: NHÂN SỰ & CÔNG TRƯỜNG ===
router.get('/employees', getEmployees);
router.post('/employees', createEmployee);
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
