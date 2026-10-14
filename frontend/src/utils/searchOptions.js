export const normalizeOptionSearch = value => String(value || '')
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd');

export function filterSearchOptions(options, query) {
  const terms = normalizeOptionSearch(query).trim().split(/\s+/).filter(Boolean);
  return options.filter(option => {
    const text = normalizeOptionSearch(`${option.code || ''} ${option.label} ${option.searchText || ''}`);
    return terms.every(term => text.includes(term));
  });
}
