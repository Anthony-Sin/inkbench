// Agent: prompt -> DesignSpec via Meta Model API (through server proxy).
export async function design(promptText, feedback){
  const sys = { role:'system', content:
    'You are a mechanical CAD agent. Output ONLY a JSON object matching this schema: '+
    'name (short title like "Desk lamp"), units:"mm", '+
    'materials{name:{density (kg/m3),color:"#hex"}}, parts[{id,shape:"box|cylinder|sphere|cone|capsule|extrude",'+
    'size:[w,h,d] or {r,h} or {points:[[x,y],...],h}, material (a materials key), position[x,y,z], rotation[x,y,z]}],'+
    'joints[{a,b,type:"fixed|revolute|prismatic",axis,anchor}], '+
    'assembly[{part,insert_from:[dx,dy,dz]}] ordered by insertion (first part = base/anchor), '+
    'tests{min_clearance_mm,max_tip_angle_deg}. '+
    'ALWAYS include a real materials map with plausible densities and muted hand-inked colors '+
    '(e.g. steel #8a9099, aluminum #b8bcc0, brass #c9a86a, plastic #d9cfae, wood #a08155). '+
    'Units mm, z-up, base at z=0. Real dimensions only — every number is verified geometrically. '+
    'Buildability rules (the verifier enforces them): non-joined parts must not overlap in 3D; '+
    'each part inserts along its insert_from vector from far away WITHOUT sweeping through '+
    'already-placed parts — order the assembly so early parts never block later insertions '+
    '(stack vertically, insert_from [0,0,1], is safest); keep >=10mm axial clearance around '+
    'revolute/prismatic joint axes — CRITICAL: the two parts of a movable joint must sit '+
    'side-by-side ALONG the joint axis like hinge knuckles or clevis-and-tang, their solids '+
    'separated by >=10mm measured along the axis (a pin overlapping both parts fails — '+
    'parts are solid, there are no drilled holes); keep the mass center inside the base footprint.' };
  const user = { role:'user', content: feedback
    ? `Previous design failed verification:\n${feedback}\nFix the spec and resend. Original request: ${promptText}`
    : `Design this object as buildable parts: ${promptText}` };
  const r = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ messages:[sys,user], json:true }) });
  if(!r.ok) throw new Error('LLM '+r.status+': '+(await r.text()).slice(0,300));
  const data = await r.json();
  const txt = data.choices?.[0]?.message?.content || '';
  return { spec: JSON.parse(txt), raw: txt };
}
