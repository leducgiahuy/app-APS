export const DEFAULT_PROJECT_TEMPLATE = {
  id: 'aps-industrial-factory-v1',
  name: 'Nhà máy trong KCN',
  baseArea: 12000,
  scopeOptions: [],
  budgetPercents: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  milestones: [],
  items: [
    { id: 'quote-a1', code: 'A1', title: 'Khảo sát, nhiệm vụ thiết kế', requiredPosition: 'KT', assignmentPosition: 'Thiết Kế', startOffset: 0, endOffset: 6, estimatedHours: 64 },
    { id: 'quote-a24', code: 'A2.4', title: 'Thiết kế ý tưởng & quy hoạch TMB', requiredPosition: 'KT', assignmentPosition: 'Thiết Kế', startOffset: 7, endOffset: 21, estimatedHours: 240, dependencies: ['quote-a1'] },
    { id: 'quote-a31', code: 'A3.1', title: 'Thiết kế cơ sở – Kiến trúc', requiredPosition: 'KT', assignmentPosition: 'Thiết Kế', startOffset: 22, endOffset: 45, estimatedHours: 384, dependencies: ['quote-a24'] },
    { id: 'quote-a3kc', code: 'A3.KC', title: 'Thiết kế cơ sở – Kết cấu', requiredPosition: 'KC', assignmentPosition: 'Thiết Kế', startOffset: 22, endOffset: 47, estimatedHours: 416, dependencies: ['quote-a24'] },
    { id: 'quote-a3mep', code: 'A3.MEP', title: 'Thiết kế cơ sở – MEP', requiredPosition: 'MEP', assignmentPosition: 'Thiết Kế', startOffset: 22, endOffset: 46, estimatedHours: 400, dependencies: ['quote-a24'] },
    { id: 'quote-a41', code: 'A4.1', title: 'BVTC – Kiến trúc', requiredPosition: 'KT', assignmentPosition: 'Thiết Kế', startOffset: 48, endOffset: 82, estimatedHours: 560, dependencies: ['quote-a31'] },
    { id: 'quote-a4kc', code: 'A4.KC', title: 'BVTC – Kết cấu', requiredPosition: 'KC', assignmentPosition: 'Thiết Kế', startOffset: 48, endOffset: 101, estimatedHours: 864, dependencies: ['quote-a3kc'] },
    { id: 'quote-a4mep', code: 'A4.MEP', title: 'BVTC – MEP', requiredPosition: 'MEP', assignmentPosition: 'Thiết Kế', startOffset: 48, endOffset: 97, estimatedHours: 800, dependencies: ['quote-a3mep'] },
    { id: 'quote-d1', code: 'D1', title: 'Dự toán, BOQ', requiredPosition: 'DT', assignmentPosition: 'Thiết Kế', startOffset: 98, endOffset: 115, estimatedHours: 288, dependencies: ['quote-a41', 'quote-a4kc', 'quote-a4mep'] },
    { id: 'quote-b0', code: 'B0', title: 'Chấp thuận tổng mặt bằng', requiredPosition: 'PL', assignmentPosition: 'Thiết Kế', startOffset: 116, endOffset: 125, estimatedHours: 160, dependencies: ['quote-d1'] },
    { id: 'quote-b11', code: 'B1.1', title: 'ĐTM – Giấy phép môi trường', requiredPosition: 'PL', assignmentPosition: 'Thiết Kế', startOffset: 126, endOffset: 145, estimatedHours: 320, dependencies: ['quote-b0'] },
    { id: 'quote-b21', code: 'B2.1', title: 'Thẩm duyệt PCCC', requiredPosition: 'PL', assignmentPosition: 'Thiết Kế', startOffset: 146, endOffset: 155, estimatedHours: 160, dependencies: ['quote-b11'] },
    { id: 'quote-b4', code: 'B4', title: 'Giấy phép xây dựng', requiredPosition: 'PL', assignmentPosition: 'Thiết Kế', startOffset: 156, endOffset: 162, estimatedHours: 112, dependencies: ['quote-b21'] },
    { id: 'quote-moi', code: 'MOI', title: 'Quản lý dự án, họp CĐT', requiredPosition: 'QL', assignmentPosition: 'Thiết Kế', startOffset: 163, endOffset: 165, estimatedHours: 48, dependencies: ['quote-b4'] },
  ],
};

export function projectTemplates(db) {
  const configured = db.delivery?.templates || [];
  return configured.some(template => template.id === DEFAULT_PROJECT_TEMPLATE.id)
    ? configured
    : [DEFAULT_PROJECT_TEMPLATE, ...configured];
}
