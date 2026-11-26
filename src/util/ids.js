// Random ids. crypto.randomUUID is in every supported browser (iOS 15.4+, Chrome 92+).
export const newId = (prefix = '') => prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
