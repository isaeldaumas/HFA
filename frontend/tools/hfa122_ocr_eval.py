#!/usr/bin/env python3
"""HFA #122: offline OCR quality measurement; no uploads or scientific certification."""
from __future__ import annotations
import argparse
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import sys
import unicodedata

KINDS = {'scanned_pdf':('.pdf',),'png':('.png',),
         'jpeg':('.jpg','.jpeg'),'webp':('.webp',)}
MAX_ORIGINAL = 30_000_000
MAX_TRANSCRIPT = 2_000_000

class InvalidEvidence(ValueError):
    pass

def normalize(text: str, mode: str) -> str:
    text=unicodedata.normalize('NFC',text).replace('\r\n','\n').replace('\r','\n')
    return ' '.join(text.split()) if mode=='whitespace' else text

def edits(a, b):
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

def verify_original(root:Path,case:dict)->None:
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

def text_from(root:Path,path:str,expected:str)->str:
    candidate=safe_path(root,path,('.txt',))
    if not 1<=candidate.stat().st_size<=MAX_TRANSCRIPT:
        raise InvalidEvidence('Transcript size invalid')
    data=candidate.read_bytes()
    if sha256(data).hexdigest()!=expected:
        raise InvalidEvidence('Transcript SHA mismatch')
    try: return data.decode('utf-8',errors='strict')
    except UnicodeError as exc: raise InvalidEvidence('Transcript not UTF-8') from exc

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
        verify_original(root,case)
        reference=text_from(root,case.get('reference_path'),case['reference_sha256'])
        result=text_from(root,case.get('ocr_path'),case['ocr_sha256'])
        item={'id':ident,'kind':kind,'sampling_stratum':case['sampling_stratum'],
              'source_document_sha256':case['source_document_sha256'],
              'ocr_engine_version':case['ocr_engine_version']}
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
            'cases':[{'id':row['id'],'kind':row['kind'],
                      'sampling_stratum':row['sampling_stratum'],
                      'source_document_sha256':row['source_document_sha256'],
                      'ocr_engine_version':row['ocr_engine_version'],
                      'strict_CER':round(row['strict']['character_edits']/row['strict']['reference_characters'],6),
                      'strict_WER':round(row['strict']['word_edits']/row['strict']['reference_words'],6),
                      'whitespace_CER':round(row['whitespace']['character_edits']/row['whitespace']['reference_characters'],6),
                      'whitespace_WER':round(row['whitespace']['word_edits']/row['whitespace']['reference_words'],6)}
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
    if args.out: args.out.write_text(output,encoding='utf-8')
    else: print(output,end='')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
