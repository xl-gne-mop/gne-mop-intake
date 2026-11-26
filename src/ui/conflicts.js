// "Needs editor review" cards (PROMPT.md Conflicts): the same field was changed on this phone and in the tracker,
// Smartsheet or the Drive copy of the request. Nothing was overwritten. An editor picks which value stays; the next
// sync writes it once. Everyone else sees the card and is asked to tell an editor.
import { S, esc } from '../core/state.js';
import { STAGE_MAP } from '../sync/stageMap.js';

const TRACKER = STAGE_MAP.tracker.columns;
const fieldName = c => (c.where.startsWith('tracker') ? `${TRACKER[c.field] || c.field} (column ${c.field})` : c.field.replace(/^record\.|^meta\./, ''));
const placeName = c => (c.where.startsWith('tracker') ? 'the tracker' : c.where.startsWith('Smartsheet') ? 'Smartsheet' : 'Drive');
const show = v => esc((String(v ?? '').trim() || '(empty)').slice(0, 400)); // cut before escaping, never inside an &entity;

export function conflictCards(requestId) {
  const list = (S.conflicts || []).filter(c => !requestId || c.requestId === requestId);
  if (!list.length) return '';
  const cards = list.map(c => `<div class="conflict" data-conflict="${esc(c.key)}">
    <p><b>${esc(fieldName(c))}</b>${requestId ? '' : ` · <a href="#r-${esc(c.requestId)}">${esc((S.reqs[c.requestId] && (S.reqs[c.requestId].sub || S.reqs[c.requestId]).record.title) || 'Request')}</a>`}</p>
    <dl class="kv"><dt>On this phone</dt><dd>${show(c.local)}</dd><dt>In ${esc(placeName(c))}</dt><dd>${show(c.remote)}</dd></dl>
    ${S.canEdit ? `<div class="wnav"><button class="btn" type="button" data-a="cf-mine" data-id="${esc(c.requestId)}" data-k="${esc(c.key)}">Keep this phone's</button><button class="btn" type="button" data-a="cf-theirs" data-id="${esc(c.requestId)}" data-k="${esc(c.key)}">Keep ${esc(placeName(c))}'s</button></div>` : '<p class="small">Ask an editor (JK) to choose. Nothing was overwritten.</p>'}
  </div>`).join('');
  return `<section class="note conflicts" aria-label="Needs editor review"><h2>Needs editor review</h2><p class="small">This was changed in two places. Nothing was overwritten.</p>${cards}</section>`;
}
