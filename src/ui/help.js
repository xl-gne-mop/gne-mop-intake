// In-app Help: a short version of the foreman quick guide (Rebuild 5 vHelp, r5:462) with a link to the full
// offline guide (help/index.html: large text, a picture for each step).
export function vHelp() {
  return `<div class="sheet help"><h2>Foreman quick guide</h2>
  <p><a class="btn pri" href="help/index.html">Open the full guide (works without signal)</a></p>
  <ol class="helpsteps">
   <li><b>New request.</b> Pick the project. Your name and crew fill in from last time.</li>
   <li><b>Work.</b> Say or type what, where, which equipment, why, how long and what goes down. The prompts tick green. Tap <b>Looks right</b> to fill the fields; tap <b>+ LOTO point</b> on a tag.</li>
   <li><b>LOTO.</b> For each isolation point add a photo and mark it up. Not sure of an answer? Tap <b>Don't know</b> – the XL PM checks it.</li>
   <li><b>Review → Submit.</b> Fix anything in red, then Submit. It saves on the phone first and syncs when there is signal.</li>
   <li><b>After the job.</b> Tick the close-out list and answer the three questions.</li>
  </ol>
  <h2>Start from an existing MOP</h2>
  <ol class="helpsteps">
   <li>On the main screen tap <b>Start from an existing MOP</b>. Take photos of a paper MOP, or choose a file (PDF, Word, Excel, PowerPoint, email). On Android you can also <b>Share</b> a file to MOP Intake.</li>
   <li>The phone reads it – nothing is sent anywhere. Photos and scans need the <b>scan reader</b> (a 6 MB download, best on Wi-Fi).</li>
   <li><b>Check what we found.</b> Green ✓ looks right, amber ⚠ needs a look, grey was not in the file. Tap <b>Use</b>, <b>Fix</b> or <b>Skip</b>. <b>Show me where</b> shows the spot in the file.</li>
   <li><b>Safety items</b> (red border: LOTO points, energy, who checks zero energy, impairment, fire watch, hot work, back-out, return to service…) are never pre-ticked. Confirm them one at a time. Until you do, the MOP can’t be submitted or printed.</li>
   <li>Then finish the draft as usual. The original file and a record of what you checked are filed with the MOP.</li>
  </ol></div>`;
}
