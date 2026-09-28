import { readDb } from '../models/db.js';

/**
 * Controller Thống Kê & Báo Cáo Hiệu Suất (Dashboard & Analytics)
 * Tổng hợp toàn diện tiến độ các công việc trong dự án, nhân viên đảm nhận,
 * thời gian hoàn thành, tình trạng nhanh/chậm và giờ tăng ca.
 */

export function getStats(req, res) {
  const db = readDb();
  const employees = db.employees || [];
  const tasks = db.tasks || [];
  const overtimes = db.overtimes || [];
  const projects = db.projects || [];
  const ganttItems = db.ganttItems || [];

  // Thống kê nhân sự on-site
  const totalEmployees = employees.length;
  const onSiteEmployees = employees.filter(e => e.isOnSite).length;

  // Thống kê tasks
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const delayedTasks = tasks.filter(t => t.speedStatus === 'delayed').length;
  const earlyTasks = tasks.filter(t => t.speedStatus === 'early').length;
  const onTimeTasks = tasks.filter(t => t.speedStatus === 'on_time').length;

  // Tổng số giờ OT
  const totalOtHours = overtimes.reduce((sum, o) => sum + (Number(o.hours) || 0), 0);

  // Thống kê hiệu suất theo từng nhân viên
  const employeePerformance = employees.map(emp => {
    const empTasks = tasks.filter(t => t.employeeId === emp.id);
    const completed = empTasks.filter(t => t.status === 'completed').length;
    const empOt = overtimes
      .filter(o => o.employeeId === emp.id)
      .reduce((sum, o) => sum + (Number(o.hours) || 0), 0);

    const completionRate = empTasks.length > 0 ? Math.round((completed / empTasks.length) * 100) : 0;

    return {
      id: emp.id,
      name: emp.name,
      title: emp.title,
      team: emp.team,
      avatar: emp.avatar,
      isOnSite: emp.isOnSite,
      totalAssignedTasks: empTasks.length,
      completedTasks: completed,
      completionRate,
      otHours: Math.round(empOt * 10) / 10
    };
  });

  // Tiến độ từng dự án
  const projectSummaries = projects.map(proj => {
    const projTasks = tasks.filter(t => t.projectId === proj.id);
    const completed = projTasks.filter(t => t.status === 'completed').length;
    const rate = projTasks.length > 0 ? Math.round((completed / projTasks.length) * 100) : proj.progress;

    return {
      id: proj.id,
      name: proj.name,
      code: proj.code,
      manager: proj.manager,
      startDate: proj.startDate,
      endDate: proj.endDate,
      totalTasks: projTasks.length,
      completedTasks: completed,
      progressRate: rate
    };
  });

  return res.json({
    success: true,
    data: {
      overview: {
        totalProjects: projects.length,
        totalEmployees,
        onSiteEmployees,
        totalTasks,
        completedTasks,
        inProgressTasks,
        delayedTasks,
        earlyTasks,
        onTimeTasks,
        totalOtHours: Math.round(totalOtHours * 10) / 10,
        overallCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 45
      },
      employeePerformance,
      projectSummaries
    }
  });
}
