#!/usr/bin/env python3
import hashlib, json, pathlib, re, sys

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')
manifest_path = root / 'QCTP_DAY1_SOURCE_LABELED_SCRIPT_CANDIDATE_REV0.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
errors=[]
parts=[]
for ref in manifest.get('cue_part_refs',[]):
    p=root/ref
    if not p.exists():
        errors.append(f'missing cue part: {ref}')
        continue
    part=json.loads(p.read_text(encoding='utf-8'))
    if part.get('script_id') != manifest.get('script_id'):
        errors.append(f'{ref}: script_id mismatch')
    parts.append(part)
parts.sort(key=lambda x:x.get('part',0))
cues=[c for p in parts for c in p.get('cues',[])]
if manifest.get('duration_seconds')!=1500: errors.append('duration must be 1500')
if manifest.get('release_authority')!='ZERO_RELEASE': errors.append('release authority must remain ZERO_RELEASE')
if manifest.get('advanced_state_claims_authorized') is not False: errors.append('advanced state claims must be false')
if len(cues)!=manifest.get('cue_count'): errors.append(f'cue count mismatch: {len(cues)} vs {manifest.get("cue_count")}')
if sum(c.get('word_count',0) for c in cues)!=manifest.get('total_word_count'): errors.append('word count total mismatch')
starts=[c['start_seconds'] for c in cues]
if starts!=sorted(starts): errors.append('cue starts not sorted')
if len(starts)!=len(set(starts)): errors.append('duplicate cue start')
valid_sources=set(manifest.get('source_records',{}))
script_text='\n'.join(c['spoken_text'] for c in cues)
script_hash=hashlib.sha256(script_text.encode()).hexdigest()
if script_hash!=manifest.get('script_sha256'): errors.append(f'script hash mismatch {script_hash}')
for i,c in enumerate(cues):
    text=c['spoken_text']
    if c['source_id'] not in valid_sources: errors.append(f"{c['cue_id']}: unknown source")
    if hashlib.sha256(text.encode()).hexdigest()!=c.get('text_sha256'): errors.append(f"{c['cue_id']}: text hash mismatch")
    wc=len(re.findall(r"\b[\w’'-]+\b",text))
    if wc!=c.get('word_count'): errors.append(f"{c['cue_id']}: word count mismatch")
    estimated=wc/c['target_wpm']*60
    if estimated>c['max_duration_seconds']+0.25: errors.append(f"{c['cue_id']}: duration estimate exceeds max")
    next_start=cues[i+1]['start_seconds'] if i+1<len(cues) else 1500
    if c['start_seconds']+c['max_duration_seconds']>next_start: errors.append(f"{c['cue_id']}: overlaps next cue")
    if c['start_seconds']>0 and not c.get('pre_cue_marker'): errors.append(f"{c['cue_id']}: missing pre-cue marker")
    if c.get('support_bed')!='continuous_required': errors.append(f"{c['cue_id']}: missing continuous bed")
    t=c['start_seconds']
    if 48<=t<165 and c['source_id']!='TB-ANCHOR-01': errors.append(f"{c['cue_id']}: Bullard authority mismatch")
    if 180<=t<465 and c['source_operation_id']!='HEARTMATH_TO_DISPENZA' and c['source_id']!='HM-QC-01': errors.append(f"{c['cue_id']}: HeartMath authority mismatch")
    if 480<=t<1320 and c['source_operation_id']!='INDUCTION_TO_OPEN_SPACE' and c['source_id']!='JD-SPACE-01': errors.append(f"{c['cue_id']}: Dispenza authority mismatch")
joined=script_text.lower()
for bad in ['four in and six out','inhale through the nose for four','count breaths from one to ten','resource2.heygen.ai']:
    if bad in joined: errors.append(f'legacy or external phrase present: {bad}')
for claim in ['you are in the quantum field','you have reached theta','your body boundaries are gone','you are remote viewing']:
    if claim in joined: errors.append(f'unsupported advanced claim: {claim}')
hm=' '.join(c['spoken_text'].lower() for c in cues if c['source_id']=='HM-QC-01')
for phrase in ['heart','five','comfortable','appreciation','care']:
    if phrase not in hm: errors.append(f'HeartMath section missing {phrase}')
if 'hold' in hm: errors.append('HeartMath section prescribes a hold')
for op in ['BULLARD_TO_HEARTMATH','HEARTMATH_TO_DISPENZA','END_SPATIAL_METHOD']:
    if not any(c['source_operation_id']==op for c in cues): errors.append(f'missing transition {op}')
if errors:
    print('\n'.join('FAIL: '+e for e in errors))
    raise SystemExit(1)
print(json.dumps({
    'result':'PASS','script_id':manifest['script_id'],'script_sha256':script_hash,
    'cue_parts':len(parts),'cue_count':len(cues),'total_word_count':sum(c['word_count'] for c in cues),
    'duration_seconds':1500,'sources':sorted(valid_sources),
},indent=2))
