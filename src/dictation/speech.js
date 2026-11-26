// Web Speech dictation (Rebuild 5 speechShim, r5:478) – only where the browser has it. processLocally = true
// where supported (on-device). Any speech error: "Use the microphone on your keyboard instead"; the text box
// always keeps working, and the parser reads whatever text ends up there (keyboard dictation included).
import { toast } from '../core/state.js';

export const KEYBOARD_MIC = 'Use the microphone on your keyboard instead.';

export function speechShim() {
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition; if (!SR) return null;
  let rec = null, on = false; const fin = [], st = [], tell = s => st.forEach(f => f({ state: s }));
  return {
    active: () => on,
    start: () => new Promise((ok, no) => {
      try {
        rec = new SR(); rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = false;
        if ('processLocally' in rec) rec.processLocally = true;
        rec.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) { const t = ' ' + e.results[i][0].transcript.trim(); fin.forEach(f => f({ text: t })); } };
        rec.onend = () => { on = false; tell('idle'); };
        rec.onerror = () => { on = false; tell('idle'); toast(KEYBOARD_MIC); };
        rec.start(); on = true; tell('listening'); ok();
      } catch (err) { toast(KEYBOARD_MIC); no(err); }
    }),
    stop: () => { try { rec && rec.stop(); } catch { /* already stopped */ } on = false; tell('idle'); return Promise.resolve(); },
    onFinal: f => fin.push(f), onState: f => st.push(f)
  };
}
