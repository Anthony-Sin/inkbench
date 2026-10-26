window.DATA = {
 "brief": "a desk lamp with a heavy round base, an articulated arm, and a tiltable shade",
 "attempts": 1,
 "spec": {
  "name": "Desk lamp",
  "units": "mm",
  "materials": {
   "steel": {
    "density": 7850,
    "color": "#8a9099"
   },
   "aluminum": {
    "density": 2700,
    "color": "#b8bcc0"
   },
   "plastic": {
    "density": 1200,
    "color": "#d9cfae"
   }
  },
  "parts": [
   {
    "id": "base",
    "shape": "cylinder",
    "size": {
     "r": 80,
     "h": 25
    },
    "material": "steel",
    "position": [
     0,
     0,
     12.5
    ],
    "rotation": [
     0,
     0,
     0
    ]
   },
   {
    "id": "post",
    "shape": "box",
    "size": [
     30,
     20,
     170
    ],
    "material": "aluminum",
    "position": [
     0,
     -16,
     110
    ],
    "rotation": [
     0,
     0,
     0
    ]
   },
   {
    "id": "lower_arm",
    "shape": "box",
    "size": [
     24,
     20,
     220
    ],
    "material": "aluminum",
    "position": [
     0,
     16,
     300
    ],
    "rotation": [
     0,
     0,
     0
    ]
   },
   {
    "id": "upper_arm",
    "shape": "box",
    "size": [
     20,
     20,
     200
    ],
    "material": "aluminum",
    "position": [
     0,
     -16,
     500
    ],
    "rotation": [
     0,
     0,
     0
    ]
   },
   {
    "id": "shade",
    "shape": "cone",
    "size": {
     "r": 55,
     "h": 90
    },
    "material": "plastic",
    "position": [
     40,
     60,
     620
    ],
    "rotation": [
     0,
     20,
     0
    ]
   }
  ],
  "joints": [
   {
    "a": "base",
    "b": "post",
    "type": "fixed",
    "axis": [
     0,
     0,
     1
    ],
    "anchor": [
     0,
     -16,
     25
    ]
   },
   {
    "a": "post",
    "b": "lower_arm",
    "type": "revolute",
    "axis": [
     0,
     1,
     0
    ],
    "anchor": [
     0,
     0,
     192.5
    ]
   },
   {
    "a": "lower_arm",
    "b": "upper_arm",
    "type": "revolute",
    "axis": [
     0,
     1,
     0
    ],
    "anchor": [
     0,
     0,
     405
    ]
   },
   {
    "a": "upper_arm",
    "b": "shade",
    "type": "revolute",
    "axis": [
     0,
     1,
     0
    ],
    "anchor": [
     0,
     0,
     590
    ]
   }
  ],
  "assembly": [
   {
    "part": "base",
    "insert_from": [
     0,
     0,
     1
    ]
   },
   {
    "part": "post",
    "insert_from": [
     0,
     0,
     1
    ]
   },
   {
    "part": "lower_arm",
    "insert_from": [
     0,
     0,
     1
    ]
   },
   {
    "part": "upper_arm",
    "insert_from": [
     0,
     0,
     1
    ]
   },
   {
    "part": "shade",
    "insert_from": [
     0,
     0,
     1
    ]
   }
  ],
  "tests": {
   "min_clearance_mm": 5,
   "max_tip_angle_deg": 20
  }
 },
 "report": {
  "pass": true,
  "checks": [
   {
    "name": "spec sanity",
    "status": "pass",
    "detail": "ok — 5 parts, 4 joints",
    "measured": 0,
    "failures": [],
    "fatal": false
   },
   {
    "name": "collision",
    "status": "pass",
    "detail": "no interpenetration across 5 parts",
    "measured": 0,
    "failures": []
   },
   {
    "name": "stability",
    "status": "pass",
    "measured": 76.185,
    "detail": "CoM=(1.3,3.4,95.2)mm mass=5.064kg support={base} hull=51pt/20049mm² tip-margin=76.19mm",
    "failures": []
   },
   {
    "name": "assembly order",
    "status": "pass",
    "measured": 0,
    "detail": "all 5 parts insert cleanly along their insert_from directions",
    "failures": [],
    "order": [
     "base",
     "post",
     "lower_arm",
     "upper_arm",
     "shade"
    ]
   },
   {
    "name": "clearance",
    "status": "pass",
    "measured": 11.121,
    "detail": "min_clearance_mm=5 — 'post~lower_arm' (revolute): 12.00mm [ok] axis-gap 12.00 surf 12.00 | 'lower_arm~upper_arm' (revolute): 12.00mm [ok] axis-gap 12.00 surf 12.00 | 'upper_arm~shade' (revolute): 11.12mm [ok] axis-gap 13.80 surf 11.12",
    "failures": []
   }
  ],
  "failures": [],
  "explodedOrder": [
   "base",
   "post",
   "lower_arm",
   "upper_arm",
   "shade"
  ],
  "timingMs": 48.2
 },
 "plan": [
  {
   "kind": "place",
   "step": 1,
   "part": "base",
   "arm": "A",
   "heavy": false,
   "glyph": "↑",
   "insert_from": [
    0,
    0,
    1
   ],
   "seat": [
    0,
    0,
    12.5
   ],
   "massG": 3945.84037290878
  },
  {
   "kind": "place",
   "step": 2,
   "part": "post",
   "arm": "B",
   "heavy": false,
   "glyph": "↑",
   "insert_from": [
    0,
    0,
    1
   ],
   "seat": [
    0,
    -16,
    110
   ],
   "massG": 275.4
  },
  {
   "kind": "joint",
   "type": "fixed",
   "a": "base",
   "b": "post",
   "axis": [
    0,
    0,
    1
   ],
   "anchor": [
    0,
    -16,
    25
   ],
   "late": false
  },
  {
   "kind": "place",
   "step": 3,
   "part": "lower_arm",
   "arm": "A",
   "heavy": false,
   "glyph": "↑",
   "insert_from": [
    0,
    0,
    1
   ],
   "seat": [
    0,
    16,
    300
   ],
   "massG": 285.12
  },
  {
   "kind": "joint",
   "type": "revolute",
   "a": "post",
   "b": "lower_arm",
   "axis": [
    0,
    1,
    0
   ],
   "anchor": [
    0,
    0,
    192.5
   ],
   "late": false
  },
  {
   "kind": "place",
   "step": 4,
   "part": "upper_arm",
   "arm": "B",
   "heavy": false,
   "glyph": "↑",
   "insert_from": [
    0,
    0,
    1
   ],
   "seat": [
    0,
    -16,
    500
   ],
   "massG": 216
  },
  {
   "kind": "joint",
   "type": "revolute",
   "a": "lower_arm",
   "b": "upper_arm",
   "axis": [
    0,
    1,
    0
   ],
   "anchor": [
    0,
    0,
    405
   ],
   "late": false
  },
  {
   "kind": "place",
   "step": 5,
   "part": "shade",
   "arm": "B",
   "heavy": false,
   "glyph": "↑",
   "insert_from": [
    0,
    0,
    1
   ],
   "seat": [
    40,
    60,
    620
   ],
   "massG": 342.11943997592846
  },
  {
   "kind": "joint",
   "type": "revolute",
   "a": "upper_arm",
   "b": "shade",
   "axis": [
    0,
    1,
    0
   ],
   "anchor": [
    0,
    0,
    590
   ],
   "late": false
  }
 ],
 "measures": [
  {
   "id": "base",
   "shape": "cylinder",
   "material": "steel",
   "dims": [
    160,
    160,
    25
   ],
   "volMM3": 502654.8245743669,
   "density": 7850,
   "massG": 3945.84037290878
  },
  {
   "id": "post",
   "shape": "box",
   "material": "aluminum",
   "dims": [
    30,
    20,
    170
   ],
   "volMM3": 102000,
   "density": 2700,
   "massG": 275.4
  },
  {
   "id": "lower_arm",
   "shape": "box",
   "material": "aluminum",
   "dims": [
    24,
    20,
    220
   ],
   "volMM3": 105600,
   "density": 2700,
   "massG": 285.12
  },
  {
   "id": "upper_arm",
   "shape": "box",
   "material": "aluminum",
   "dims": [
    20,
    20,
    200
   ],
   "volMM3": 80000,
   "density": 2700,
   "massG": 216
  },
  {
   "id": "shade",
   "shape": "cone",
   "material": "plastic",
   "dims": [
    104.60958596522305,
    110,
    100.42397758003904
   ],
   "volMM3": 285099.53331327374,
   "density": 1200,
   "massG": 342.11943997592846
  }
 ],
 "log": [
  "inkbench ready — describe a part to begin",
  "brief ▸ a desk lamp with a heavy round base, an articulated arm, and a tiltable shade",
  "designing…",
  "model ▸ 5 part(s) in viewport",
  "spec ▸ 5 part(s), 4 joint(s)",
  "report ▸ PASS",
  "verified ✓ (1 attempt)"
 ],
 "figures": [
  {
   "figNum": 1,
   "name": "Desk lamp",
   "parts": 5,
   "joints": 4,
   "attempts": 1,
   "pass": true
  }
 ]
};
