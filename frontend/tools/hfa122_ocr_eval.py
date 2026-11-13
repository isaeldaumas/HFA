#!/usr/bin/env python3
"""HFA #122: offline OCR quality measurement; no uploads or scientific certification."""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
from pathlib import Path
import re
import sys
import unicodedata

KINDS = {'scanned_pdf':('.pdf',),'png':('.png',),
         'jpeg':('.jpg','.jpeg'),'webp':('.webp',)}
MAX_ORIGINAL = 30_000_000
MAX_TRANSCRIPT = 2_000_000
# CPU bound for pure-Python Levenshtein; the file-size bound alone is insufficient.
MAX_EDIT_CELLS = 25_000_000

class InvalidEvidence(ValueError):
    pass

def normalize(text: str, mode: str) -> str:
    text=unicodedata.normalize('NFC',text).replace('\r\n','\n').replace('\r','\n')
    return ' '.join(text.split()) if mode=='whitespace' else text

def edits(a, b):
    # Trim identical edges first; near-identical large transcripts remain measurable.
    if a == b:
        return 0
    start = 0
    end = min(len(a), len(b))
    while start < end and a[start] == b[start]:
        start += 1
    if start:
        a, b = a[start:], b[start:]
    end = min(len(a), len(b))
    suffix = 0
    while suffix < end and a[-1-suffix] == b[-1-suffix]:
        suffix += 1
    if suffix:
        a, b = a[:-suffix], b[:-suffix]
    if len(a) * len(b) > MAX_EDIT_CELLS:
        raise InvalidEvidence('Edit distance exceeds offline computation budget; split evidence into independently verified pages')
    if len(a)>len(b): a,b=b,a
    prev=list(range(len(a)+1))
    for i,v in enumerate(b,1):
        cur=[i]
        for j,u in enumerate(a,1):
            cur.append(min(cur[-1]+1,prev[j]+1,prev[j-1]+(u!=v)))
        prev=cur
    return prev[-1]

def safe_path(root:Path,name:str,suffixes:tuple[str,...])->Path:
    if not isinstance(name,str) or not name.strip() or Path(name).is_absolute():
        raise InvalidEvidence('Absolute or empty file path')
    if not name.lower().endswith(suffixes):
        raise InvalidEvidence('Unexpected extension')
    candidate=root/name
    if any(part.is_symlink() for part in (candidate,*candidate.parents) if part!=root.parent):
        raise InvalidEvidence('Symlinked source path')
    resolved=candidate.resolve()
    if not resolved.is_relative_to(root) or not resolved.is_file():
        raise InvalidEvidence('Path traversal or missing file')
    return resolved

def verify_original(root:Path,case:dict)->Path:
    kind=case['kind']
    path=safe_path(root,case.get('original_path'),KINDS[kind])
    if not 1<=path.stat().st_size<=MAX_ORIGINAL:
        raise InvalidEvidence('Original size invalid')
    h=sha256()
    header=b''
    with path.open('rb') as source:
        while block:=source.read(1_048_576):
            if not header: header=block[:16]
            h.update(block)
    if h.hexdigest()!=case['source_document_sha256']:
        raise InvalidEvidence('Original SHA mismatch')
    signature={'scanned_pdf':header.startswith(b'%PDF-'),
               'png':header.startswith(b'\x89PNG\r\n\x1a\n'),
               'jpeg':header.startswith(b'\xff\xd8\xff'),
               'webp':header[:4]==b'RIFF' and header[8:12]==b'WEBP'}[kind]
    if not signature: raise InvalidEvidence('Original signature mismatch')
    return path

def text_from(root:Path,path:str,expected:str)->tuple[str,Path]:
    candidate=safe_path(root,path,('.txt',))
    if not 1<=candidate.stat().st_size<=MAX_TRANSCRIPT:
        raise InvalidEvidence('Transcript size invalid')
    data=candidate.read_bytes()
    if sha256(data).hexdigest()!=expected:
        raise InvalidEvidence('Transcript SHA mismatch')
    try: return data.decode('utf-8',errors='strict'), candidate
    except UnicodeError as exc: raise InvalidEvidence('Transcript not UTF-8') from exc

DATE_RE=re.compile(r'\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b')
REG_RE=re.compile(r'\b(?:P[RTPS]-[A-Z0-9]{3}|N[1-9][0-9]{0,4}[A-Z]{0,2}|[A-Z]{1,2}-[A-Z0-9]{3,5})\b')
NUM_RE=re.compile(r'\b\d+(?:[.,:/-]\d+)*\b')
NEG_RE=re.compile(r'\b(?:não|nao|nunca|jamais|sem|nem|nenhum|nenhuma|not|no|never|without|neither|nor|none)\b',re.IGNORECASE)
AERO_TERMS=frozenset({
    'flaps','flap','trem','pouso','decolagem','arremetida','motor','pane','combustivel','combustível',
    'altimetro','altímetro','velocidade','estol','stall','go-around','gear','runway','pista','torre',
    'atc','metar','ifr','vfr','qnh','altitude','proa','heading','checklist','mayday','pan-pan',
    'gpws','tcas','mel','aog','fod','cfit','loc-i','colisao','colisão','turbulencia','turbulência','gelo','icing',
})
WORD_RE=re.compile(r"[A-Za-zÀ-ÿ0-9-]+")

def _critical_tokens(text:str)->dict[str,Counter[str]]:
    norm=unicodedata.normalize('NFC',text)
    dates=Counter(DATE_RE.findall(norm))
    regs=Counter(REG_RE.findall(norm))
    nums=Counter(NUM_RE.findall(norm))
    negs=Counter(m.lower() for m in NEG_RE.findall(norm))
    aero=Counter(w.lower() for w in WORD_RE.findall(norm) if w.lower() in AERO_TERMS)
    return {'dates':dates,'registrations':regs,'numbers':nums,'negations':negs,'aeronautical_terms':aero}

def critical_discrepancies(reference:str,ocr:str)->dict[str,int]:
    ref_tok=_critical_tokens(reference)
    ocr_tok=_critical_tokens(ocr)
    out:dict[str,int]={}
    total=0
    for cat in ('numbers','dates','registrations','negations','aeronautical_terms'):
        diff=sum((ref_tok[cat]-ocr_tok[cat]).values())+sum((ocr_tok[cat]-ref_tok[cat]).values())
        out[cat]=diff
        total+=diff
    out['total']=total
    return out

def summary(rows:list[dict])->dict:
    result={'n_cases':len(rows)}
    for mode in ['strict','whitespace']:
        values=[r[mode] for r in rows]
        ce=sum(r['character_edits'] for r in values)
        nc=sum(r['reference_characters'] for r in values)
        we=sum(r['word_edits'] for r in values)
        nw=sum(r['reference_words'] for r in values)
        result[mode]={'CER':round(ce/nc,6),'WER':round(we/nw,6),
                      'character_edits':ce,'reference_characters':nc,
                      'word_edits':we,'reference_words':nw}
    return result

def evaluate(manifest_file:Path)->dict:
    manifest_file=manifest_file.resolve(strict=True)
    if not 1<=manifest_file.stat().st_size<=2_000_000:
        raise InvalidEvidence('Manifest size invalid')
    root=manifest_file.parent
    document=json.loads(manifest_file.read_text(encoding='utf-8'))
    if not isinstance(document,dict) or document.get('protocol_version')!='HFA122-OCR-EVAL-2':
        raise InvalidEvidence('Protocol version invalid')
    cases=document.get('cases')
    if not isinstance(cases,list) or not 1<=len(cases)<=1000:
        raise InvalidEvidence('Expected between 1 and 1000 cases')
    rows=[]
    seen=set()
    for case in cases:
        if not isinstance(case,dict):
            raise InvalidEvidence('Invalid case object')
        ident=case.get('id')
        if not isinstance(ident,str) or not 1<=len(ident)<=80 or ident in seen:
            raise InvalidEvidence('Non-unique or invalid case ID')
        seen.add(ident)
        kind=case.get('kind')
        if kind not in KINDS: raise InvalidEvidence('Unsupported source kind')
        for key in ('consent_authorization_id','ground_truth_verified_by',
                    'sampling_stratum','ocr_engine_version'):
            if not isinstance(case.get(key),str) or not case[key].strip():
                raise InvalidEvidence('Missing '+key)
        for key in ('source_document_sha256','reference_sha256','ocr_sha256'):
            value=case.get(key)
            if not isinstance(value,str) or len(value)!=64 or any(c not in '0123456789abcdef' for c in value):
                raise InvalidEvidence('Invalid hash '+key)
        if case.get('reference_path')==case.get('ocr_path'):
            raise InvalidEvidence('Reference and OCR must be independent')
        orig_resolved=verify_original(root,case)
        reference,ref_resolved=text_from(root,case.get('reference_path'),case['reference_sha256'])
        result,ocr_resolved=text_from(root,case.get('ocr_path'),case['ocr_sha256'])
        if ref_resolved==ocr_resolved or orig_resolved in (ref_resolved,ocr_resolved):
            raise InvalidEvidence('Reference, OCR, and original must be distinct files')
        crit=critical_discrepancies(reference,result)
        item={'id':ident,'kind':kind,'sampling_stratum':case['sampling_stratum'],
              'source_document_sha256':case['source_document_sha256'],
              'ocr_engine_version':case['ocr_engine_version'],
              'critical_errors':crit}
        for mode in ['strict','whitespace']:
            ref=normalize(reference,mode)
            ocr=normalize(result,mode)
            rwords,owords=ref.split(),ocr.split()
            if not ref or not rwords:
                raise InvalidEvidence('Empty ground truth')
            item[mode]={'character_edits':edits(ref,ocr),
                        'reference_characters':len(ref),
                        'word_edits':edits(rwords,owords),
                        'reference_words':len(rwords)}
        rows.append(item)
    grouped=defaultdict(list)
    for row in rows:
        grouped[(row['kind'],row['sampling_stratum'])].append(row)
    return {'protocol_version':'HFA122-OCR-EVAL-2',
            'report_type':'MEASUREMENT_ONLY_NOT_INSTITUTIONAL_CERTIFICATION',
            'n_cases':len(rows),'overall':summary(rows),
            'by_kind_and_stratum':{
                kind+' / '+stratum:summary(items)
                for (kind,stratum),items in sorted(grouped.items())
            },
            'critical_errors_total':{
                cat:sum(row['critical_errors'][cat] for row in rows)
                for cat in ('numbers','dates','registrations','negations','aeronautical_terms','total')
            },
            'cases':[{'id':row['id'],'kind':row['kind'],
                      'sampling_stratum':row['sampling_stratum'],
                      'source_document_sha256':row['source_document_sha256'],
                      'ocr_engine_version':row['ocr_engine_version'],
                      'strict_CER':round(row['strict']['character_edits']/row['strict']['reference_characters'],6),
                      'strict_WER':round(row['strict']['word_edits']/row['strict']['reference_words'],6),
                      'whitespace_CER':round(row['whitespace']['character_edits']/row['whitespace']['reference_characters'],6),
                      'whitespace_WER':round(row['whitespace']['word_edits']/row['whitespace']['reference_words'],6),
                      'critical_errors':row['critical_errors']}
                     for row in rows],
            'limitations':['No institutional threshold is defined',
                           'Synthetic documents do not prove real-world OCR quality',
                           'Temporal and causal interpretation requires human review']}

def main()->int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest',type=Path)
    parser.add_argument('--out',type=Path)
    args=parser.parse_args()
    try: result=evaluate(args.manifest)
    except (InvalidEvidence,ValueError,OSError,json.JSONDecodeError) as exc:
        print('EVALUATION_REFUSED: '+str(exc),file=sys.stderr)
        return 2
    output=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if args.out:
        if args.out.is_symlink() or any(p.is_symlink() for p in args.out.parents):
            print('EVALUATION_REFUSED: Output path must not use symlinks',file=sys.stderr)
            return 2
        args.out.write_text(output,encoding='utf-8')
    else: print(output,end='')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
