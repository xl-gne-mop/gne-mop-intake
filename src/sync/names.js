// Drive names (STAGE_MAP §2, artifact mop.js:138-139): "MOP-### <title>" folder (max 120), "MOP-### rev N <title><suffix>.docx".
const pad = n => String(n).padStart(2, '0');
export const mop3 = n => String(n || 0).padStart(3, '0');
export const fileDate = d => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${String(d.getFullYear()).slice(2)}`;
export const mopFolderName = (mopNo, title) => `MOP-${mop3(mopNo)} ${title || 'Untitled'}`.slice(0, 120);
export const mopFileName = (mopNo, rev, title, suffix = '') => `MOP-${mop3(mopNo)} rev ${rev} ${title || 'Untitled'}${suffix}.docx`;
export const approvedSuffix = d => `_Approved ${fileDate(d)}`;
export const completedSuffix = d => `_Completed ${fileDate(d)}`;
export const driveLink = id => `https://drive.google.com/file/d/${id}/view`;
