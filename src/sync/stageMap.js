// GENERATED from docs/STAGE_MAP.md by scripts/gen-stage-map.mjs – do not edit by hand.
const deepFreeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

export const STAGE_MAP = deepFreeze({
  "schema": "gne-mop-stage-map",
  "version": 1,
  "stages": [
    {
      "no": 1,
      "name": "1 Requested",
      "status": "Submitted",
      "drive": {
        "kind": "rev",
        "rev": "first"
      },
      "tracker": [
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "H",
        "I",
        "O",
        "P",
        "R",
        "T",
        "U",
        "V",
        "W",
        "X",
        "Y",
        "Z",
        "AA",
        "AB",
        "AC",
        "AD",
        "AE",
        "AF",
        "AG"
      ],
      "smartsheet": {
        "mode": "add",
        "columns": [
          "LOTO Removal?",
          "XL JOB # NAME",
          "Name",
          "Company",
          "LOTO Date Requested",
          "Location",
          "Panel / Equipment",
          "Valve or Circuit to be LOTO'ed",
          "Affected Equipment / Area / Devices from LOTO",
          "Duration of LOTO",
          "Timestamp",
          "Request ID",
          "Stage",
          "Work Scope",
          "Category/Discipline",
          "Priority",
          "System In Use?",
          "Need JLL?",
          "Need Siemens?",
          "Contact Phone",
          "MOP #",
          "MOP Link",
          "Tracker Row",
          "Needs Sync",
          "App Notes"
        ]
      },
      "gates": [
        "gapsEmpty",
        "projectSet"
      ]
    },
    {
      "no": 2,
      "name": "2 Walked",
      "status": "Submitted",
      "drive": null,
      "tracker": [
        "K",
        "L",
        "M",
        "N",
        "AE",
        "AG"
      ],
      "smartsheet": {
        "mode": "update",
        "columns": [
          "Stage"
        ]
      },
      "gates": [
        "walkImpacts",
        "walkUsers",
        "walkPathForward"
      ]
    },
    {
      "no": 3,
      "name": "3 MOP Drafted",
      "status": "Submitted",
      "drive": {
        "kind": "rev",
        "rev": "next"
      },
      "tracker": [
        "B",
        "AE",
        "AF",
        "AG"
      ],
      "smartsheet": {
        "mode": "update",
        "columns": [
          "Stage",
          "MOP Link",
          "App Notes"
        ]
      },
      "gates": [
        "goNoGoAndBackout"
      ]
    },
    {
      "no": 4,
      "name": "4 JLL Request Ready",
      "status": "Submitted",
      "drive": null,
      "tracker": {
        "jll": [
          "Q",
          "R",
          "AE",
          "AG"
        ],
        "noJll": [
          "P",
          "Q",
          "R",
          "AE",
          "AG"
        ]
      },
      "smartsheet": {
        "mode": "update",
        "columns": [
          "Stage",
          "JLL LOTO #"
        ]
      },
      "gates": []
    },
    {
      "no": 5,
      "name": "5 Notified / LOTO Walk",
      "status": "Submitted",
      "drive": {
        "kind": "rev",
        "rev": "next",
        "onlyIf": "needJll"
      },
      "tracker": {
        "jll": [
          "B",
          "J",
          "Q",
          "R",
          "S",
          "AE",
          "AF",
          "AG"
        ],
        "noJll": [
          "J",
          "S",
          "AE",
          "AG"
        ]
      },
      "smartsheet": {
        "mode": "update",
        "columns": [
          "Stage",
          "JLL LOTO #",
          "MOP Link",
          "App Notes"
        ]
      },
      "gates": [
        "impactNotificationSent",
        "lotoWalkDone",
        "jllLotoNoIfJll"
      ]
    },
    {
      "no": 6,
      "name": "6 Out for Approval",
      "status": "Out for approval",
      "drive": null,
      "tracker": [
        "AE",
        "AG"
      ],
      "smartsheet": {
        "mode": "update",
        "columns": [
          "Stage"
        ]
      },
      "gates": [
        "noDontKnow",
        "tier3PeerReview",
        "tier3HoldPoint",
        "tier3SecondCheck",
        "tier3GoNoGoBackout"
      ]
    },
    {
      "no": 7,
      "name": "7 Approved",
      "status": "Approved",
      "drive": {
        "kind": "copy",
        "suffix": "_Approved MM-DD-YY"
      },
      "tracker": [
        "V",
        "W",
        "X",
        "Y",
        "Z",
        "AA",
        "AE",
        "AG"
      ],
      "smartsheet": {
        "mode": "update",
        "columns": [
          "Stage",
          "App Notes"
        ]
      },
      "gates": [
        "allApprovals"
      ]
    },
    {
      "no": 8,
      "name": "8 Campus Notice Sent",
      "status": "Approved",
      "drive": null,
      "tracker": [
        "AB",
        "AE",
        "AG"
      ],
      "smartsheet": {
        "mode": "update",
        "columns": [
          "Stage"
        ]
      },
      "gates": [
        "campusNoticeSent"
      ]
    },
    {
      "no": 9,
      "name": "9 Completed",
      "status": "Closed",
      "drive": {
        "kind": "copy",
        "suffix": "_Completed MM-DD-YY"
      },
      "tracker": [
        "AC",
        "AE",
        "AG"
      ],
      "smartsheet": {
        "mode": "update",
        "columns": [
          "Stage",
          "LOTO Removal?",
          "App Notes"
        ]
      },
      "gates": [
        "workDone",
        "closeOutComplete"
      ]
    }
  ],
  "revisionResubmit": {
    "drive": {
      "kind": "rev",
      "rev": "next"
    },
    "tracker": [
      "B",
      "AF",
      "AG"
    ],
    "smartsheet": [
      "MOP Link",
      "App Notes"
    ],
    "stageIfAtLeast6": "3 MOP Drafted"
  },
  "tracker": {
    "tab": "Operations Impacts",
    "firstRow": 6,
    "lastRow": 93,
    "columns": {
      "A": "Project",
      "B": "MOP #",
      "C": "Category/Discipline",
      "D": "Equipment/Area",
      "E": "System/Area in use?",
      "F": "Scope",
      "G": "Other Alternatives?",
      "H": "Proposed Duration",
      "I": "Priority (H/M/L)",
      "J": "Impact Notification Completed?",
      "K": "Scope Walk Completed?",
      "L": "Downstream Impacts",
      "M": "Impacted Users",
      "N": "Path Forward",
      "O": "Need Siemens Support?",
      "P": "Need JLL Support?",
      "Q": "Submitted JLL Support Request?",
      "R": "LOTO #",
      "S": "LOTO Walk Completed?",
      "T": "Planned Start date and time",
      "U": "Planned End date and time",
      "V": "GNE PM",
      "W": "GNE FOM",
      "X": "JLL",
      "Y": "UTL",
      "Z": "LM",
      "AA": "MOP Approved?",
      "AB": "Campus Notification Sent?",
      "AC": "MOP Completed?",
      "AD": "Request ID",
      "AE": "Stage",
      "AF": "Current MOP Link",
      "AG": "Last Synced"
    }
  },
  "smartsheet": {
    "original": [
      "LOTO Removal?",
      "XL JOB # NAME",
      "Name",
      "Company",
      "LOTO Date Requested",
      "Location",
      "Panel / Equipment",
      "Valve or Circuit to be LOTO'ed",
      "Affected Equipment / Area / Devices from LOTO",
      "Duration of LOTO",
      "Timestamp"
    ],
    "added": [
      "Request ID",
      "Stage",
      "Work Scope",
      "Category/Discipline",
      "Priority",
      "System In Use?",
      "Need JLL?",
      "Need Siemens?",
      "Contact Phone",
      "MOP #",
      "JLL LOTO #",
      "MOP Link",
      "Tracker Row",
      "Needs Sync",
      "App Notes"
    ]
  },
  "drive": {
    "projectFolder": "{projectLabel}",
    "mopFolder": "MOP-{mop3} {title}",
    "mopFolderMax": 120,
    "superseded": "{mopFolder}/Superseded",
    "requestFile": "{mopFolder}/request.json",
    "attachments": "{mopFolder}/Attachments",
    "fileName": "MOP-{mop3} rev {rev} {title}{suffix}.docx",
    "dateFormat": "MM-DD-YY"
  }
});

export const STAGES = STAGE_MAP.stages;
export const STAGE_NAMES = STAGES.map(s => s.name);
export const stageByNo = no => STAGES.find(s => s.no === no) || null;
export const stageNo = name => { const n = parseInt(name, 10); return n >= 1 && n <= 9 ? n : 0; };
