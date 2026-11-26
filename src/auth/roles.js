// Editors are the emails listed in lists.json "editors" (case-insensitive). Everyone else is a field user.
export const isEditor = (email, editors = []) => !!email && editors.map(e => String(e).trim().toLowerCase()).includes(String(email).trim().toLowerCase());
