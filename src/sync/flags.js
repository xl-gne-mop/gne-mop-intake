// Sync safety switches (config.js FLAGS). Every switch is ON unless config.js sets it to false, so turning one
// off brings back the earlier behaviour exactly (the rollback for that change, no new build needed beyond config.js).
//   ssCheckBeforeAdd      Smartsheet: look for this request's rows (Request ID + MOP #) before adding rows
//   trackerVerify         Tracker: check column AD is still this request before writing; claim a new row first
//   driveCheckBeforeUpload Drive: tag uploads (appProperties) and look for the file before uploading again
//   driveResumable        Drive: files over 5 MB go by resumable upload (falls back to multipart)
//   retryClasses          Retry only what can succeed later; stop and ask on no-access / not-found / bad data
//   syncPanel             Request page: "Sent to" card with each destination's status
export const FLAG_NAMES = ['ssCheckBeforeAdd', 'trackerVerify', 'driveCheckBeforeUpload', 'driveResumable', 'retryClasses', 'syncPanel'];
export const flagOn = (config, name) => !(config && config.FLAGS && config.FLAGS[name] === false);
