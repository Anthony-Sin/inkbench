// DesignSpec: the JSON contract between the agent and the workbench.
// LLM emits this; cad/ renders it; verify/ tests it. No fake fields —
// every number here is used for real geometry or real checks.
// {
//   "name": str,
//   "units": "mm",
//   "materials": { "steel": {"density": 7850, "color": "#8a9099"}, ... },
//   "parts": [ { "id": str, "shape": "box|cylinder|sphere|cone|capsule|extrude",
//                "size": [w,h,d] | {r,h} | {points:[[x,y]..], h},
//                "material": key, "position": [x,y,z], "rotation": [rx,ry,rz] } ],
//   "joints": [ { "a": partId, "b": partId, "type": "fixed|revolute|prismatic",
//                 "axis": [x,y,z], "anchor": [x,y,z] } ],
//   "assembly": [ { "part": partId, "insert_from": [dx,dy,dz] } ],  // ordered
//   "tests":  { "min_clearance_mm": 0.5, "max_tip_angle_deg": 12 }
// }
export const SCHEMA_DOC = `See src/spec.js header — JSON with materials, parts[], joints[], assembly[], tests.`;
export function validateSpec(s){ const errs=[]; if(!s||typeof s!=='object') return ['not object']; if(!Array.isArray(s.parts)||!s.parts.length) errs.push('parts empty'); (s.parts||[]).forEach((p,i)=>{ if(!p.id) errs.push('part '+i+' no id'); if(!p.shape) errs.push((p.id||i)+' no shape'); }); const ids=new Set((s.parts||[]).map(p=>p.id)); (s.assembly||[]).forEach((a,i)=>{ if(!ids.has(a.part)) errs.push('assembly '+i+' unknown part '+a.part); }); return errs; }

// normalizeSpec — coerce common LLM output quirks into the strict schema.
// LLMs emit size:[x,y,z] for cylinders too; treat [x,y,z] on round shapes as
// diameter x, diameter y, height z -> {r, h}.
export function normalizeSpec(s){
  const p2 = (s.parts||[]).map(p => {
    const sh = (p.shape||'').toLowerCase();
    let size = p.size;
    if (Array.isArray(size)) {
      if (sh === 'box') size = size.slice(0,3);
      else if (sh === 'sphere') size = { r: size[0]/2 };
      else if (['cylinder','cone','capsule'].includes(sh)) size = { r: Math.max(size[0],size[1])/2, h: size[2] };
      else size = { r: size[0]/2, h: size[2]||size[0] };
    }
    return { ...p, shape: sh, size, position: p.position||[0,0,0], rotation: p.rotation||[0,0,0] };
  });
  const s2 = { ...s, parts: p2, joints: s.joints||[], assembly: s.assembly&&s.assembly.length?s.assembly:p2.map((p,i)=>i===0?{part:p.id,insert_from:[0,0,-1]}:{part:p.id,insert_from:[0,0,1]}), materials: s.materials||{}, tests: s.tests||{} };
  // guard: LLMs sometimes emit degenerate vectors
  for (const a of s2.assembly) {
    const v = a.insert_from || [0,0,0];
    if (!Array.isArray(v) || v.some(x=>typeof x!=='number'||!isFinite(x)) || Math.hypot(...v) < 1e-6) a.insert_from = [0,0,1];
  }
  for (const j of s2.joints) {
    const v = j.axis || [0,0,0];
    if (!Array.isArray(v) || Math.hypot(...v) < 1e-6) j.axis = [0,0,1];
  }
  return s2;
}
