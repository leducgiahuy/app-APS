import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { deliveryApi } from './deliveryApi';

export function useProjectDelivery(projectId, onSharedDataChange) {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const currentProject = useRef(projectId);
  useLayoutEffect(() => { currentProject.current = projectId; }, [projectId]);
  const onSharedDataChangeRef = useRef(onSharedDataChange);
  useLayoutEffect(() => { onSharedDataChangeRef.current = onSharedDataChange; }, [onSharedDataChange]);
  const dataRef = useRef(null);
  const sequence = useRef(0);
  const busy = useRef(false);
  const accept = useCallback((id, value) => { if (id === currentProject.current) { dataRef.current = { projectId: id, value }; setSnapshot({ projectId: id, value }); setError(''); } }, []);
  const refresh = useCallback(async () => {
    if (!projectId || projectId === 'ALL' || busy.current) return;
    const request = ++sequence.current;
    try { const response = await deliveryApi.get(projectId); if (request === sequence.current) accept(projectId, response.data); }
    catch (error) { if (projectId === currentProject.current && request === sequence.current) setError(error.message); }
  }, [projectId, accept]);
  useEffect(() => { refresh(); const timer = setInterval(refresh, 30000); window.addEventListener('focus', refresh); return () => { clearInterval(timer); window.removeEventListener('focus', refresh); sequence.current++; }; }, [refresh]);
  const mutate = async (action, value = {}, taskId, id) => {
    if (busy.current) throw new Error('Đang lưu thao tác trước.');
    if (dataRef.current?.projectId !== projectId) throw new Error('Dữ liệu dự án chưa tải xong.');
    busy.current = true; setSaving(true); sequence.current++;
    try { const response = await deliveryApi.update(projectId, { action, value, taskId, id, revision: dataRef.current.value.revision }); accept(projectId, response.data); if (['task', 'confirm', 'approveTimesheet', 'applyTemplate', 'change', 'changeAppendix', 'revokeEvidence', 'revokeConfirmation'].includes(action)) await onSharedDataChangeRef.current?.(); return response.data; }
    catch (error) { if (error.status === 409) { const latest = await deliveryApi.get(projectId); accept(projectId, latest.data); } throw error; }
    finally { busy.current = false; setSaving(false); }
  };
  const upload = async (taskId, file, kind) => {
    if (busy.current) throw new Error('Đang lưu thao tác trước.');
    busy.current = true; setSaving(true); sequence.current++;
    try { const result = await deliveryApi.upload(projectId, taskId, file, kind); accept(projectId, result.data); return result.evidenceId; }
    finally { busy.current = false; setSaving(false); }
  };
  return { data: snapshot && snapshot.projectId === projectId ? snapshot.value : null, error, saving, refresh, mutate, upload };
}
